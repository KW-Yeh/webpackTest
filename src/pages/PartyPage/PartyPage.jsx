import '../../css/party.scss';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { GrReturn } from "react-icons/gr";
import { VscDebugRestart } from "react-icons/vsc";

import { Logger } from "../../module/logger";
import { checkInputs } from "../../module/checkInputs";
import { shuffleArray } from "../../module/shuffleArray";
import { createHostPeer, createGuestPeer, connectToHost } from "../../module/peer";
import { env } from "../../../env.js";
import { formatWording } from "../../../utils/langUtils";

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
const CONNECTION_CLOSED_NOTICE = '對方已離線或連線已中斷。';
const HOST_LEFT_NOTICE = '房主已離開，已回到遊戲大廳。';
const GUEST_LEFT_NOTICE = '玩家已離開，等待新的玩家加入...';
const HEARTBEAT_INTERVAL_MS = 5000;
const HEARTBEAT_TIMEOUT_MS = 20000;

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

    const peerRef = useRef(null);
    const connRef = useRef(null);
    const phaseRef = useRef(PHASE.CONNECTING);
    const targetRef = useRef('');
    const stepRef = useRef(0);
    const pendingSubmit = useRef(null);
    const myRecordRef = useRef([]);
    const peerRecordRef = useRef([]);
    const connectionTimerRef = useRef(null);
    const heartbeatIntervalRef = useRef(null);
    const heartbeatTimeoutRef = useRef(null);
    const lastPongAtRef = useRef(0);
    const connectionIssueRef = useRef(false);
    const suppressCloseNoticeRef = useRef(false);
    const suppressPeerIssueRef = useRef(false);

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
        connectionIssueRef.current = connectionIssue;
    }, [connectionIssue]);

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

    const releaseConnectionResources = useCallback((suppressCloseNotice = true) => {
        clearConnectionTimer();
        clearHeartbeat();
        if (suppressCloseNotice) suppressCloseNoticeRef.current = true;

        const currentConn = connRef.current;
        connRef.current = null;
        currentConn?.close();
    }, [clearConnectionTimer, clearHeartbeat]);

    const releasePeerResources = useCallback((notifyPeer = false) => {
        if (notifyPeer && connRef.current?.open) {
            try {
                connRef.current.send({ type: 'party:leave', payload: { role, name: userName } });
            } catch (e) {
                logger.error('Leave notice failed', e);
            }
        }

        releaseConnectionResources();

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

    const resetHostToWaiting = useCallback((notice = GUEST_LEFT_NOTICE, suppressCloseNotice = true) => {
        releaseConnectionResources(suppressCloseNotice);
        targetRef.current = '';
        stepRef.current = 0;
        pendingSubmit.current = null;
        connectionIssueRef.current = false;
        setConnectionIssue(false);
        setPeerName('');
        setMyNum('');
        setMyRecord([]);
        setPeerRecord([]);
        setWinner(null);
        setWinnerStep(0);
        setTarget('');
        setRestartPending(false);
        updatePhase(PHASE.CONNECTING);
        setNotice(notice);
    }, [releaseConnectionResources, updatePhase]);

    const returnGuestToLobby = useCallback((notice = HOST_LEFT_NOTICE) => {
        window.sessionStorage.setItem('partyExitNotice', notice);
        releasePeerResources(false);
        navigate("/", { replace: true, state: { notice } });
    }, [navigate, releasePeerResources]);

    const startHostHeartbeat = useCallback(() => {
        clearHeartbeat();
        lastPongAtRef.current = Date.now();

        heartbeatIntervalRef.current = setInterval(() => {
            const conn = connRef.current;
            if (!conn?.open) return;

            if (Date.now() - lastPongAtRef.current > HEARTBEAT_TIMEOUT_MS) {
                logger.error('Heartbeat timeout: guest did not respond');
                resetHostToWaiting(GUEST_LEFT_NOTICE);
                return;
            }

            try {
                conn.send({ type: 'party:ping', payload: { at: Date.now() } });
            } catch (e) {
                logger.error('Heartbeat ping failed', e);
            }
        }, HEARTBEAT_INTERVAL_MS);
    }, [clearHeartbeat, resetHostToWaiting]);

    const startGuestHeartbeat = useCallback(() => {
        if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
        }

        heartbeatTimeoutRef.current = setTimeout(() => {
            logger.error('Heartbeat timeout: host did not ping');
            returnGuestToLobby(HOST_LEFT_NOTICE);
        }, HEARTBEAT_TIMEOUT_MS);
    }, [returnGuestToLobby]);

    const startGame = useCallback((conn, tgt) => {
        targetRef.current = tgt;
        setTarget(tgt);
        stepRef.current = 0;
        pendingSubmit.current = null;
        setMyRecord([]);
        setPeerRecord([]);
        setWinner(null);
        setRestartPending(false);
        connectionIssueRef.current = false;
        setConnectionIssue(false);
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
                break;
            }
            case 'party:start': {
                const tgt = data.payload.target;
                startGame(connRef.current, tgt);
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
                    // Peer submitted first; store it and wait for my submission
                    pendingSubmit.current = { fromPeer: peerEntry };
                    break;
                }

                // Both submitted — reveal
                const isMePeerPending = myEntry.fromPeer !== undefined;
                if (isMePeerPending) {
                    // This shouldn't happen in normal flow
                    break;
                }

                const updatedMy = [...myRecordRef.current, myEntry];
                const updatedPeer = [...peerRecordRef.current, peerEntry];
                setMyRecord(updatedMy);
                setPeerRecord(updatedPeer);
                pendingSubmit.current = null;

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
    }, [resetHostToWaiting, returnGuestToLobby, role, sendMsg, startGame, startGuestHeartbeat, updatePhase]);

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
            if (role === 'host') {
                resetHostToWaiting(GUEST_LEFT_NOTICE, false);
            } else {
                returnGuestToLobby(HOST_LEFT_NOTICE);
            }
        });
        conn.peerConnection?.addEventListener('iceconnectionstatechange', () => {
            const state = conn.peerConnection?.iceConnectionState;
            logger.info(`ICE connection state: ${state}`);
            if (state === 'failed' || state === 'disconnected') {
                showConnectionIssue(CONNECTION_FAILED_NOTICE);
            }
        });
    }, [clearConnectionTimer, handleMessage, resetHostToWaiting, returnGuestToLobby, role, showConnectionIssue, startConnectionTimer, startGuestHeartbeat, startHostHeartbeat]);

    const handleRetryJoin = useCallback(() => {
        if (role === 'host') return;

        releasePeerResources();
        setPeerName('');
        connectionIssueRef.current = false;
        setConnectionIssue(false);
        setNotice(formatWording("party.status.connecting", {}));
        updatePhase(PHASE.CONNECTING);
        setRetryKey((key) => key + 1);
    }, [releasePeerResources, role, updatePhase]);

    const handleLeavePage = useCallback(() => {
        releasePeerResources(true);
        navigate("/", { state: { stage: "party_setup" } });
    }, [navigate, releasePeerResources]);

    useEffect(() => {
        let destroyed = false;

        const init = async () => {
            try {
                if (role === 'host') {
                    suppressPeerIssueRef.current = false;
                    connectionIssueRef.current = false;
                    setConnectionIssue(false);
                    const code = String(Math.floor(100000 + Math.random() * 900000));
                    setRoomCode(code);
                    setNotice(formatWording("party.status.waiting.opponent", {}));

                    const peer = await createHostPeer(code);
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
                        showConnectionIssue(CONNECTION_FAILED_NOTICE);
                    });

                    peer.on('connection', (conn) => {
                        wireConn(conn);
                        conn.on('open', () => {
                            sendMsg('party:hello', { name: userName });
                            // Generate and share target
                            const tgt = createTarget();
                            sendMsg('party:start', { target: tgt });
                            startGame(conn, tgt);
                        });
                    });
                } else {
                    suppressPeerIssueRef.current = false;
                    connectionIssueRef.current = false;
                    setConnectionIssue(false);
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
                        showConnectionIssue(CONNECTION_FAILED_NOTICE);
                    });

                    const conn = connectToHost(peer, roomID);
                    wireConn(conn);
                    updatePhase(PHASE.WAITING_TARGET);

                    conn.on('open', () => {
                        sendMsg('party:hello', { name: userName });
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
            releasePeerResources(true);
        };
    }, [releasePeerResources, retryKey, roomID, role, sendMsg, showConnectionIssue, startGame, updatePhase, userName, wireConn]);

    useEffect(() => {
        const handlePageExit = () => releasePeerResources(true);

        window.addEventListener('pagehide', handlePageExit);
        window.addEventListener('beforeunload', handlePageExit);

        return () => {
            window.removeEventListener('pagehide', handlePageExit);
            window.removeEventListener('beforeunload', handlePageExit);
        };
    }, [releasePeerResources]);

    const compareAnswer = useCallback(() => {
        if (phase !== PHASE.PLAYING) return;
        if (!checkInputs(myNum) || [...new Set(myNum)].length < 4 || myNum.length !== 4) {
            setNotice(formatWording("error.invalid.inputNumber", {}));
            setTimeout(() => setNotice(''), 1500);
            return;
        }

        stepRef.current += 1;
        const { a, b } = calculateAB(myNum, targetRef.current);
        const myEntry = { guess: myNum, a, b, step: stepRef.current };

        // Check if peer already submitted this round (stored as fromPeer)
        const hadPeerPending = handleMySubmitWithPeerPending(myEntry);
        if (!hadPeerPending) {
            pendingSubmit.current = myEntry;
            updatePhase(PHASE.SUBMITTED);
            setNotice(formatWording("party.status.waiting.answer", {}));
        }

        sendMsg('party:submit', { guess: myNum, a, b, step: stepRef.current });
        setMyNum('');
    }, [phase, myNum, sendMsg, handleMySubmitWithPeerPending, updatePhase]);

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

    return (
        <div className="container-party">
            <button type="button" className="game-back-btn" onClick={handleLeavePage}>
                <FiArrowLeft aria-hidden="true" />
                <span>{formatWording("general.btn.back", {})}</span>
            </button>
            <div className="party-header">
                <span className="party-player-name">{userName}</span>
                {peerName && <span className="party-vs"> vs </span>}
                {peerName && <span className="party-peer-name">{peerName}</span>}
            </div>

            {!isGamePhase && renderConnecting()}

            {isGamePhase && (
                <div className="party-layout">
                    <div className="party-game-area">
                        {phase !== PHASE.WIN && (
                            <div className="party-input-block">
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={myNum}
                                    disabled={phase !== PHASE.PLAYING}
                                    onChange={(e) => setMyNum(e.target.value.slice(0, 4))}
                                    onKeyUp={(e) => { if (e.key === 'Enter') compareAnswer(); }}
                                    placeholder={formatWording("general.local.inputNumber.placeHolder", {})}
                                />
                                <i className="enter" onClick={compareAnswer}><GrReturn /></i>
                            </div>
                        )}

                        {phase === PHASE.SUBMITTED && (
                            <div className="party-status">{notice}</div>
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
