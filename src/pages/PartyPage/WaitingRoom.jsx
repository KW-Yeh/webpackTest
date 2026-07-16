import React, { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
    FiArrowLeft,
    FiCheck,
    FiCopy,
    FiMessageCircle,
    FiPlay,
    FiSend,
    FiUsers,
} from "react-icons/fi";

import { PARTY_MODE } from "../../module/partyProtocol";
import { formatWording } from "../../../utils/langUtils";

const WaitingRoom = ({
    roomCode,
    inviteLink,
    roster,
    messages,
    mode,
    isHost,
    meId,
    notice,
    onCopyInvite,
    inviteCopied,
    inviteAvailable = true,
    onSendChat,
    onModeChange,
    onStart,
    onLeave,
}) => {
    const [chatText, setChatText] = useState("");
    const onlinePlayerCount = roster.filter((player) => player.online).length;
    const canStart = isHost && inviteAvailable && onlinePlayerCount >= 2;

    const handleChatSubmit = (event) => {
        event.preventDefault();
        const text = chatText.trim();
        if (!text) return;
        onSendChat(text);
        setChatText("");
    };

    return (
        <section className="party-waiting-room" aria-labelledby="party-waiting-title">
            <header className="party-waiting-header">
                <button type="button" className="party-waiting-leave" onClick={onLeave}>
                    <FiArrowLeft aria-hidden="true" />
                    <span>{formatWording("party.waiting.leave", {})}</span>
                </button>
                <div>
                    <h1 id="party-waiting-title" className="party-waiting-title">
                        {formatWording("party.waiting.title", {})}
                    </h1>
                    <div className="party-waiting-player-count">
                        <FiUsers aria-hidden="true" />
                        <span>{formatWording("party.waiting.playerCount", { count: onlinePlayerCount })}</span>
                    </div>
                </div>
            </header>

            {notice && <div className="party-waiting-notice" role="status">{notice}</div>}

            <div className="party-waiting-layout">
                <div className="party-waiting-main">
                    <section className="party-waiting-invite" aria-labelledby="party-waiting-room-code-label">
                        <div id="party-waiting-room-code-label" className="party-waiting-section-title">
                            {formatWording("party.roomCode.label", {})}
                        </div>
                        <div className="party-waiting-room-code">{roomCode}</div>
                        {inviteLink && inviteAvailable && (
                            <QRCodeSVG
                                className="party-waiting-qr"
                                value={inviteLink}
                                title={formatWording("party.invite.qrLabel", {})}
                            />
                        )}
                        <div className="party-waiting-invite-link">{inviteAvailable ? inviteLink : ""}</div>
                        <button
                            type="button"
                            className="party-waiting-copy"
                            onClick={onCopyInvite}
                            disabled={!inviteLink || !inviteAvailable}
                        >
                            {inviteCopied ? <FiCheck aria-hidden="true" /> : <FiCopy aria-hidden="true" />}
                            <span>
                                {formatWording(inviteCopied ? "party.invite.copied" : "party.invite.copyLink", {})}
                            </span>
                        </button>
                    </section>

                    <section className="party-waiting-players" aria-labelledby="party-waiting-players-title">
                        <h2 id="party-waiting-players-title" className="party-waiting-section-title">
                            {formatWording("party.waiting.players", {})}
                        </h2>
                        <ul className="party-waiting-player-list">
                            {roster.map((player) => (
                                <li
                                    key={player.id}
                                    className={`party-waiting-player ${player.online ? "is-online" : "is-offline"}`}
                                >
                                    <span
                                        className="party-waiting-player-status"
                                        aria-label={formatWording(
                                            player.online ? "party.connection.online" : "party.connection.offline",
                                            {},
                                        )}
                                    />
                                    <span className="party-waiting-player-name">{player.name}</span>
                                    {player.isHost && (
                                        <span className="party-waiting-badge is-host">
                                            {formatWording("party.waiting.host", {})}
                                        </span>
                                    )}
                                    {player.id === meId && (
                                        <span className="party-waiting-badge is-me">
                                            {formatWording("party.waiting.me", {})}
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <fieldset className="party-waiting-mode" disabled={!isHost}>
                        <legend className="party-waiting-section-title">
                            {formatWording("party.waiting.mode", {})}
                        </legend>
                        <label className="party-waiting-mode-option">
                            <input
                                type="radio"
                                name="party-mode"
                                value={PARTY_MODE.COOP}
                                checked={mode === PARTY_MODE.COOP}
                                onChange={() => onModeChange(PARTY_MODE.COOP)}
                            />
                            <span>{formatWording("party.waiting.coop", {})}</span>
                        </label>
                        <label className="party-waiting-mode-option">
                            <input
                                type="radio"
                                name="party-mode"
                                value={PARTY_MODE.RACE}
                                checked={mode === PARTY_MODE.RACE}
                                onChange={() => onModeChange(PARTY_MODE.RACE)}
                            />
                            <span>{formatWording("party.waiting.race", {})}</span>
                        </label>
                    </fieldset>

                    {isHost && (
                        <button
                            type="button"
                            className="party-waiting-start"
                            onClick={onStart}
                            disabled={!canStart}
                        >
                            <FiPlay aria-hidden="true" />
                            <span>{formatWording("party.waiting.start", {})}</span>
                        </button>
                    )}
                </div>

                <section className="party-waiting-chat" aria-labelledby="party-waiting-chat-title">
                    <h2 id="party-waiting-chat-title" className="party-waiting-section-title">
                        <FiMessageCircle aria-hidden="true" />
                        <span>{formatWording("party.waiting.chat.title", {})}</span>
                    </h2>
                    <ol className="party-waiting-chat-messages" aria-live="polite">
                        {messages.map((message) => (
                            <li
                                key={message.id}
                                className={`party-waiting-chat-message ${message.fromId === meId ? "is-me" : ""}`}
                            >
                                <div className="party-waiting-chat-meta">
                                    <span className="party-waiting-chat-name">{message.name}</span>
                                    <time dateTime={new Date(message.at).toISOString()}>
                                        {new Date(message.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                    </time>
                                </div>
                                <p>{message.text}</p>
                            </li>
                        ))}
                    </ol>
                    <form className="party-waiting-chat-form" onSubmit={handleChatSubmit}>
                        <label className="party-waiting-chat-input-label" htmlFor="party-waiting-chat-input">
                            {formatWording("party.waiting.chat.placeholder", {})}
                        </label>
                        <input
                            id="party-waiting-chat-input"
                            className="party-waiting-chat-input"
                            type="text"
                            value={chatText}
                            onChange={(event) => setChatText(event.target.value)}
                            placeholder={formatWording("party.waiting.chat.placeholder", {})}
                            maxLength={300}
                        />
                        <button
                            type="submit"
                            className="party-waiting-chat-send"
                            disabled={!chatText.trim()}
                        >
                            <FiSend aria-hidden="true" />
                            <span>{formatWording("party.waiting.chat.send", {})}</span>
                        </button>
                    </form>
                </section>
            </div>
        </section>
    );
};

export default WaitingRoom;
