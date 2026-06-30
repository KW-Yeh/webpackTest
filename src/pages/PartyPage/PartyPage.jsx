import '../../css/party.scss';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector, useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { FiArrowLeft, FiCheck, FiCopy } from "react-icons/fi";
import { VscDebugRestart } from "react-icons/vsc";

import { Logger } from "../../module/logger";
import { checkInputs } from "../../module/checkInputs";
import { shuffleArray } from "../../module/shuffleArray";
import { createHostPeer, createGuestPeer, connectToHost } from "../../module/peer";
import DigitInputGroup from "../../component/DigitInputGroup/DigitInputGroup.jsx";
import { env } from "../../../env.js";
import { formatWording } from "../../../utils/langUtils";
import { setUser } from "../../component/Player/userSlice";
import { setRole, setRoom } from "./partyPageSlice";

const logger = Logger({ className: "PartyPage" });

const PHASE = {
    CONNECTING: 'connecting',
    WAITING_TARGET: 'waiting_target',
    PLAYING: 'playing',
    SUBMITTED: 'submitted',
    WIN: 'win',
};

const CONNECTION_TIMEOUT_MS = 20000;
const CONNECTION_TIMEOUT_NOTICE = '連線逾時，請確認兩台裝置在同一個網路、手機沒有使用行動網路/VPN，並重新建立房間。';
const CONNECTION_FAILED_NOTICE = '連線失敗，請重新建立房間後再試一次。';
const CONNECTION_CLOSED_NOTICE = '對方連線已中斷，等待 1 分鐘內重新連線...';
const HOST_LEFT_NOTICE = '房主已離開，已回到遊戲大廳。';
const GUEST_LEFT_NOTICE = '玩家已離開，等待新的玩家加入...';
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 20000;
const RECONNECT_GRACE_MS = 60000;
const PARTY_SESSION_ID_KEY = 'bulls-cows-party-session-id';
const PARTY_ROOM_KEY = 'bulls-cows-party-room';
const ROOM_CODE_PATTERN = /^\d{6}$/;

const savePartyRoom = (role, roomCode) => {
    try { window.sessionStorage.setItem(PARTY_ROOM_KEY, JSON.stringify({ role, roomCode })); } catch { }
};

