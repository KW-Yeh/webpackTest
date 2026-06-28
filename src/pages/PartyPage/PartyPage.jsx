import '../../css/party.scss';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { shallowEqual, useSelector } from "react-redux";
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

    const peerRef = useRef(null);
    const connRef = useRef(null);
    const phaseRef = useRef(PHASE.CONNECTING);
    const targetRef = useRef('');
    const stepRef = useRef(0);
    const pendingSubmit = useRef(null);
    const myRecordRef = useRef([]);
    const peerRecordRef = useRef([]);

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

    const sendMsg = useCallback((type, payload) => {
        try {
            connRef.current?.send({ type, payload });
        } catch (e) {
            logger.error('Send failed', e);
        }
    }, []);

    const startGame = useCallback((conn, tgt) => {
        targetRef.current = tgt;
        setTarget(tgt);
        stepRef.current = 0;
        pendingSubmit.current = null;
        setMyRecord([]);
        setPeerRecord([]);
        setWinner(null);
        setRestartPending(false);
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
                if (role !== 'host' || phaseRef.current !== PHASE.WIN) {
                    logger.info('Ignored restart request outside win phase');
                    break;
                }

                const requestedName = data.payload && data.payload.name
                    ? data.payload.name
                    : formatWording("general.default.playerName", {});
                setNotice(formatWording("party.status.restart.requested", { name: requestedName }));
                restartGameAsHost(requestedName);
                break;
            }
            case 'party:restart': {
                setRestartPending(false);
                setNotice(formatWording("party.status.restart.accepted", {}));
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
    }, [restartGameAsHost, role, startGame, updatePhase]);

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
        conn.on('data', handleMessage);
        conn.on('close', () => {
            logger.info('Connection closed');
            setNotice('對方已離線');
        });
    }, [handleMessage]);

    useEffect(() => {
        let destroyed = false;

        const init = async () => {
            try {
                if (role === 'host') {
                    const code = String(Math.floor(100000 + Math.random() * 900000));
                    setRoomCode(code);
                    setNotice(formatWording("party.status.waiting.opponent", {}));

                    const peer = await createHostPeer(code);
                    if (destroyed) { peer.destroy(); return; }
                    peerRef.current = peer;

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
                    setNotice(formatWording("party.status.connecting", {}));
                    const peer = await createGuestPeer();
                    if (destroyed) { peer.destroy(); return; }
                    peerRef.current = peer;

                    const conn = connectToHost(peer, roomID);
                    wireConn(conn);
                    updatePhase(PHASE.WAITING_TARGET);

                    conn.on('open', () => {
                        sendMsg('party:hello', { name: userName });
                        setNotice('');
                    });
                }
            } catch (e) {
                logger.error('Peer init failed', e);
                setNotice('連線失敗，請重試');
            }
        };

        init();

        return () => {
            destroyed = true;
            connRef.current?.close();
            peerRef.current?.destroy();
        };
    }, []);

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
        if (phase !== PHASE.WIN || restartPending) return;

        if (role === 'host') {
            restartGameAsHost(userName);
            return;
        }

        setRestartPending(true);
        setNotice(formatWording("party.status.restart.pending", {}));
        sendMsg('party:request-restart', { name: userName });
    }, [phase, restartPending, restartGameAsHost, role, sendMsg, userName]);

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
        </div>
    );

    const isGamePhase = phase === PHASE.PLAYING || phase === PHASE.SUBMITTED || phase === PHASE.WIN;

    return (
        <div className="container-party">
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
                                    type="number"
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
                                <button
                                    type="button"
                                    className="party-restart-btn"
                                    disabled={restartPending}
                                    onClick={handleRestartClick}>
                                    {formatWording(restartPending ? "party.restart.pending" : "party.btn.restart", {})}
                                    <VscDebugRestart aria-hidden="true" />
                                </button>
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
