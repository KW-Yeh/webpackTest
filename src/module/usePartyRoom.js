import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Logger } from './logger';
import {
    applyRestartVote,
    calculateAB,
    compareRaceWins,
    createRestartVote,
    isValidGuess,
} from './partyGame';
import { clearPartyRoom, loadPartyRoom, savePartyRoom } from './partyRoomStorage';
import {
    connectToHost,
    createGuestPeer,
    createHostConnectionPool,
    createHostPeer,
} from './peer';
import {
    createPartyMessage,
    isPartyMessage,
    PARTY_MESSAGE,
    PARTY_MODE,
    PARTY_PHASE,
} from './partyProtocol';

const logger = Logger({ className: 'usePartyRoom' });

const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 20000;
const INITIAL_CONNECTION_TIMEOUT_MS = 10000;
const PENDING_HELLO_TIMEOUT_MS = 10000;
const RECONNECT_GRACE_MS = 60000;
const RECONNECT_RETRY_MS = 3000;
const SIGNALING_RECONNECT_WATCHDOG_MS = 5000;
const RACE_WIN_WINDOW_MS = 500;
const RESTART_VOTE_TIMEOUT_MS = 30000;
const PARTY_SESSION_ID_KEY = 'bulls-cows-party-session-id';

const createSessionId = () => {
    const stored = window.sessionStorage.getItem(PARTY_SESSION_ID_KEY);
    if (stored) return stored;

    const sessionId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.sessionStorage.setItem(PARTY_SESSION_ID_KEY, sessionId);
    return sessionId;
};

const createPublicId = () => window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createRoomCode = () => String(Math.floor(100000 + Math.random() * 900000));

const createInitialGame = () => ({
    target: '',
    startAt: 0,
    coop: { round: 1, submissions: {}, rounds: [] },
    race: { progress: {}, wins: [], result: null },
});

