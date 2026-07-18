import '../../css/party.scss';
import '../../css/main.scss';
import '../../css/opening_v2.scss';
import React from 'react';
import { MdCircleNotifications } from 'react-icons/md';

import WaitingRoom from '../PartyPage/WaitingRoom.jsx';
import CoopBoard from '../PartyPage/CoopBoard.jsx';
import RaceBoard from '../PartyPage/RaceBoard.jsx';
import Record from '../../component/Record/Record.jsx';
import Notice from '../../component/Notice/Notice.jsx';
import InfoBlock from '../../component/InfoBlock/InfoBlock.jsx';
import Loader from '../../component/Loader/Loader.jsx';

import { PARTY_MODE } from '../../module/partyProtocol';
import { env } from '../../../env.js';
import { formatWording } from '../../../utils/langUtils';

const noop = () => {};

// ---- Stable mock data (deterministic for visual snapshots) ----

const ME_ID = 'peer-me';
const HOST_ID = 'peer-host';

const fullRoster = [
    { id: HOST_ID, name: '房主小明', online: true, isHost: true },
    { id: ME_ID, name: '我', online: true, isHost: false },
    { id: 'peer-3', name: '玩家阿華', online: true, isHost: false },
    { id: 'peer-4', name: '離線的小美', online: false, isHost: false },
];

const hostOnlyRoster = [
    { id: HOST_ID, name: '房主小明', online: true, isHost: true },
];

const mockMessages = [
    { id: 'm1', fromId: HOST_ID, name: '房主小明', text: '準備好了嗎？', at: 1700000000000 },
    { id: 'm2', fromId: ME_ID, name: '我', text: '準備好了！', at: 1700000005000 },
];

const coopGame = {
    target: '1234',
    startAt: 1700000000000,
    coop: {
        round: 3,
        rounds: [
            {
                round: 1,
                entries: [
                    { id: HOST_ID, guess: '5678', a: 0, b: 1 },
                    { id: ME_ID, guess: '1256', a: 2, b: 0 },
                ],
            },
            {
                round: 2,
                entries: [
                    { id: HOST_ID, guess: '1243', a: 2, b: 2 },
                    { id: ME_ID, guess: '1230', a: 3, b: 0 },
                ],
            },
        ],
    },
};

const raceGame = {
    target: '1234',
    startAt: 1700000000000,
    race: {
        wins: [],
        result: null,
        progress: {
            [HOST_ID]: { step: 4, a: 2, b: 1 },
            'peer-3': { step: 2, a: 1, b: 1 },
            'peer-4': { step: 0, a: 0, b: 0 },
        },
    },
};

const Screen = ({ id, title, className = '', children }) => (
    <section className="screen-case" data-screen={id}>
        <h3 className="screen-case-title">{title}</h3>
        <div className={`screen-case-body ${className}`}>{children}</div>
    </section>
);

// Presentational replica of PartyPage's inline GameChat (which is not exported),
// so party.scss `.party-game-chat` styling can be snapshotted. Dev/test only.
const GameChatMock = () => (
    <aside className="party-game-chat">
        <h2>{formatWording('party.waiting.chat.title', {})}</h2>
        <div className="party-game-chat-messages" aria-live="polite">
            {mockMessages.map((message) => (
                <div className={message.fromId === ME_ID ? 'is-me' : ''} key={message.id}>
                    <strong>{message.name}</strong>
                    <span>{message.text}</span>
                </div>
            ))}
        </div>
        <form onSubmit={(e) => e.preventDefault()}>
            <input
                value=""
                readOnly
                placeholder={formatWording('party.waiting.chat.placeholder', {})}
                aria-label={formatWording('party.waiting.chat.placeholder', {})}
            />
            <button type="submit" disabled>{formatWording('party.waiting.chat.send', {})}</button>
        </form>
    </aside>
);