const loadPartyRoom = () => {
    try {
        const raw = window.sessionStorage.getItem(PARTY_ROOM_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
};

const clearPartyRoom = () => {
    try { window.sessionStorage.removeItem(PARTY_ROOM_KEY); } catch { }
};

const getPartySessionId = () => {
    const storedSessionId = window.localStorage.getItem(PARTY_SESSION_ID_KEY);
    if (storedSessionId) return storedSessionId;

    const sessionId = window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(PARTY_SESSION_ID_KEY, sessionId);
    return sessionId;
};

const calculateAB = (guess, target) => {
    let a = 0, b = 0;
    guess.split('').forEach((digit, i) => {
        if (digit === target[i]) a++;
        else if (target.includes(digit)) b++;
    });
    return { a, b };
};

const createTarget = () => shuffleArray(env.GAME.NUMBER_RANGE).slice(0, 4).join('');

const PartyPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();
    const userName = useSelector(state => state.userReducer.name, shallowEqual);
    const role = useSelector(state => state.partyPageReducer.role, shallowEqual);
    const roomID = useSelector(state => state.partyPageReducer.roomID, shallowEqual);

    const [phase, setPhase] = useState(PHASE.CONNECTING);
    const [roomCode, setRoomCode] = useState('');
    const [notice, setNotice] = useState('');
    const [myNum, setMyNum] = useState('');
    const [myRecord, setMyRecord] = useState([]);
    const [peerRecord, setPeerRecord] = useState([]);
    const [peerName, setPeerName] = useState('');
    const [winner, setWinner] = useState(null);
    const [winnerStep, setWinnerStep] = useState(0);
    const [target, setTarget] = useState('');
    const [restartPending, setRestartPending] = useState(false);
    const [connectionIssue, setConnectionIssue] = useState(false);
    const [retryKey, setRetryKey] = useState(0);
    const [peerHasSubmitted, setPeerHasSubmitted] = useState(false);
    const [submittedGuessPreview, setSubmittedGuessPreview] = useState('');
    const [peerOnline, setPeerOnline] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);

    const peerRef = useRef(null);
    const connRef = useRef(null);
    const sessionIdRef = useRef(getPartySessionId());
    const peerSessionIdRef = useRef('');
    const signalingReconnectAtRef = useRef(0);
    const phaseRef = useRef(PHASE.CONNECTING);
    const targetRef = useRef('');
    const stepRef = useRef(0);
    const pendingSubmit = useRef(null);
    const myRecordRef = useRef([]);
    const peerRecordRef = useRef([]);
    const peerNameRef = useRef('');
    const winnerRef = useRef(null);
    const winnerStepRef = useRef(0);
    const connectionTimerRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);
    const heartbeatTimeoutRef = useRef(null);
    const lastPongAtRef = useRef(0);
    const connectionIssueRef = useRef(false);
    const suppressCloseNoticeRef = useRef(false);
    const suppressPeerIssueRef = useRef(false);
    const reconnectTimerRef = useRef(null);
    const copyNoticeTimerRef = useRef(null);
    const inviteRoomCode = new URLSearchParams(location.search).get('room')?.trim() || '';
    const inviteLink = roomCode
        ? `${window.location.origin}${window.location.pathname}#/party?room=${encodeURIComponent(roomCode)}`
        : '';

    const updatePhase = useCallback((nextPhase) => {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
    }, []);

    useEffect(() => {
        phaseRef.current = phase;
    }, [phase]);

    useEffect(() => {
        myRecordRef.current = myRecord;
    }, [myRecord]);

    useEffect(() => {
        peerRecordRef.current = peerRecord;
    }, [peerRecord]);

    useEffect(() => {
        peerNameRef.current = peerName;
    }, [peerName]);

    useEffect(() => {
        winnerRef.current = winner;
    }, [winner]);

    useEffect(() => {
        winnerStepRef.current = winnerStep;
    }, [winnerStep]);

    useEffect(() => {
        connectionIssueRef.current = connectionIssue;
    }, [connectionIssue]);

    useEffect(() => {
        if (!inviteRoomCode) return;

        navigate("/", {
            replace: true,
            state: {
                stage: "party_setup",
                roomID: inviteRoomCode,
                notice: ROOM_CODE_PATTERN.test(inviteRoomCode) ? "" : formatWording("error.invalid.inputRoom", {}),
            },
        });
    }, [inviteRoomCode, navigate]);

    const clearConnectionTimer = useCallback(() => {
        if (connectionTimerRef.current) {
            clearTimeout(connectionTimerRef.current);
            connectionTimerRef.current = null;
        }
    }, []);

    const clearHeartbeat = useCallback(() => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
            heartbeatIntervalRef.current = null;
        }
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
        }
        lastPongAtRef.current = 0;
    }, []);

    const clearReconnectTimer = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
    }, []);

    const clearCopyNoticeTimer = useCallback(() => {
        if (copyNoticeTimerRef.current) {
            clearTimeout(copyNoticeTimerRef.current);
            copyNoticeTimerRef.current = null;
        }
    }, []);

    const showConnectionIssue = useCallback((notice, error) => {
        if (error) {
            logger.error(notice, error?.type || error?.message || error);
        } else {
            logger.error(notice);
        }
        if (role !== 'host') {
            connectionIssueRef.current = true;
            setConnectionIssue(true);
        }
        setPeerOnline(false);
        setNotice(notice);
    }, [role]);

    const startConnectionTimer = useCallback(() => {
        clearConnectionTimer();
        connectionTimerRef.current = setTimeout(() => {
            const conn = connRef.current;
            if (!conn || conn.open || phaseRef.current === PHASE.PLAYING || phaseRef.current === PHASE.WIN) return;
            showConnectionIssue(CONNECTION_TIMEOUT_NOTICE);
            conn.close();
        }, CONNECTION_TIMEOUT_MS);
    }, [clearConnectionTimer, showConnectionIssue]);

    const releaseConnectionResources = useCallback((suppressCloseNotice = true, shouldClearReconnectTimer = true) => {
        clearConnectionTimer();
        clearHeartbeat();
        if (shouldClearReconnectTimer) clearReconnectTimer();
        if (suppressCloseNotice) suppressCloseNoticeRef.current = true;

        const currentConn = connRef.current;
        connRef.current = null;
        currentConn?.close();
    }, [clearConnectionTimer, clearHeartbeat, clearReconnectTimer]);

    const releasePeerResources = useCallback((notifyPeer = false, shouldClearReconnectTimer = true) => {
        if (notifyPeer && connRef.current?.open) {
            try {
                connRef.current.send({ type: 'party:leave', payload: { role, name: userName } });
            } catch (e) {
                logger.error('Leave notice failed', e);
            }
        }

        releaseConnectionResources(true, shouldClearReconnectTimer);

        const currentPeer = peerRef.current;
        peerRef.current = null;
        suppressPeerIssueRef.current = true;
        currentPeer?.destroy();
    }, [releaseConnectionResources, role, userName]);

    const sendMsg = useCallback((type, payload) => {
        try {
            connRef.current?.send({ type, payload });
        } catch (e) {
            logger.error('Send failed', e);
        }
    }, []);

    const createVisibleSnapshot = useCallback(() => ({
        phase: phaseRef.current,
        target: targetRef.current,
        step: stepRef.current,
        myRecord: myRecordRef.current,
        peerRecord: peerRecordRef.current,
        hostName: userName,
        peerName: peerNameRef.current,
        winner: winnerRef.current,
        winnerStep: winnerStepRef.current,
    }), [userName]);

    const applyVisibleSnapshot = useCallback((snapshot) => {
        if (!snapshot) return;

        targetRef.current = snapshot.target || '';
        stepRef.current = snapshot.step || 0;
        pendingSubmit.current = null;
        setTarget(snapshot.target || '');
        setMyRecord(snapshot.peerRecord || []);
        setPeerRecord(snapshot.myRecord || []);
        setWinner(snapshot.winner === 'me' ? 'peer' : snapshot.winner === 'peer' ? 'me' : snapshot.winner);
        setWinnerStep(snapshot.winnerStep || 0);
        setPeerName((currentPeerName) => snapshot.hostName || currentPeerName);
        setPeerHasSubmitted(false);
        setSubmittedGuessPreview('');
        setRestartPending(false);
        connectionIssueRef.current = false;
        setConnectionIssue(false);
        clearReconnectTimer();
        setPeerOnline(true);
        updatePhase(snapshot.phase === PHASE.SUBMITTED ? PHASE.PLAYING : snapshot.phase);
        setNotice(formatWording("party.status.reconnected", {}));
    }, [clearReconnectTimer, updatePhase]);

    const resetHostToWaiting = useCallback((notice = GUEST_LEFT_NOTICE, suppressCloseNotice = true) => {
        releaseConnectionResources(suppressCloseNotice);
        targetRef.current = '';
        stepRef.current = 0;
        pendingSubmit.current = null;
        connectionIssueRef.current = false;
        setConnectionIssue(false);
        setPeerOnline(false);
        setPeerName('');
        setMyNum('');
        setMyRecord([]);
        setPeerRecord([]);
        setWinner(null);
        setWinnerStep(0);
        setTarget('');
        setRestartPending(false);
        setPeerHasSubmitted(false);
        setSubmittedGuessPreview('');
        updatePhase(PHASE.CONNECTING);
        setNotice(notice);
    }, [releaseConnectionResources, updatePhase]);

    const returnGuestToLobby = useCallback((notice = HOST_LEFT_NOTICE) => {
        clearPartyRoom();
        window.sessionStorage.setItem('partyExitNotice', notice);
        releasePeerResources(false);
        navigate("/", { replace: true, state: { notice } });
    }, [navigate, releasePeerResources]);

    const handleReconnectExpired = useCallback(() => {
        reconnectTimerRef.current = null;
        if (role === 'host') {
            resetHostToWaiting(GUEST_LEFT_NOTICE);
            return;
        }
        returnGuestToLobby(HOST_LEFT_NOTICE);
    }, [resetHostToWaiting, returnGuestToLobby, role]);

    const markPeerOffline = useCallback((notice = CONNECTION_CLOSED_NOTICE) => {
        clearHeartbeat();
        clearReconnectTimer();
        connRef.current = null;
        setPeerOnline(false);
        if (role !== 'host') {
            connectionIssueRef.current = true;
            setConnectionIssue(true);
        }
        setNotice(notice);
        reconnectTimerRef.current = setTimeout(handleReconnectExpired, RECONNECT_GRACE_MS);
    }, [clearHeartbeat, clearReconnectTimer, handleReconnectExpired, role]);

    const startHostHeartbeat = useCallback(() => {
        clearHeartbeat();
        lastPongAtRef.current = Date.now();

        heartbeatIntervalRef.current = setInterval(() => {
            const conn = connRef.current;
            if (!conn?.open) return;

            if (Date.now() - lastPongAtRef.current > HEARTBEAT_TIMEOUT_MS) {
                logger.error('Heartbeat timeout: guest did not respond');
                markPeerOffline(CONNECTION_CLOSED_NOTICE);
                return;
            }

            try {
                conn.send({ type: 'party:ping', payload: { at: Date.now() } });
            } catch (e) {
                logger.error('Heartbeat ping failed', e);
            }
        }, HEARTBEAT_INTERVAL_MS);
    }, [clearHeartbeat, markPeerOffline]);

    const startGuestHeartbeat = useCallback(() => {
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
        }

        heartbeatTimeoutRef.current = setTimeout(() => {
            logger.error('Heartbeat timeout: host did not ping');
            markPeerOffline(CONNECTION_CLOSED_NOTICE);
        }, HEARTBEAT_TIMEOUT_MS);
    }, [markPeerOffline]);

    const startGame = useCallback((conn, tgt) => {
        targetRef.current = tgt;
        setTarget(tgt);
        stepRef.current = 0;
        pendingSubmit.current = null;
        setMyRecord([]);
        setPeerRecord([]);
        setWinner(null);
        setRestartPending(false);
        setPeerHasSubmitted(false);
        setSubmittedGuessPreview('');
        connectionIssueRef.current = false;
        setConnectionIssue(false);
        setPeerOnline(true);
        updatePhase(PHASE.PLAYING);
        setNotice('');
        logger.info(`Game started. Target: ${tgt}`);
    }, [updatePhase]);

    const restartGameAsHost = useCallback((requestedBy = userName) => {
        if (role !== 'host') return false;
        const tgt = createTarget();
        sendMsg('party:restart', { requestedBy });
        sendMsg('party:start', { target: tgt });
        startGame(connRef.current, tgt);
        return true;
    }, [role, sendMsg, startGame, userName]);

    const handleMessage = useCallback((data) => {
        logger.info(`Received: ${data.type}`);
        switch (data.type) {
            case 'party:hello': {
                setPeerName(data.payload.name);
                setPeerOnline(true);
                const peerSessionId = data.payload.sessionId || '';

                if (role !== 'host') {
                    peerSessionIdRef.current = peerSessionId;
                    break;
                }

                const isReconnectWindowOpen = Boolean(reconnectTimerRef.current);
                const isReconnect = peerSessionId
                    && peerSessionIdRef.current
                    && peerSessionIdRef.current === peerSessionId
                    && isReconnectWindowOpen;

                if (isReconnectWindowOpen && !isReconnect) {
                    suppressCloseNoticeRef.current = true;
                    const rejectedConn = connRef.current;
                    connRef.current = null;
                    rejectedConn?.close();
                    break;
                }

                peerSessionIdRef.current = peerSessionId;
                clearReconnectTimer();

                if (isReconnect) {
                    if (pendingSubmit.current?.fromPeer) {
                        pendingSubmit.current = null;
                        setPeerHasSubmitted(false);
                    }
                    sendMsg('party:sync', createVisibleSnapshot());
                    setNotice(formatWording("party.status.reconnected", {}));
                    break;
                }

                if (phaseRef.current === PHASE.CONNECTING || phaseRef.current === PHASE.WAITING_TARGET) {
                    const tgt = createTarget();
                    sendMsg('party:start', { target: tgt });
                    startGame(connRef.current, tgt);
                }
                break;
            }
            case 'party:start': {
                const tgt = data.payload.target;
                startGame(connRef.current, tgt);
                break;
            }
            case 'party:sync': {
                applyVisibleSnapshot(data.payload);
                break;
            }
            case 'party:request-restart': {
                logger.info('Ignored restart request: only host can restart');
                break;
            }
            case 'party:restart': {
                setRestartPending(false);
                setNotice(formatWording("party.status.restart.accepted", {}));
                break;
            }
            case 'party:ping': {
                if (role !== 'host') {
                    startGuestHeartbeat();
                    sendMsg('party:pong', { at: Date.now() });
                }
                break;
            }
            case 'party:pong': {
                if (role === 'host') {
                    lastPongAtRef.current = Date.now();
                }
                break;
            }
            case 'party:leave': {
                if (role === 'host') {
                    resetHostToWaiting();
                } else {
                    returnGuestToLobby();
                }
                break;
            }
            case 'party:submit': {
                const peerEntry = {
                    guess: data.payload.guess,
                    a: data.payload.a,
                    b: data.payload.b,
                    step: data.payload.step,
                };

                const myEntry = pendingSubmit.current;
                if (!myEntry) {
                    pendingSubmit.current = { fromPeer: peerEntry };
                    setPeerHasSubmitted(true);
                    break;
                }

                const isMePeerPending = myEntry.fromPeer !== undefined;
                if (isMePeerPending) {
                    break;
                }

                const updatedMy = [...myRecordRef.current, myEntry];
                const updatedPeer = [...peerRecordRef.current, peerEntry];
                setMyRecord(updatedMy);
                setPeerRecord(updatedPeer);
                pendingSubmit.current = null;
                setPeerHasSubmitted(false);
                setSubmittedGuessPreview('');
                setNotice('');

                const myWin = myEntry.a === 4;
                const peerWin = peerEntry.a === 4;

                if (myWin && peerWin) {
                    setWinner('draw');
                    setWinnerStep(myEntry.step);
                    updatePhase(PHASE.WIN);
                } else if (myWin) {
                    setWinner('me');
                    setWinnerStep(myEntry.step);
                    updatePhase(PHASE.WIN);
                } else if (peerWin) {
                    setWinner('peer');
                    setWinnerStep(peerEntry.step);
                    updatePhase(PHASE.WIN);
                } else {
                    setMyNum('');
                    updatePhase(PHASE.PLAYING);
                }
                break;
            }
            default:
                logger.error('Unknown message type', data.type);
        }
    }, [applyVisibleSnapshot, clearReconnectTimer, createVisibleSnapshot, resetHostToWaiting, returnGuestToLobby, role, sendMsg, startGame, startGuestHeartbeat, updatePhase]);

    // Handle the case where peer submitted BEFORE me (stored as fromPeer), then I submit
    const handleMySubmitWithPeerPending = useCallback((myEntry) => {
        const stored = pendingSubmit.current;
        if (!stored || !stored.fromPeer) return false;

        const peerEntry = stored.fromPeer;
        pendingSubmit.current = null;

        const updatedMy = [...myRecordRef.current, myEntry];
        const updatedPeer = [...peerRecordRef.current, peerEntry];
        setMyRecord(updatedMy);
        setPeerRecord(updatedPeer);
        setPeerHasSubmitted(false);
        setSubmittedGuessPreview('');
        setNotice('');

        const myWin = myEntry.a === 4;
        const peerWin = peerEntry.a === 4;

        if (myWin && peerWin) {
            setWinner('draw');
            setWinnerStep(myEntry.step);
            updatePhase(PHASE.WIN);
        } else if (myWin) {
            setWinner('me');
            setWinnerStep(myEntry.step);
            updatePhase(PHASE.WIN);
        } else if (peerWin) {
            setWinner('peer');
            setWinnerStep(peerEntry.step);
            updatePhase(PHASE.WIN);
        } else {
            setMyNum('');
            updatePhase(PHASE.PLAYING);
        }
        return true;
    }, [updatePhase]);

    const wireConn = useCallback((conn) => {
        connRef.current = conn;
        startConnectionTimer();
        conn.on('open', () => {
            clearConnectionTimer();
            connectionIssueRef.current = false;
            setConnectionIssue(false);
            setPeerOnline(true);
            logger.info('Connection opened');
            if (role === 'host') startHostHeartbeat();
            else startGuestHeartbeat();
        });
        conn.on('data', handleMessage);
        conn.on('error', (error) => {
            clearConnectionTimer();
            showConnectionIssue(CONNECTION_FAILED_NOTICE, error);
        });
        conn.on('close', () => {
            clearConnectionTimer();
            logger.info('Connection closed');
            if (suppressCloseNoticeRef.current) {
                suppressCloseNoticeRef.current = false;
                return;
            }
            if (connectionIssueRef.current) return;
            markPeerOffline(CONNECTION_CLOSED_NOTICE);
        });
        conn.peerConnection?.addEventListener('iceconnectionstatechange', () => {
            const state = conn.peerConnection?.iceConnectionState;
            logger.info(`ICE connection state: ${state}`);
            if (state === 'disconnected') {
                markPeerOffline(CONNECTION_CLOSED_NOTICE);
            } else if ((state === 'connected' || state === 'completed') && conn.open) {
                connRef.current = conn;
                clearReconnectTimer();
                connectionIssueRef.current = false;
                setConnectionIssue(false);
                setPeerOnline(true);
                setNotice('');
                if (role === 'host') startHostHeartbeat();
                else startGuestHeartbeat();
            } else if (state === 'failed') {
                showConnectionIssue(CONNECTION_FAILED_NOTICE);
            }
        });
    }, [clearConnectionTimer, clearReconnectTimer, handleMessage, markPeerOffline, role, showConnectionIssue, startConnectionTimer, startGuestHeartbeat, startHostHeartbeat]);

    const handleRetryJoin = useCallback(() => {
        if (role === 'host') return;

        releasePeerResources(false, false);
        connectionIssueRef.current = false;
        setConnectionIssue(false);
        setPeerOnline(false);
        setNotice(formatWording("party.status.connecting", {}));
        updatePhase(PHASE.CONNECTING);
        reconnectTimerRef.current = setTimeout(handleReconnectExpired, RECONNECT_GRACE_MS);
        setRetryKey((key) => key + 1);
    }, [handleReconnectExpired, releasePeerResources, role, updatePhase]);

    const handleLeavePage = useCallback(() => {
        clearPartyRoom();
        releasePeerResources(true);
        navigate("/", { state: { stage: "party_setup" } });
    }, [navigate, releasePeerResources]);

    const handleCopyInviteLink = useCallback(async () => {
        if (!inviteLink) return;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(inviteLink);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = inviteLink;
                textArea.setAttribute('readonly', '');
                textArea.style.position = 'fixed';
                textArea.style.opacity = '0';
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            setInviteCopied(true);
            clearCopyNoticeTimer();
            copyNoticeTimerRef.current = setTimeout(() => setInviteCopied(false), 1500);
        } catch (e) {
            logger.error('Copy invite link failed', e);
            setNotice(formatWording("party.invite.copyFailed", {}));
            setTimeout(() => setNotice(''), 1500);
        }
    }, [clearCopyNoticeTimer, inviteLink]);

    // Restore username from localStorage after page eviction (Redux state resets to defaults)
    useEffect(() => {
        const savedName = window.localStorage.getItem('playerName');
        if (savedName) dispatch(setUser(savedName));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        let destroyed = false;

        const init = async () => {
            if (inviteRoomCode) return;

            try {
                const savedRoom = loadPartyRoom();

                // Detect guest page eviction: Redux reset role to 'host'/'' but session says guest
                if (role === 'host' && !roomID && savedRoom?.role === 'guest' && savedRoom?.roomCode) {
                    dispatch(setRole('guest'));
                    dispatch(setRoom(savedRoom.roomCode));
                    return; // Re-render with corrected state will re-trigger init as guest
                }

                if (role === 'host') {
                    suppressPeerIssueRef.current = false;
                    connectionIssueRef.current = false;
                    setConnectionIssue(false);

                    const codeToTry = savedRoom?.role === 'host' ? savedRoom.roomCode : null;
                    const code = codeToTry || String(Math.floor(100000 + Math.random() * 900000));

                    setRoomCode(code);
                    setNotice(formatWording("party.status.waiting.opponent", {}));

                    let peer;
                    try {
                        peer = await createHostPeer(code);
                    } catch (e) {
                        if (e.type === 'unavailable-id' && codeToTry) {
                            // Saved peer ID still registered on signal server; clear session and retry with fresh code
                            clearPartyRoom();
                            if (!destroyed) setRetryKey(k => k + 1);
                            return;
                        }
                        throw e;
                    }

                    if (destroyed) { peer.destroy(); return; }
                    peerRef.current = peer;
                    savePartyRoom('host', code);
                    peer.on('error', (error) => {
                        if (suppressPeerIssueRef.current) return;
                        if (error.type === 'unavailable-id') {
                            // Peer ID taken at runtime (e.g. during reconnect); reset session and retry
                            clearPartyRoom();
                            setRetryKey(k => k + 1);
                            return;
                        }
                        showConnectionIssue(CONNECTION_FAILED_NOTICE, error);
                    });
                    peer.on('disconnected', () => {
                        if (suppressPeerIssueRef.current) {
                            suppressPeerIssueRef.current = false;
                            return;
                        }
                        const activePeer = peerRef.current;
                        if (!activePeer || activePeer.destroyed) return;
                        const now = Date.now();
                        if (now - signalingReconnectAtRef.current < 15000) return;
                        signalingReconnectAtRef.current = now;
                        logger.info('PeerJS host signaling disconnected, reconnecting...');
                        try { activePeer.reconnect(); } catch (err) {
                            signalingReconnectAtRef.current = 0;
                            showConnectionIssue(CONNECTION_FAILED_NOTICE, err);
                        }
                    });

                    peer.on('connection', (conn) => {
                        wireConn(conn);
                        conn.on('open', () => {
                            sendMsg('party:hello', { name: userName, sessionId: sessionIdRef.current });
                        });
                    });
                } else {
                    suppressPeerIssueRef.current = false;
                    connectionIssueRef.current = false;
                    setConnectionIssue(false);
                    savePartyRoom('guest', roomID);
                    setNotice(formatWording("party.status.connecting", {}));
                    const peer = await createGuestPeer();
                    if (destroyed) { peer.destroy(); return; }
                    peerRef.current = peer;
                    peer.on('error', (error) => {
                        if (suppressPeerIssueRef.current) return;
                        showConnectionIssue(CONNECTION_FAILED_NOTICE, error);
                    });
                    peer.on('disconnected', () => {
                        if (suppressPeerIssueRef.current) {
                            suppressPeerIssueRef.current = false;
                            return;
                        }
                        const activePeer = peerRef.current;
                        if (!activePeer || activePeer.destroyed) return;
                        const now = Date.now();
                        if (now - signalingReconnectAtRef.current < 15000) return;
                        signalingReconnectAtRef.current = now;
                        logger.info('PeerJS guest signaling disconnected, reconnecting...');
                        try { activePeer.reconnect(); } catch (err) {
                            signalingReconnectAtRef.current = 0;
                            showConnectionIssue(CONNECTION_FAILED_NOTICE, err);
                        }
                    });

                    const conn = connectToHost(peer, roomID);
                    wireConn(conn);
                    updatePhase(PHASE.WAITING_TARGET);

                    conn.on('open', () => {
                        sendMsg('party:hello', { name: userName, sessionId: sessionIdRef.current });
                        setNotice('');
                    });
                }
            } catch (e) {
                showConnectionIssue(CONNECTION_FAILED_NOTICE, e);
            }
        };

        init();

        return () => {
            destroyed = true;
            releasePeerResources(false, false);
        };
    }, [dispatch, inviteRoomCode, releasePeerResources, retryKey, roomID, role, sendMsg, showConnectionIssue, startGame, updatePhase, userName, wireConn]);

    useEffect(() => clearCopyNoticeTimer, [clearCopyNoticeTimer]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState !== 'visible') return;
            const peer = peerRef.current;
            if (!peer || !peer.disconnected || peer.destroyed) return;
            const now = Date.now();
            if (now - signalingReconnectAtRef.current < 15000) return;
            signalingReconnectAtRef.current = now;
            logger.info('Page became visible, reconnecting PeerJS signaling...');
            try { peer.reconnect(); } catch (e) {
                signalingReconnectAtRef.current = 0;
                logger.error('PeerJS reconnect on visibility failed', e);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    const compareAnswer = useCallback(() => {
        if (phase !== PHASE.PLAYING) return;
        if (!peerOnline) {
            setNotice(CONNECTION_CLOSED_NOTICE);
            return;
        }

        const guess = myNum.replace(/\D/g, '');
        if (!checkInputs(guess) || [...new Set(guess)].length < 4 || guess.length !== 4) {
            setNotice(formatWording("error.invalid.inputNumber", {}));
            setTimeout(() => setNotice(''), 1500);
            return;
        }

        stepRef.current += 1;
        const { a, b } = calculateAB(guess, targetRef.current);
        const myEntry = { guess, a, b, step: stepRef.current };

        // Check if peer already submitted this round (stored as fromPeer)
        const hadPeerPending = handleMySubmitWithPeerPending(myEntry);
        if (!hadPeerPending) {
            pendingSubmit.current = myEntry;
            updatePhase(PHASE.SUBMITTED);
            setNotice(formatWording("party.status.waiting.answer", {}));
            setSubmittedGuessPreview(guess);
        }

        sendMsg('party:submit', { guess, a, b, step: stepRef.current });
        setMyNum('');
    }, [phase, peerOnline, myNum, sendMsg, handleMySubmitWithPeerPending, updatePhase]);

    const handleRestartClick = useCallback(() => {
        if (phase !== PHASE.WIN || restartPending || role !== 'host') return;
        if (!window.confirm(formatWording("alert.restart.confirm", {}))) return;

        restartGameAsHost(userName);
    }, [phase, restartPending, restartGameAsHost, role, userName]);

    const renderRecord = (record, label) => (
        <div className="party-record-column">
            <div className="party-record-label">{label}</div>
            {record.map((entry, i) => (
                <div key={i} className="party-record-entry">
                    <span className="party-record-guess">{entry.guess.split('').join(' ')}</span>
                    <span className="party-record-ab">{entry.a}A {entry.b}B</span>
                </div>
            ))}
        </div>
    );

    const renderSidebar = () => {
        if (phase !== PHASE.WIN) return null;
        const winnerName = winner === 'me' ? userName : winner === 'peer' ? peerName : null;
        return (
            <div className="party-sidebar">
                <div className="party-sidebar-title">{formatWording("party.win.target", {})}</div>
                <div className="party-sidebar-target">{target.split('').join(' ')}</div>
                <div className="party-sidebar-divider" />
                {winner === 'draw' ? (
                    <div className="party-sidebar-winner">{formatWording("party.win.draw", {})}</div>
                ) : (
                    <>
                        <div className="party-sidebar-winner">
                            {formatWording("party.win.winner", { name: winnerName })}
                        </div>
                        <div className="party-sidebar-steps">
                            {formatWording("party.win.steps", { count: winnerStep })}
                        </div>
                    </>
                )}
            </div>
        );
    };

    const renderConnecting = () => (
        <div className="party-connecting">
            {role === 'host' && roomCode && (
                <div className="party-room-code-block">
                    <div className="party-room-code-label">{formatWording("party.roomCode.label", {})}</div>
                    <div className="party-room-code">{roomCode}</div>
                    {inviteLink && (
                        <div className="party-invite-block">
                            <QRCodeSVG
                                value={inviteLink}
                                size={156}
                                bgColor="#ffffff"
                                fgColor="#1d1d1f"
                                level="M"
                                marginSize={2}
                                className="party-invite-qr"
                            />
                            <div className="party-invite-link" title={inviteLink}>{inviteLink}</div>
                            <button type="button" className="party-copy-link-btn" onClick={handleCopyInviteLink}>
                                {inviteCopied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                                <span>
                                    {formatWording(inviteCopied ? "party.invite.copied" : "party.invite.copyLink", {})}
                                </span>
                            </button>
                        </div>
                    )}
                </div>
            )}
            <div className="party-status">{notice}</div>
            {role !== 'host' && connectionIssue && (
                <div className="party-connection-actions">
                    <button type="button" className="party-retry-btn" onClick={handleRetryJoin}>
                        再次嘗試
                    </button>
                    <button
                        type="button"
                        className="party-change-room-btn"
                        onClick={() => navigate("/", { state: { stage: "party_setup" } })}>
                        重新輸入代碼
                    </button>
                </div>
            )}
        </div>
    );

    const isGamePhase = phase === PHASE.PLAYING || phase === PHASE.SUBMITTED || phase === PHASE.WIN;
    const partyStatus = notice || (
        phase === PHASE.PLAYING && peerHasSubmitted
            ? formatWording("party.status.peerSubmitted", { name: peerName || '對方' })
            : ''
    );

    return (
        <div className="container-party">
            <button type="button" className="game-back-btn" onClick={handleLeavePage}>
                <FiArrowLeft aria-hidden="true" />
                <span>{formatWording("general.btn.back", {})}</span>
            </button>
            <div className="party-header">
                <span className="party-player-name">{userName}</span>
                {peerName && <span className="party-vs"> vs </span>}
                {peerName && (
                    <span className="party-peer">
                        <span className="party-peer-name">{peerName}</span>
                        <span
                            className={`party-peer-status ${peerOnline ? 'is-online' : 'is-offline'}`}
                            aria-label={formatWording(peerOnline ? "party.connection.online" : "party.connection.offline", {})}
                        />
                    </span>
                )}
            </div>

            {!isGamePhase && renderConnecting()}

            {isGamePhase && (
                <div className="party-layout">
                    <div className="party-game-area">
                        {phase !== PHASE.WIN && (
                            <div className="party-input-block">
                                <DigitInputGroup
                                    value={myNum}
                                    disabled={phase !== PHASE.PLAYING || !peerOnline}
                                    onChange={setMyNum}
                                    onSubmit={compareAnswer}
                                    placeholder={formatWording("general.local.inputNumber.placeHolder", {})}
                                />
                                <button
                                    type="button"
                                    className="submit-answer-btn"
                                    disabled={phase !== PHASE.PLAYING || !peerOnline}
                                    onClick={compareAnswer}>
                                    {formatWording("party.btn.submit", {})}
                                </button>
                            </div>
                        )}

                        {phase !== PHASE.WIN && partyStatus && (
                            <div className="party-status">{partyStatus}</div>
                        )}

                        {phase !== PHASE.WIN && role !== 'host' && !peerOnline && connectionIssue && (
                            <div className="party-connection-actions party-connection-actions-inline">
                                <button type="button" className="party-retry-btn" onClick={handleRetryJoin}>
                                    再次嘗試
                                </button>
                            </div>
                        )}

                        {phase === PHASE.SUBMITTED && submittedGuessPreview && (
                            <div className="party-submitted-preview" aria-label={formatWording("party.status.mySubmitted", {})}>
                                {submittedGuessPreview.split('').join(' ')}
                            </div>
                        )}

                        {phase === PHASE.WIN && (
                            <div className="party-win-panel">
                                <div className="party-win-banner">
                                    {winner === 'draw'
                                        ? formatWording("party.win.draw", {})
                                        : formatWording("party.win.winner", {
                                            name: winner === 'me' ? userName : peerName
                                        })
                                    }
                                </div>
                                {role === 'host' && (
                                    <button
                                        type="button"
                                        className="party-restart-btn"
                                        disabled={restartPending}
                                        onClick={handleRestartClick}>
                                        {formatWording(restartPending ? "party.restart.pending" : "party.btn.restart", {})}
                                        <VscDebugRestart aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        )}

                        <div className="party-records">
                            {renderRecord(myRecord, formatWording("party.record.mine", {}))}
                            {renderRecord(peerRecord, formatWording("party.record.peer", { name: peerName || '對方' }))}
                        </div>
                    </div>

                    {renderSidebar()}
                </div>
            )}
        </div>
    );
};

export default React.memo(PartyPage);