export const usePartyRoom = ({ role, roomID, userName }) => {
    const isHost = role === 'host';
    const sessionIdRef = useRef(createSessionId());
    const hostIdRef = useRef(createPublicId());
    const [selfId, setSelfId] = useState(isHost ? hostIdRef.current : '');
    const [roomCode, setRoomCode] = useState('');
    const [phase, setPhase] = useState(PARTY_PHASE.CONNECTING);
    const [mode, setModeState] = useState(PARTY_MODE.COOP);
    const [roster, setRoster] = useState([]);
    const [messages, setMessages] = useState([]);
    const [game, setGame] = useState(createInitialGame);
    const [coopSubmittedIds, setCoopSubmittedIds] = useState([]);
    const [restartVote, setRestartVote] = useState(null);
    const [notice, setNotice] = useState('');
    const [connectionIssue, setConnectionIssue] = useState(false);
    const [closed, setClosed] = useState(false);
    const [retryKey, setRetryKey] = useState(0);

    const peerRef = useRef(null);
    const hostConnectionRef = useRef(null);
    const poolRef = useRef(null);
    const connectionSessionsRef = useRef(new Map());
    const playerConnectionsRef = useRef(new Map());
    const playersRef = useRef(new Map());
    const sessionPlayersRef = useRef(new Map());
    const playerSessionsRef = useRef(new Map());
    const lastSeenRef = useRef(new Map());
    const removalTimersRef = useRef(new Map());
    const pendingHandshakeTimersRef = useRef(new Map());
    const reconnectTimerRef = useRef(null);
    const reconnectDeadlineRef = useRef(0);
    const initialConnectionTimerRef = useRef(null);
    const hostPeerRetryTimerRef = useRef(null);
    const signalingReconnectTimerRef = useRef(null);
    const hostRebuildRequestedRef = useRef(false);
    const hostSignalingHealthyRef = useRef(false);
    const guestHeartbeatRef = useRef(null);
    const hostHeartbeatRef = useRef(null);
    const raceWindowRef = useRef(null);
    const restartVoteRef = useRef(null);
    const restartTargetRef = useRef('');
    const restartTimerRef = useRef(null);
    const destroyedRef = useRef(false);
    const closedRef = useRef(false);
    const modeRef = useRef(mode);
    const phaseRef = useRef(phase);
    const gameRef = useRef(game);
    const hostRoomCodeRef = useRef('');

    useEffect(() => { modeRef.current = mode; }, [mode]);
    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { gameRef.current = game; }, [game]);
    useEffect(() => { closedRef.current = closed; }, [closed]);

    const updatePhase = useCallback((nextPhase) => {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
    }, []);

    const updateGame = useCallback((nextGame) => {
        gameRef.current = nextGame;
        setGame(nextGame);
    }, []);

    const updateRestartVote = useCallback((nextVote) => {
        restartVoteRef.current = nextVote;
        setRestartVote(nextVote);
    }, []);

    const clearInitialConnectionTimer = useCallback(() => {
        if (!initialConnectionTimerRef.current) return;
        clearTimeout(initialConnectionTimerRef.current);
        initialConnectionTimerRef.current = null;
    }, []);

    const clearPendingHandshakeTimer = useCallback((connection) => {
        const pending = pendingHandshakeTimersRef.current.get(connection?.peer);
        if (!pending || pending.connection !== connection) return false;
        clearTimeout(pending.timer);
        pendingHandshakeTimersRef.current.delete(connection.peer);
        return true;
    }, []);

    const scheduleGuestRetry = useCallback((connection, failureNotice) => {
        if (destroyedRef.current || closedRef.current || isHost) return;
        if (connection && hostConnectionRef.current && hostConnectionRef.current !== connection) return;

        clearInitialConnectionTimer();
        if (!connection || hostConnectionRef.current === connection) hostConnectionRef.current = null;
        setConnectionIssue(true);
        setNotice(failureNotice);
        try {
            connection?.close();
        } catch (error) {
            logger.error('Guest connection cleanup failed', error);
        }

        const now = Date.now();
        if (!reconnectDeadlineRef.current) reconnectDeadlineRef.current = now + RECONNECT_GRACE_MS;
        if (now >= reconnectDeadlineRef.current) {
            closedRef.current = true;
            setClosed(true);
            setNotice('重新連線逾時，請返回大廳。');
            return;
        }
        if (reconnectTimerRef.current) return;
        reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!destroyedRef.current && !closedRef.current) setRetryKey((key) => key + 1);
        }, RECONNECT_RETRY_MS);
    }, [clearInitialConnectionTimer, isHost]);

    const sendConnection = useCallback((connection, type, payload = {}) => {
        if (!connection?.open) return false;
        try {
            connection.send(createPartyMessage(type, payload));
            return true;
        } catch (error) {
            logger.error('Party message send failed', error);
            return false;
        }
    }, []);

    const broadcast = useCallback((type, payload = {}, options) => {
        poolRef.current?.broadcast(createPartyMessage(type, payload), options);
    }, []);

    const rosterSnapshot = useCallback(() => Array.from(playersRef.current.values()), []);

    const publishRoster = useCallback((targetConnection = null) => {
        const players = rosterSnapshot();
        const payload = {
            players,
            mode: modeRef.current,
            hostId: hostIdRef.current,
        };
        setRoster(players);
        if (targetConnection) sendConnection(targetConnection, PARTY_MESSAGE.ROSTER, payload);
        else broadcast(PARTY_MESSAGE.ROSTER, payload);
    }, [broadcast, rosterSnapshot, sendConnection]);

    const appendChat = useCallback((message) => {
        setMessages((current) => [...current, message].slice(-100));
    }, []);

    const createSyncPayload = useCallback((recipientId = null) => {
        const currentGame = gameRef.current;
        const submissions = Object.fromEntries(Object.keys(currentGame.coop.submissions).map((id) => [id, { id }]));
        return {
            ...(recipientId ? { selfId: recipientId } : {}),
            phase: phaseRef.current,
            mode: modeRef.current,
            game: {
                ...currentGame,
                coop: { ...currentGame.coop, submissions },
            },
            restartVote: restartVoteRef.current,
        };
    }, []);

    const clearRestartTimer = useCallback(() => {
        if (!restartTimerRef.current) return;
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
    }, []);

    const cancelRestartVote = useCallback((reason) => {
        if (!isHost || !restartVoteRef.current) return;
        const voteId = restartVoteRef.current.id;
        clearRestartTimer();
        restartTargetRef.current = '';
        updateRestartVote(null);
        broadcast(PARTY_MESSAGE.RESTART_CANCEL, { id: voteId, reason });
        setNotice(reason === 'timeout'
            ? '重新開始提議已逾時取消。'
            : '重新開始提議未獲全員同意，已取消。');
    }, [broadcast, clearRestartTimer, isHost, updateRestartVote]);

    const completeCoopRoundIfReady = useCallback(() => {
        if (!isHost || phaseRef.current !== PARTY_PHASE.PLAYING || modeRef.current !== PARTY_MODE.COOP) return;

        const currentGame = gameRef.current;
        const onlineIds = rosterSnapshot().filter((player) => player.online).map((player) => player.id);
        const submissions = currentGame.coop.submissions;
        if (!onlineIds.length || !onlineIds.every((id) => submissions[id])) return;

        const entries = onlineIds.map((id) => submissions[id]);
        const winnerIds = entries.filter((entry) => entry.a === 4).map((entry) => entry.id);
        const round = currentGame.coop.round;
        const result = winnerIds.length ? { winnerIds, round } : null;
        const nextGame = {
            ...currentGame,
            coop: {
                round: round + 1,
                submissions: {},
                rounds: [...currentGame.coop.rounds, { round, entries }],
            },
        };
        updateGame(nextGame);
        setCoopSubmittedIds([]);
        if (result) updatePhase(PARTY_PHASE.RESULT);
        broadcast(PARTY_MESSAGE.REVEAL, { round, entries, result });
    }, [broadcast, isHost, rosterSnapshot, updateGame, updatePhase]);

    const removePlayer = useCallback((playerId) => {
        if (!playersRef.current.has(playerId) || playerId === hostIdRef.current) return;
        if (restartVoteRef.current?.requiredIds.includes(playerId)) cancelRestartVote('player-left');
        playersRef.current.delete(playerId);
        playerConnectionsRef.current.delete(playerId);
        const sessionId = playerSessionsRef.current.get(playerId);
        if (sessionId) sessionPlayersRef.current.delete(sessionId);
        playerSessionsRef.current.delete(playerId);
        const timer = removalTimersRef.current.get(playerId);
        if (timer) clearTimeout(timer);
        removalTimersRef.current.delete(playerId);
        publishRoster();
        setTimeout(completeCoopRoundIfReady, 0);
    }, [cancelRestartVote, completeCoopRoundIfReady, publishRoster]);

    const markPlayerOffline = useCallback((playerId) => {
        const player = playersRef.current.get(playerId);
        if (!player || !player.online) return;
        if (restartVoteRef.current?.requiredIds.includes(playerId)) cancelRestartVote('player-left');
        playersRef.current.set(playerId, { ...player, online: false });
        publishRoster();
        const existingTimer = removalTimersRef.current.get(playerId);
        if (existingTimer) clearTimeout(existingTimer);
        removalTimersRef.current.set(playerId, setTimeout(() => removePlayer(playerId), RECONNECT_GRACE_MS));
        setTimeout(completeCoopRoundIfReady, 0);
    }, [cancelRestartVote, completeCoopRoundIfReady, publishRoster, removePlayer]);

    const finalizeRace = useCallback(() => {
        raceWindowRef.current = null;
        const currentGame = gameRef.current;
        if (!currentGame.race.wins.length) return;
        const winner = [...currentGame.race.wins].sort(compareRaceWins)[0];
        const result = { winnerId: winner.id, playMs: winner.playMs, step: winner.step };
        updateGame({
            ...currentGame,
            race: { ...currentGame.race, result },
        });
        updatePhase(PARTY_PHASE.RESULT);
        broadcast(PARTY_MESSAGE.RACE_RESULT, result);
    }, [broadcast, updateGame, updatePhase]);

    const registerRaceWin = useCallback((entry) => {
        if (!isHost || restartVoteRef.current || phaseRef.current !== PARTY_PHASE.PLAYING || modeRef.current !== PARTY_MODE.RACE) return;
        const currentGame = gameRef.current;
        const progress = currentGame.race.progress[entry.id];
        if (!Number.isFinite(entry.playMs) || entry.playMs < 0 || !progress || progress.a !== 4 || progress.step !== entry.step) return;
        if (currentGame.race.result || currentGame.race.wins.some((win) => win.id === entry.id)) return;
        updateGame({
            ...currentGame,
            race: { ...currentGame.race, wins: [...currentGame.race.wins, entry] },
        });
        if (!raceWindowRef.current) {
            raceWindowRef.current = setTimeout(finalizeRace, RACE_WIN_WINDOW_MS);
        }
    }, [finalizeRace, isHost, updateGame]);

    const processCoopSubmit = useCallback((entry) => {
        if (!isHost || restartVoteRef.current || phaseRef.current !== PARTY_PHASE.PLAYING || modeRef.current !== PARTY_MODE.COOP) return;
        const currentGame = gameRef.current;
        if (entry.round !== currentGame.coop.round || currentGame.coop.submissions[entry.id]) return;
        const nextGame = {
            ...currentGame,
            coop: {
                ...currentGame.coop,
                submissions: { ...currentGame.coop.submissions, [entry.id]: entry },
            },
        };
        updateGame(nextGame);
        const submittedIds = Object.keys(nextGame.coop.submissions);
        setCoopSubmittedIds(submittedIds);
        broadcast(PARTY_MESSAGE.SUBMIT, { id: entry.id, round: entry.round });
        setTimeout(completeCoopRoundIfReady, 0);
    }, [broadcast, completeCoopRoundIfReady, isHost, updateGame]);

    const beginGame = useCallback((target) => {
        const startAt = Math.max(Date.now(), gameRef.current.startAt + 1);
        const nextGame = {
            target,
            startAt,
            coop: { round: 1, submissions: {}, rounds: [] },
            race: { progress: {}, wins: [], result: null },
        };
        if (raceWindowRef.current) clearTimeout(raceWindowRef.current);
        raceWindowRef.current = null;
        clearRestartTimer();
        restartTargetRef.current = '';
        updateRestartVote(null);
        setNotice('');
        updateGame(nextGame);
        setCoopSubmittedIds([]);
        updatePhase(PARTY_PHASE.PLAYING);
        broadcast(PARTY_MESSAGE.START, { target, mode: modeRef.current, startAt });
    }, [broadcast, clearRestartTimer, updateGame, updatePhase, updateRestartVote]);

    const processRestartVote = useCallback((playerId, payload) => {
        const currentVote = restartVoteRef.current;
        if (!isHost || !currentVote || payload.id !== currentVote.id || Date.now() >= currentVote.expiresAt) return;
        const result = applyRestartVote(currentVote, playerId, payload.approved === true);
        if (result.outcome === 'ignored') return;
        if (result.outcome === 'rejected') {
            cancelRestartVote('rejected');
            return;
        }
        if (result.outcome === 'approved') {
            const target = restartTargetRef.current;
            if (target) beginGame(target);
            return;
        }
        updateRestartVote(result.vote);
        broadcast(PARTY_MESSAGE.RESTART_REQUEST, result.vote);
    }, [beginGame, broadcast, cancelRestartVote, isHost, updateRestartVote]);

    const handleHostMessage = useCallback((connection, message) => {
        const payload = message.payload;
        const peerId = connection.peer;
        const playerId = connectionSessionsRef.current.get(peerId);

        if (message.type === PARTY_MESSAGE.HELLO) {
            const incomingId = String(payload.sessionId || '');
            const name = String(payload.name || '').trim().slice(0, 30);
            if (!incomingId || !name) {
                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'invalid-player' });
                connection.close();
                return;
            }

            if (poolRef.current?.isVerified(peerId, connection)) {
                const verifiedSessionId = playerId ? playerSessionsRef.current.get(playerId) : '';
                if (!playerId || verifiedSessionId !== incomingId) {
                    sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'invalid-player' });
                    connection.close();
                    return;
                }
                publishRoster(connection);
                sendConnection(connection, PARTY_MESSAGE.SYNC, createSyncPayload(playerId));
                return;
            }

            const boundPlayerId = connectionSessionsRef.current.get(peerId);
            const boundSessionId = boundPlayerId ? playerSessionsRef.current.get(boundPlayerId) : '';
            if (boundSessionId && boundSessionId !== incomingId) {
                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'invalid-player' });
                connection.close();
                return;
            }

            const existingPlayerId = sessionPlayersRef.current.get(incomingId);
            const existingPlayer = existingPlayerId ? playersRef.current.get(existingPlayerId) : null;
            if (existingPlayer?.isHost) {
                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'invalid-player' });
                connection.close();
                return;
            }
            if (!existingPlayer && playersRef.current.size >= 6) {
                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'room-full' });
                connection.close();
                return;
            }
            if (!existingPlayer && phaseRef.current !== PARTY_PHASE.WAITING_ROOM) {
                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'game-in-progress' });
                connection.close();
                return;
            }

            const playerId = existingPlayerId || createPublicId();
            const previousConnection = playerConnectionsRef.current.get(playerId);
            const promoted = poolRef.current?.promote(connection, previousConnection ? {
                replacePeerId: previousConnection.peerId,
                replaceConnection: previousConnection.connection,
            } : undefined);
            if (!promoted) {
                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'room-full' });
                connection.close();
                return;
            }

            clearPendingHandshakeTimer(connection);
            if (previousConnection && previousConnection.connection !== connection) {
                connectionSessionsRef.current.delete(previousConnection.peerId);
            }
            connectionSessionsRef.current.set(peerId, playerId);
            sessionPlayersRef.current.set(incomingId, playerId);
            playerSessionsRef.current.set(playerId, incomingId);
            playerConnectionsRef.current.set(playerId, { peerId, connection });
            if (previousConnection && previousConnection.connection !== connection) previousConnection.connection.close();
            const removalTimer = removalTimersRef.current.get(playerId);
            if (removalTimer) clearTimeout(removalTimer);
            removalTimersRef.current.delete(playerId);
            playersRef.current.set(playerId, {
                id: playerId,
                name,
                online: true,
                isHost: false,
            });
            lastSeenRef.current.set(peerId, Date.now());
            publishRoster();
            sendConnection(connection, PARTY_MESSAGE.SYNC, createSyncPayload(playerId));
            return;
        }

        if (!playerId || !poolRef.current?.isVerified(peerId, connection)) return;
        lastSeenRef.current.set(peerId, Date.now());
        const player = playersRef.current.get(playerId);
        if (!player) return;

        switch (message.type) {
            case PARTY_MESSAGE.CHAT: {
                const text = String(payload.text || '').trim().slice(0, 300);
                if (!text) break;
                const chat = { id: `${playerId}-${Date.now()}`, fromId: playerId, name: player.name, text, at: Date.now() };
                appendChat(chat);
                broadcast(PARTY_MESSAGE.CHAT, chat);
                break;
            }
            case PARTY_MESSAGE.SUBMIT: {
                if (Number(payload.gameId) !== gameRef.current.startAt) break;
                const guess = String(payload.guess || '');
                if (!isValidGuess(guess)) break;
                const { a, b } = calculateAB(guess, gameRef.current.target);
                processCoopSubmit({
                    id: playerId,
                    round: Number(payload.round),
                    guess,
                    a,
                    b,
                    step: Number(payload.step),
                });
                break;
            }
            case PARTY_MESSAGE.RACE_PROGRESS: {
                if (restartVoteRef.current || phaseRef.current !== PARTY_PHASE.PLAYING || modeRef.current !== PARTY_MODE.RACE) break;
                if (Number(payload.gameId) !== gameRef.current.startAt) break;
                const guess = String(payload.guess || '');
                const step = Number(payload.step);
                if (!isValidGuess(guess)) break;
                const { a, b } = calculateAB(guess, gameRef.current.target);
                const previousStep = gameRef.current.race.progress[playerId]?.step || 0;
                if (!Number.isInteger(step) || step !== previousStep + 1) break;
                const progress = { id: playerId, step, a, b };
                const currentGame = gameRef.current;
                updateGame({
                    ...currentGame,
                    race: {
                        ...currentGame.race,
                        progress: { ...currentGame.race.progress, [playerId]: progress },
                    },
                });
                broadcast(PARTY_MESSAGE.RACE_PROGRESS, progress);
                break;
            }
            case PARTY_MESSAGE.RACE_WIN:
                if (
                    Number(payload.gameId) === gameRef.current.startAt
                    && Number.isFinite(Number(payload.playMs))
                    && Number.isFinite(Number(payload.step))
                ) {
                    registerRaceWin({
                        id: playerId,
                        playMs: Math.max(0, Number(payload.playMs)),
                        step: Math.max(1, Number(payload.step)),
                    });
                }
                break;
            case PARTY_MESSAGE.RESTART_VOTE:
                processRestartVote(playerId, payload);
                break;
            case PARTY_MESSAGE.PONG:
                lastSeenRef.current.set(peerId, Date.now());
                break;
            case PARTY_MESSAGE.LEAVE:
                removePlayer(playerId);
                poolRef.current?.remove(peerId, connection);
                connectionSessionsRef.current.delete(peerId);
                connection.close();
                break;
            default:
                break;
        }
    }, [appendChat, broadcast, clearPendingHandshakeTimer, createSyncPayload, processCoopSubmit, processRestartVote, publishRoster, registerRaceWin, removePlayer, sendConnection, updateGame]);

    const handleGuestMessage = useCallback((message) => {
        const payload = message.payload;
        switch (message.type) {
            case PARTY_MESSAGE.ROSTER:
                setRoster(payload.players || []);
                modeRef.current = payload.mode || PARTY_MODE.COOP;
                setModeState(modeRef.current);
                break;
            case PARTY_MESSAGE.SYNC:
                clearInitialConnectionTimer();
                reconnectDeadlineRef.current = 0;
                setConnectionIssue(false);
                setNotice('');
                if (payload.selfId) setSelfId(payload.selfId);
                modeRef.current = payload.mode || PARTY_MODE.COOP;
                setModeState(modeRef.current);
                updateGame(payload.game || createInitialGame());
                setCoopSubmittedIds(Object.keys(payload.game?.coop?.submissions || {}));
                updateRestartVote(payload.restartVote || null);
                updatePhase(payload.phase || PARTY_PHASE.WAITING_ROOM);
                break;
            case PARTY_MESSAGE.CHAT:
                appendChat(payload);
                break;
            case PARTY_MESSAGE.SETTINGS:
                modeRef.current = payload.mode;
                setModeState(payload.mode);
                break;
            case PARTY_MESSAGE.START:
                modeRef.current = payload.mode;
                setModeState(payload.mode);
                updateGame({
                    target: payload.target,
                    startAt: payload.startAt,
                    coop: { round: 1, submissions: {}, rounds: [] },
                    race: { progress: {}, wins: [], result: null },
                });
                setCoopSubmittedIds([]);
                updateRestartVote(null);
                setNotice('');
                updatePhase(PARTY_PHASE.PLAYING);
                break;
            case PARTY_MESSAGE.SUBMIT:
                setCoopSubmittedIds((current) => current.includes(payload.id) ? current : [...current, payload.id]);
                break;
            case PARTY_MESSAGE.REVEAL: {
                const currentGame = gameRef.current;
                updateGame({
                    ...currentGame,
                    coop: {
                        round: payload.round + 1,
                        submissions: {},
                        rounds: [...currentGame.coop.rounds, { round: payload.round, entries: payload.entries }],
                    },
                });
                setCoopSubmittedIds([]);
                if (payload.result) updatePhase(PARTY_PHASE.RESULT);
                break;
            }
            case PARTY_MESSAGE.RACE_PROGRESS: {
                const currentGame = gameRef.current;
                updateGame({
                    ...currentGame,
                    race: {
                        ...currentGame.race,
                        progress: { ...currentGame.race.progress, [payload.id]: payload },
                    },
                });
                break;
            }
            case PARTY_MESSAGE.RACE_RESULT: {
                const currentGame = gameRef.current;
                updateGame({ ...currentGame, race: { ...currentGame.race, result: payload } });
                updatePhase(PARTY_PHASE.RESULT);
                break;
            }
            case PARTY_MESSAGE.RESTART_REQUEST:
                updateRestartVote(payload);
                setNotice('');
                break;
            case PARTY_MESSAGE.RESTART_CANCEL:
                if (!restartVoteRef.current || payload.id === restartVoteRef.current.id) {
                    updateRestartVote(null);
                    setNotice(payload.reason === 'timeout'
                        ? '重新開始提議已逾時取消。'
                        : '重新開始提議未獲全員同意，已取消。');
                }
                break;
            case PARTY_MESSAGE.PING:
                if (guestHeartbeatRef.current) clearTimeout(guestHeartbeatRef.current);
                guestHeartbeatRef.current = setTimeout(() => {
                    setConnectionIssue(true);
                    setNotice('與房主連線中斷，正在重新連線...');
                    hostConnectionRef.current?.close();
                }, HEARTBEAT_TIMEOUT_MS);
                sendConnection(hostConnectionRef.current, PARTY_MESSAGE.PONG, { at: Date.now() });
                break;
            case PARTY_MESSAGE.LEAVE:
                clearInitialConnectionTimer();
                clearPartyRoom();
                closedRef.current = true;
                setClosed(true);
                setNotice('房主已離開房間。');
                break;
            case PARTY_MESSAGE.REJECT:
                clearInitialConnectionTimer();
                clearPartyRoom();
                closedRef.current = true;
                setClosed(true);
                setConnectionIssue(true);
                setNotice(payload.reason === 'game-in-progress' ? '遊戲已開始，無法中途加入。' : '房間已滿或無法加入。');
                break;
            default:
                break;
        }
    }, [appendChat, clearInitialConnectionTimer, sendConnection, updateGame, updatePhase, updateRestartVote]);

    const wireGuestConnection = useCallback((connection) => {
        hostConnectionRef.current = connection;
        logger.info('Guest connection created', connection.peer);
        clearInitialConnectionTimer();
        initialConnectionTimerRef.current = setTimeout(() => {
            scheduleGuestRetry(connection, '連線逾時，正在重新嘗試；也可以返回大廳。');
        }, INITIAL_CONNECTION_TIMEOUT_MS);
        connection.peerConnection?.addEventListener('connectionstatechange', () => {
            logger.info('Guest peer connection state', connection.peerConnection?.connectionState);
        });
        connection.on('open', () => {
            logger.info('Guest connection opened', connection.peer);
            setNotice('正在驗證房間...');
            sendConnection(connection, PARTY_MESSAGE.HELLO, { sessionId: sessionIdRef.current, name: userName });
        });
        connection.on('data', (data) => {
            if (hostConnectionRef.current !== connection) return;
            if (isPartyMessage(data)) handleGuestMessage(data);
        });
        connection.on('error', (error) => {
            logger.error('Guest connection error', error);
            scheduleGuestRetry(connection, '連線失敗，正在重新嘗試；也可以返回大廳。');
        });
        connection.on('close', () => {
            logger.info('Guest connection closed', connection.peer);
            if (destroyedRef.current || closedRef.current || hostConnectionRef.current !== connection) return;
            const failureNotice = phaseRef.current === PARTY_PHASE.CONNECTING
                ? '無法加入房間，正在重新嘗試；也可以返回大廳。'
                : '連線中斷，正在重新連線；也可以返回大廳。';
            scheduleGuestRetry(connection, failureNotice);
        });
    }, [clearInitialConnectionTimer, handleGuestMessage, scheduleGuestRetry, sendConnection, userName]);

    useEffect(() => {
        destroyedRef.current = false;
        hostRebuildRequestedRef.current = false;
        let activePeer = null;
        let cancelled = false;
        const savedRoom = loadPartyRoom();
        const resolvedRoom = isHost
            ? (hostRoomCodeRef.current || (savedRoom?.role === 'host' ? savedRoom.roomCode : createRoomCode()))
            : (roomID || savedRoom?.roomCode || '');
        setRoomCode(resolvedRoom);

        const scheduleHostPeerRebuild = (error) => {
            if (cancelled || !isHost || (phaseRef.current !== PARTY_PHASE.WAITING_ROOM && phaseRef.current !== PARTY_PHASE.CONNECTING)) return false;
            const expectedPeer = activePeer;
            hostSignalingHealthyRef.current = false;
            logger.error('Host signaling unavailable; scheduling peer rebuild', error);
            setConnectionIssue(true);
            setNotice('房間連線服務恢復中，暫時無法邀請新玩家；你仍可離開房間。');
            if (hostPeerRetryTimerRef.current) return true;
            hostPeerRetryTimerRef.current = setTimeout(() => {
                hostPeerRetryTimerRef.current = null;
                if (cancelled || destroyedRef.current || closedRef.current) return;
                if (phaseRef.current !== PARTY_PHASE.WAITING_ROOM && phaseRef.current !== PARTY_PHASE.CONNECTING) return;
                if (hostSignalingHealthyRef.current) return;
                if (expectedPeer ? peerRef.current !== expectedPeer : peerRef.current !== null) return;
                hostRebuildRequestedRef.current = true;
                setRetryKey((key) => key + 1);
            }, RECONNECT_RETRY_MS);
            return true;
        };

        const initialize = async () => {
            try {
                if (isHost) {
                    const peer = await createHostPeer(resolvedRoom);
                    if (cancelled) { peer.destroy(); return; }
                    activePeer = peer;
                    peerRef.current = peer;
                    hostSignalingHealthyRef.current = true;
                    const hostPool = createHostConnectionPool();
                    poolRef.current = hostPool;
                    if (!hostRoomCodeRef.current) {
                        hostRoomCodeRef.current = resolvedRoom;
                        playersRef.current = new Map([[
                            hostIdRef.current,
                            { id: hostIdRef.current, name: userName, online: true, isHost: true },
                        ]]);
                        sessionPlayersRef.current = new Map([[sessionIdRef.current, hostIdRef.current]]);
                        playerSessionsRef.current = new Map([[hostIdRef.current, sessionIdRef.current]]);
                    }
                    setSelfId(hostIdRef.current);
                    savePartyRoom('host', resolvedRoom);
                    updatePhase(PARTY_PHASE.WAITING_ROOM);
                    setConnectionIssue(false);
                    setNotice('');
                    publishRoster();
                    peer.on('connection', (connection) => {
                        if (peerRef.current !== peer || poolRef.current !== hostPool) {
                            connection.close();
                            return;
                        }
                        logger.info('Host received connection', connection.peer);
                        connection.peerConnection?.addEventListener('connectionstatechange', () => {
                            logger.info('Host peer connection state', connection.peerConnection?.connectionState);
                        });
                        if (!hostPool.registerPending(connection)) {
                            const reject = () => {
                                sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'room-full' });
                                connection.close();
                            };
                            if (connection.open) reject();
                            else connection.on('open', reject);
                            return;
                        }
                        const handshakeTimer = setTimeout(() => {
                            if (!hostPool.removePending(connection.peer, connection)) return;
                            clearPendingHandshakeTimer(connection);
                            sendConnection(connection, PARTY_MESSAGE.REJECT, { reason: 'invalid-player' });
                            connection.close();
                        }, PENDING_HELLO_TIMEOUT_MS);
                        pendingHandshakeTimersRef.current.set(connection.peer, { connection, timer: handshakeTimer });
                        connection.on('data', (data) => {
                            if (isPartyMessage(data)) handleHostMessage(connection, data);
                        });
                        connection.on('close', () => {
                            clearPendingHandshakeTimer(connection);
                            hostPool.removePending(connection.peer, connection);
                            const removedVerified = hostPool.remove(connection.peer, connection);
                            if (!removedVerified || poolRef.current !== hostPool) return;
                            const playerId = connectionSessionsRef.current.get(connection.peer);
                            const activeConnection = playerConnectionsRef.current.get(playerId);
                            if (playerId && activeConnection?.connection === connection) {
                                connectionSessionsRef.current.delete(connection.peer);
                                lastSeenRef.current.delete(connection.peer);
                                playerConnectionsRef.current.delete(playerId);
                                markPlayerOffline(playerId);
                            }
                        });
                        connection.on('error', (error) => {
                            logger.error('Host connection error', error);
                            clearPendingHandshakeTimer(connection);
                            hostPool.removePending(connection.peer, connection);
                            connection.close();
                        });
                    });
                    hostHeartbeatRef.current = setInterval(() => {
                        const now = Date.now();
                        hostPool.connections.forEach((connection, peerId) => {
                            if (now - (lastSeenRef.current.get(peerId) || now) > HEARTBEAT_TIMEOUT_MS) {
                                connection.close();
                                return;
                            }
                            sendConnection(connection, PARTY_MESSAGE.PING, { at: now });
                        });
                    }, HEARTBEAT_INTERVAL_MS);
                } else {
                    if (!resolvedRoom) {
                        closedRef.current = true;
                        setClosed(true);
                        setNotice('缺少房間碼。');
                        return;
                    }
                    const peer = await createGuestPeer();
                    if (cancelled) { peer.destroy(); return; }
                    activePeer = peer;
                    peerRef.current = peer;
                    savePartyRoom('guest', resolvedRoom);
                    setNotice('正在連線...');
                    wireGuestConnection(connectToHost(peer, resolvedRoom));
                }
                const peer = activePeer;
                peer.on('open', () => {
                    if (peerRef.current !== peer) return;
                    hostSignalingHealthyRef.current = true;
                    if (hostPeerRetryTimerRef.current) clearTimeout(hostPeerRetryTimerRef.current);
                    hostPeerRetryTimerRef.current = null;
                    if (signalingReconnectTimerRef.current) clearTimeout(signalingReconnectTimerRef.current);
                    signalingReconnectTimerRef.current = null;
                    if (isHost) {
                        setConnectionIssue(false);
                        setNotice('');
                    }
                });
                peer.on('disconnected', () => {
                    if (peerRef.current !== peer || peer.destroyed) return;
                    if (isHost && phaseRef.current !== PARTY_PHASE.WAITING_ROOM) return;
                    if (isHost) {
                        hostSignalingHealthyRef.current = false;
                        setConnectionIssue(true);
                        setNotice('房間連線服務恢復中，暫時無法邀請新玩家；你仍可離開房間。');
                    }
                    try {
                        peer.reconnect();
                        if (signalingReconnectTimerRef.current) clearTimeout(signalingReconnectTimerRef.current);
                        signalingReconnectTimerRef.current = setTimeout(() => {
                            signalingReconnectTimerRef.current = null;
                            if (peerRef.current !== peer) return;
                            if (peer.open) {
                                if (isHost) {
                                    hostSignalingHealthyRef.current = true;
                                    setConnectionIssue(false);
                                    setNotice('');
                                }
                                return;
                            }
                            if (isHost) scheduleHostPeerRebuild(new Error('Peer signaling reconnect timed out'));
                            else scheduleGuestRetry(hostConnectionRef.current, '連線服務中斷，正在重新嘗試；也可以返回大廳。');
                        }, SIGNALING_RECONNECT_WATCHDOG_MS);
                    } catch (error) {
                        logger.error('Peer signaling reconnect failed', error);
                        if (isHost) scheduleHostPeerRebuild(error);
                        else scheduleGuestRetry(hostConnectionRef.current, '連線服務中斷，正在重新嘗試；也可以返回大廳。');
                    }
                });
                peer.on('error', (error) => {
                    if (peerRef.current !== peer) return;
                    logger.error('Peer signaling error', error);
                    if (isHost) {
                        hostSignalingHealthyRef.current = false;
                        scheduleHostPeerRebuild(error);
                    }
                    else scheduleGuestRetry(hostConnectionRef.current, '找不到房間或連線失敗，正在重新嘗試；也可以返回大廳。');
                });
            } catch (error) {
                logger.error('Party peer initialization failed', error);
                if (isHost) scheduleHostPeerRebuild(error);
                else scheduleGuestRetry(null, '找不到房間或連線失敗，正在重新嘗試；也可以返回大廳。');
            }
        };

        initialize();
        return () => {
            cancelled = true;
            destroyedRef.current = true;
            if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
            clearInitialConnectionTimer();
            if (hostPeerRetryTimerRef.current) clearTimeout(hostPeerRetryTimerRef.current);
            hostPeerRetryTimerRef.current = null;
            if (signalingReconnectTimerRef.current) clearTimeout(signalingReconnectTimerRef.current);
            signalingReconnectTimerRef.current = null;
            if (guestHeartbeatRef.current) clearTimeout(guestHeartbeatRef.current);
            if (hostHeartbeatRef.current) clearInterval(hostHeartbeatRef.current);
            hostHeartbeatRef.current = null;
            hostConnectionRef.current?.close();
            hostConnectionRef.current = null;
            pendingHandshakeTimersRef.current.forEach(({ timer }) => clearTimeout(timer));
            pendingHandshakeTimersRef.current.clear();
            const currentPool = poolRef.current;
            if (currentPool && activePeer && peerRef.current === activePeer) poolRef.current = null;
            if (isHost && hostRebuildRequestedRef.current && currentPool) {
                playerConnectionsRef.current.forEach(({ connection }, playerId) => {
                    if (currentPool.isVerified(connection.peer, connection)) markPlayerOffline(playerId);
                });
            }
            if (isHost && currentPool) {
                connectionSessionsRef.current.clear();
                playerConnectionsRef.current.clear();
                lastSeenRef.current.clear();
            }
            currentPool?.closeAll();
            activePeer?.destroy();
            if (peerRef.current === activePeer) peerRef.current = null;
        };
    }, [clearInitialConnectionTimer, clearPendingHandshakeTimer, handleHostMessage, isHost, markPlayerOffline, publishRoster, retryKey, roomID, scheduleGuestRetry, sendConnection, updatePhase, userName, wireGuestConnection]);

    useEffect(() => () => {
        removalTimersRef.current.forEach(clearTimeout);
        if (raceWindowRef.current) clearTimeout(raceWindowRef.current);
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    }, []);

    const sendChat = useCallback((textValue) => {
        const text = String(textValue || '').trim().slice(0, 300);
        if (!text) return;
        if (isHost) {
            const chat = {
                id: `${hostIdRef.current}-${Date.now()}`,
                fromId: hostIdRef.current,
                name: userName,
                text,
                at: Date.now(),
            };
            appendChat(chat);
            broadcast(PARTY_MESSAGE.CHAT, chat);
        } else {
            sendConnection(hostConnectionRef.current, PARTY_MESSAGE.CHAT, { text });
        }
    }, [appendChat, broadcast, isHost, sendConnection, userName]);

    const setMode = useCallback((nextMode) => {
        if (!isHost || phaseRef.current !== PARTY_PHASE.WAITING_ROOM || !Object.values(PARTY_MODE).includes(nextMode)) return;
        modeRef.current = nextMode;
        setModeState(nextMode);
        broadcast(PARTY_MESSAGE.SETTINGS, { mode: nextMode });
        publishRoster();
    }, [broadcast, isHost, publishRoster]);

    const startGame = useCallback((target) => {
        if (!isHost || phaseRef.current !== PARTY_PHASE.WAITING_ROOM || rosterSnapshot().filter((player) => player.online).length < 2) return false;
        beginGame(target);
        return true;
    }, [beginGame, isHost, rosterSnapshot]);

    const requestRestart = useCallback((target) => {
        const currentPhase = phaseRef.current;
        const players = rosterSnapshot();
        const onlinePlayers = players.filter((player) => player.online);
        if (
            !isHost
            || restartVoteRef.current
            || (currentPhase !== PARTY_PHASE.PLAYING && currentPhase !== PARTY_PHASE.RESULT)
            || onlinePlayers.length < 2
            || onlinePlayers.length !== players.length
        ) return false;

        const requestedAt = Date.now();
        const vote = createRestartVote({
            id: `${requestedAt}-${Math.random().toString(36).slice(2)}`,
            hostId: hostIdRef.current,
            playerIds: onlinePlayers.map((player) => player.id),
            requestedAt,
            expiresAt: requestedAt + RESTART_VOTE_TIMEOUT_MS,
        });
        restartTargetRef.current = target;
        updateRestartVote(vote);
        setNotice('');
        broadcast(PARTY_MESSAGE.RESTART_REQUEST, vote);
        restartTimerRef.current = setTimeout(() => {
            if (restartVoteRef.current?.id === vote.id) cancelRestartVote('timeout');
        }, RESTART_VOTE_TIMEOUT_MS);
        return true;
    }, [broadcast, cancelRestartVote, isHost, rosterSnapshot, updateRestartVote]);

    const voteRestart = useCallback((approved) => {
        const vote = restartVoteRef.current;
        if (!vote || !vote.requiredIds.includes(selfId) || vote.approvedIds.includes(selfId)) return false;
        if (isHost) {
            if (!approved) cancelRestartVote('rejected');
            return false;
        }
        return sendConnection(hostConnectionRef.current, PARTY_MESSAGE.RESTART_VOTE, {
            id: vote.id,
            approved: approved === true,
        });
    }, [cancelRestartVote, isHost, selfId, sendConnection]);

    const submitCoop = useCallback((entry) => {
        const payload = { ...entry, gameId: gameRef.current.startAt, round: gameRef.current.coop.round };
        if (isHost) processCoopSubmit({ ...payload, id: hostIdRef.current });
        else sendConnection(hostConnectionRef.current, PARTY_MESSAGE.SUBMIT, payload);
    }, [isHost, processCoopSubmit, sendConnection]);

    const sendRaceProgress = useCallback((progress) => {
        if (restartVoteRef.current) return;
        const { a, b } = calculateAB(progress.guess, gameRef.current.target);
        const entry = { id: hostIdRef.current, step: progress.step, a, b };
        if (isHost) {
            const currentGame = gameRef.current;
            updateGame({
                ...currentGame,
                race: { ...currentGame.race, progress: { ...currentGame.race.progress, [entry.id]: entry } },
            });
            broadcast(PARTY_MESSAGE.RACE_PROGRESS, entry);
        } else {
            sendConnection(hostConnectionRef.current, PARTY_MESSAGE.RACE_PROGRESS, {
                gameId: gameRef.current.startAt,
                guess: progress.guess,
                step: progress.step,
            });
        }
    }, [broadcast, isHost, sendConnection, updateGame]);

    const sendRaceWin = useCallback(({ playMs, step }) => {
        if (isHost) registerRaceWin({ id: hostIdRef.current, playMs, step });
        else sendConnection(hostConnectionRef.current, PARTY_MESSAGE.RACE_WIN, {
            gameId: gameRef.current.startAt,
            playMs,
            step,
        });
    }, [isHost, registerRaceWin, sendConnection]);

    const returnToWaitingRoom = useCallback(() => {
        if (!isHost || phaseRef.current !== PARTY_PHASE.RESULT) return;
        updateGame(createInitialGame());
        updatePhase(PARTY_PHASE.WAITING_ROOM);
        broadcast(PARTY_MESSAGE.SYNC, createSyncPayload());
    }, [broadcast, createSyncPayload, isHost, updateGame, updatePhase]);

    const leave = useCallback(() => {
        if (isHost) broadcast(PARTY_MESSAGE.LEAVE, { id: hostIdRef.current });
        else sendConnection(hostConnectionRef.current, PARTY_MESSAGE.LEAVE, { id: selfId });
        clearPartyRoom();
        closedRef.current = true;
        setClosed(true);
    }, [broadcast, isHost, selfId, sendConnection]);

    const me = useMemo(
        () => roster.find((player) => player.id === selfId) || { id: selfId, name: userName, online: true, isHost },
        [isHost, roster, selfId, userName],
    );

    return {
        phase,
        roomCode,
        roster,
        mode,
        messages,
        game,
        coopSubmittedIds,
        restartVote,
        me,
        isHost,
        notice,
        connectionIssue,
        closed,
        actions: {
            sendChat,
            setMode,
            startGame,
            submitCoop,
            sendRaceProgress,
            sendRaceWin,
            requestRestart,
            voteRestart,
            returnToWaitingRoom,
            leave,
        },
    };
};

export { clearPartyRoom, PARTY_MODE, PARTY_PHASE };