const Screens = () => {
    return (
        <div className="screens-root" data-screen="root">
            <Screen id="waiting" title="WaitingRoom (host, full roster)">
                <main className="container-party">
                    <WaitingRoom
                        roomCode="123456"
                        inviteLink="https://example.com/#/party?room=123456"
                        roster={fullRoster}
                        messages={mockMessages}
                        mode={PARTY_MODE.COOP}
                        isHost={true}
                        meId={ME_ID}
                        notice=""
                        onCopyInvite={noop}
                        inviteCopied={false}
                        inviteAvailable={true}
                        onSendChat={noop}
                        onModeChange={noop}
                        onStart={noop}
                        onLeave={noop}
                    />
                </main>
            </Screen>

            <Screen id="waiting-host-only" title="WaitingRoom (host only / empty roster)">
                <main className="container-party">
                    <WaitingRoom
                        roomCode="654321"
                        inviteLink="https://example.com/#/party?room=654321"
                        roster={hostOnlyRoster}
                        messages={[]}
                        mode={PARTY_MODE.RACE}
                        isHost={true}
                        meId={HOST_ID}
                        notice=""
                        onCopyInvite={noop}
                        inviteCopied={false}
                        inviteAvailable={true}
                        onSendChat={noop}
                        onModeChange={noop}
                        onStart={noop}
                        onLeave={noop}
                    />
                </main>
            </Screen>

            <Screen id="coop" title="CoopBoard (playing)">
                <main className="container-party">
                    <div className="party-playing-layout">
                        <CoopBoard
                            game={coopGame}
                            roster={fullRoster}
                            meId={ME_ID}
                            submittedIds={[HOST_ID]}
                            isResult={false}
                            isHost={false}
                            notice=""
                            onSubmit={noop}
                            onReturnToWaiting={noop}
                        />
                    </div>
                </main>
            </Screen>

            <Screen id="race" title="RaceBoard (playing, opponent offline)">
                <main className="container-party">
                    <div className="party-playing-layout">
                        <RaceBoard
                            game={raceGame}
                            roster={fullRoster}
                            meId={ME_ID}
                            isResult={false}
                            isHost={false}
                            notice=""
                            onProgress={noop}
                            onWin={noop}
                            onReturnToWaiting={noop}
                        />
                    </div>
                </main>
            </Screen>

            <Screen id="chat" title="GameChat">
                <main className="container-party">
                    <div className="party-playing-layout">
                        <GameChatMock />
                    </div>
                </main>
            </Screen>

            <Screen id="sidebar" title="Party sidebar (night panel)">
                <main className="container-party">
                    <aside className="party-sidebar">
                        <div className="party-sidebar-title">{formatWording('party.record.mine', {})}</div>
                        <div className="party-sidebar-target">1 2 3 4</div>
                        <div className="party-sidebar-divider" />
                        <div className="party-sidebar-title">
                            {formatWording('party.waiting.players', {})}
                        </div>
                        <div className="party-peer">
                            <span className="party-peer-status is-online" />
                            <span className="party-peer-name">房主小明</span>
                        </div>
                        <div className="party-peer">
                            <span className="party-peer-status is-offline" />
                            <span className="party-peer-name">離線的小美</span>
                        </div>
                        <div className="party-sidebar-divider" />
                        <div className="party-sidebar-winner">房主小明</div>
                        <div className="party-sidebar-steps">6 步完成</div>
                    </aside>
                </main>
            </Screen>

            <Screen id="record" title="Record">
                <div className="container-main">
                    <div className="record-block">
                        <Record record={['1 2 3 4:2 A 1 B', '5 6 7 8:0 A 0 B', '1 3 5 7:1 A 2 B']} />
                    </div>
                </div>
            </Screen>

            <Screen id="infoblock" title="InfoBlock (rules)">
                <div className="container-main">
                    <div className="rule-block">
                        <InfoBlock text={env.GAME.RULE} />
                    </div>
                </div>
            </Screen>

            <Screen id="notice" title="Notice">
                <div className="container-main">
                    <div className="notice-block">
                        <Notice text={formatWording('error.invalid.inputNumber', {})} />
                    </div>
                </div>
            </Screen>

            <Screen id="notification" title="Notification (toast, shown state)">
                <div className="notification show">
                    <i className="notification-icon" aria-hidden="true"><MdCircleNotifications size={30} /></i>
                    <div className="notification-body">
                        {formatWording('party.status.reconnected', {})}
                    </div>
                </div>
            </Screen>

            <Screen id="loader" title="Loader">
                <Loader />
            </Screen>
        </div>
    );
};

export default Screens;
