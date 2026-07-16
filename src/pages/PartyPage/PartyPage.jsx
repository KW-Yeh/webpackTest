import '../../css/party.scss';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';

import { setUser } from '../../component/Player/userSlice';
import { env } from '../../../env.js';
import { formatWording } from '../../../utils/langUtils';
import { shuffleArray } from '../../module/shuffleArray';
import { PARTY_MODE, PARTY_PHASE, usePartyRoom } from '../../module/usePartyRoom';
import CoopBoard from './CoopBoard.jsx';
import RaceBoard from './RaceBoard.jsx';
import WaitingRoom from './WaitingRoom.jsx';

const readSavedRoom = () => {
    try {
        const value = window.sessionStorage.getItem('bulls-cows-party-room');
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
};

const createTarget = () => shuffleArray([...env.GAME.NUMBER_RANGE]).slice(0, 4).join('');

const GameChat = ({ messages, meId, onSend }) => {
    const [text, setText] = useState('');

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        onSend(text);
        setText('');
    };

    return (
        <aside className="party-game-chat">
            <h2>{formatWording('party.waiting.chat.title', {})}</h2>
            <div className="party-game-chat-messages" aria-live="polite">
                {messages.map((message) => (
                    <div className={message.fromId === meId ? 'is-me' : ''} key={message.id}>
                        <strong>{message.name}</strong>
                        <span>{message.text}</span>
                    </div>
                ))}
            </div>
            <form onSubmit={handleSubmit}>
                <input
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    maxLength={300}
                    placeholder={formatWording('party.waiting.chat.placeholder', {})}
                    aria-label={formatWording('party.waiting.chat.placeholder', {})}
                />
                <button type="submit" disabled={!text.trim()}>{formatWording('party.waiting.chat.send', {})}</button>
            </form>
        </aside>
    );
};

const PartyPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const reduxName = useSelector((state) => state.userReducer.name, shallowEqual);
    const reduxRole = useSelector((state) => state.partyPageReducer.role, shallowEqual);
    const reduxRoomID = useSelector((state) => state.partyPageReducer.roomID, shallowEqual);
    const savedRoom = useMemo(readSavedRoom, []);
    const userName = reduxName || window.localStorage.getItem(env.LOCAL.STORAGE.PLAYER_NAME) || formatWording('general.default.playerName', {});
    const role = reduxRole === 'host' && !(savedRoom?.role === 'guest' && !reduxRoomID) ? 'host' : 'guest';
    const roomID = reduxRoomID || (role === 'guest' ? savedRoom?.roomCode || '' : '');
    const [inviteCopied, setInviteCopied] = useState(false);
    const room = usePartyRoom({ role, roomID, userName });
    const inviteLink = room.roomCode
        ? `${window.location.origin}${window.location.pathname}#/party?room=${encodeURIComponent(room.roomCode)}`
        : '';

    useEffect(() => {
        if (!reduxName && userName) dispatch(setUser(userName));
    }, [dispatch, reduxName, userName]);

    useEffect(() => {
        if (!room.closed || room.isHost) return;
        window.sessionStorage.setItem('partyExitNotice', room.notice);
        navigate('/', { replace: true, state: { stage: 'party_setup', notice: room.notice } });
    }, [navigate, room.closed, room.isHost, room.notice]);

    const leaveRoom = useCallback(() => {
        room.actions.leave();
        navigate('/', { replace: true, state: { stage: 'party_setup' } });
    }, [navigate, room.actions]);

    const copyInvite = useCallback(async () => {
        if (!inviteLink) return;
        try {
            await navigator.clipboard.writeText(inviteLink);
            setInviteCopied(true);
            setTimeout(() => setInviteCopied(false), 1500);
        } catch {
            setInviteCopied(false);
        }
    }, [inviteLink]);

    const startGame = useCallback(() => {
        room.actions.startGame(createTarget());
    }, [room.actions]);

    if (room.phase === PARTY_PHASE.CONNECTING) {
        return (
            <main className="container-party party-connecting">
                <div className="party-status" role="status">{room.notice || formatWording('party.status.connecting', {})}</div>
                {(room.connectionIssue || room.closed) && (
                    <button type="button" className="party-secondary-btn" onClick={leaveRoom}>
                        {formatWording('party.waiting.leave', {})}
                    </button>
                )}
            </main>
        );
    }

    if (room.phase === PARTY_PHASE.WAITING_ROOM) {
        return (
            <main className="container-party">
                <WaitingRoom
                    roomCode={room.roomCode}
                    inviteLink={inviteLink}
                    roster={room.roster}
                    messages={room.messages}
                    mode={room.mode}
                    isHost={room.isHost}
                    meId={room.me.id}
                    notice={room.notice}
                    onCopyInvite={copyInvite}
                    inviteCopied={inviteCopied}
                    onSendChat={room.actions.sendChat}
                    onModeChange={room.actions.setMode}
                    onStart={startGame}
                    onLeave={leaveRoom}
                />
            </main>
        );
    }

    const commonBoardProps = {
        game: room.game,
        roster: room.roster,
        meId: room.me.id,
        isResult: room.phase === PARTY_PHASE.RESULT,
        isHost: room.isHost,
        notice: room.notice,
        onReturnToWaiting: room.actions.returnToWaitingRoom,
    };

    return (
        <main className="container-party">
            <button type="button" className="game-back-btn" onClick={leaveRoom}>
                {formatWording('party.waiting.leave', {})}
            </button>
            <div className="party-playing-layout">
                {room.mode === PARTY_MODE.COOP ? (
                    <CoopBoard
                        {...commonBoardProps}
                        submittedIds={room.coopSubmittedIds}
                        onSubmit={room.actions.submitCoop}
                    />
                ) : (
                    <RaceBoard
                        {...commonBoardProps}
                        onProgress={room.actions.sendRaceProgress}
                        onWin={room.actions.sendRaceWin}
                    />
                )}
                <GameChat messages={room.messages} meId={room.me.id} onSend={room.actions.sendChat} />
            </div>
        </main>
    );
};

export default React.memo(PartyPage);
