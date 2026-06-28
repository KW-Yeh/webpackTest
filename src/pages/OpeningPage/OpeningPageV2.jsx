import '../../css/opening_v2.scss';
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";

import { FiArrowLeft, FiLink, FiPlusCircle } from "react-icons/fi";
import { TiUserOutline, TiKeyOutline } from "react-icons/ti";
import { VscDebugDisconnect } from "react-icons/vsc";

import { setUser } from "../../component/Player/userSlice";
import { setRoom, setRole } from "../PartyPage/partyPageSlice";

import { checkInputs } from "../../module/checkInputs";
import { Storage } from "../../module/storage";
import { Logger } from "../../module/logger";
import { env } from "../../../env";
import { formatWording } from "../../../utils/langUtils";

const logger = Logger({ className: "OpeningPage" });
const storage = Storage();

const OPENING_STAGE = {
    SELECT_MODE: 'select_mode',
    PARTY_SETUP: 'party_setup',
};

const OpeningPageV2 = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();

    const playerName = storage.getStorage(env.LOCAL.STORAGE.PLAYER_NAME);
    const initUserName = playerName && playerName !== "" ? playerName : "";

    const [stage, setStage] = useState(
        location.state?.stage === OPENING_STAGE.PARTY_SETUP
            ? OPENING_STAGE.PARTY_SETUP
            : OPENING_STAGE.SELECT_MODE
    );
    const [userName, setUserName] = useState(initUserName);
    const [id, setId] = useState("");
    const [wording, setWording] = useState(() => {
        const storedNotice = window.sessionStorage.getItem('partyExitNotice') || "";
        if (storedNotice) window.sessionStorage.removeItem('partyExitNotice');
        return location.state?.notice || storedNotice;
    });

    const resolvePlayerName = () => {
        const trimmedName = userName.trim();
        return trimmedName !== "" ? trimmedName : formatWording("general.default.playerName", {});
    };

    const persistPlayer = (name, roomID = "") => {
        dispatch(setUser(name));
        dispatch(setRoom(roomID));
        storage.setStorage(env.LOCAL.STORAGE.PLAYER_NAME, name);
        storage.setStorage(env.LOCAL.STORAGE.ROOM_ID, roomID);
    };

    const handleLocalBtnClick = () => {
        logger.success(`Start with local mode!`);
        const name = resolvePlayerName();
        dispatch(setRole("slave"));
        persistPlayer(name, "");
        navigate("/local");
    };

    const handleCreateRoomClick = () => {
        logger.success(`Create party room!`);
        const name = resolvePlayerName();
        dispatch(setRole("host"));
        persistPlayer(name, "");
        navigate("/party");
    };

    const handleJoinRoomClick = () => {
        logger.success(`Join party room!`);
        const roomID = id.trim();

        if (roomID === "" || !checkInputs(roomID)) {
            noticeWording(formatWording("error.invalid.inputRoom", {}), 1500);
            return;
        }

        const name = resolvePlayerName();
        dispatch(setRole("slave"));
        persistPlayer(name, roomID);
        navigate("/party");
    };

    const noticeWording = (str, timeout = 0) => {
        logger.info(`Notice: ${str}`);
        setWording(str);
        if (timeout) setTimeout(() => setWording(''), timeout);
    };

    const handleBackToModeSelect = () => {
        setStage(OPENING_STAGE.SELECT_MODE);
        setWording("");
    };

    const modeSelection = () => (
        <div className="opening-stage opening-stage-mode">
            <div className="opening-title">{formatWording("general.opening.modeTitle", {})}</div>
            {wording && <div className="wording" role="status">{wording}</div>}
            <div className="mode-options">
                <button type="button" className="mode-option mode-option-local" onClick={handleLocalBtnClick}>
                    <span>{formatWording("general.btn.localMode", {})}</span>
                    <VscDebugDisconnect aria-hidden="true" />
                </button>
                <button type="button" className="mode-option mode-option-party" onClick={() => setStage(OPENING_STAGE.PARTY_SETUP)}>
                    <span>{formatWording("general.btn.partyMode", {})}</span>
                    <FiLink aria-hidden="true" />
                </button>
            </div>
        </div>
    );

    const partySetup = () => (
        <div className="opening-stage opening-stage-party">
            <button type="button" className="opening-back-btn" onClick={handleBackToModeSelect}>
                <FiArrowLeft aria-hidden="true" />
                <span>{formatWording("general.btn.back", {})}</span>
            </button>
            <div className="opening-title">{formatWording("general.btn.partyMode", {})}</div>
            <div className="party-setup-form">
                <label className="opening-field userName">
                    <span className="opening-field-label userName-input-label">
                        {formatWording("general.opening.inputName.label", {})}
                        <TiUserOutline aria-hidden="true" />
                    </span>
                    <input
                        type="text"
                        className="opening-input userName-input"
                        value={userName}
                        onChange={(event) => setUserName(event.target.value)}
                        placeholder={formatWording("general.opening.inputName.placeHolder", {})}
                        autoComplete="nickname"
                    />
                </label>
                <label className="opening-field roomID">
                    <span className="opening-field-label roomID-input-label">
                        {formatWording("general.opening.inputRoom.label", {})}
                        <TiKeyOutline aria-hidden="true" />
                    </span>
                    <input
                        type="text"
                        inputMode="numeric"
                        className="opening-input roomID-input"
                        value={id}
                        onChange={(event) => setId(event.target.value.slice(0, 6))}
                        onKeyUp={(event) => { if (event.key === 'Enter') handleJoinRoomClick(); }}
                        placeholder={formatWording("general.opening.inputRoom.placeHolder", {})}
                    />
                </label>
                {wording && <div className="wording" role="status">{wording}</div>}
                <div className="party-action-row">
                    <button type="button" className="party-action party-action-join" onClick={handleJoinRoomClick}>
                        <span>{formatWording("general.btn.joinRoom", {})}</span>
                        <FiLink aria-hidden="true" />
                    </button>
                    <button type="button" className="party-action party-action-create" onClick={handleCreateRoomClick}>
                        <span>{formatWording("general.btn.createRoom", {})}</span>
                        <FiPlusCircle aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="container-opening">
            <div className="opening-page">
                <div className="page-header">{formatWording("general.title", {})}</div>
                <div className="form">
                    {stage === OPENING_STAGE.SELECT_MODE ? modeSelection() : partySetup()}
                </div>
            </div>
        </div>
    );
};

export default OpeningPageV2;
