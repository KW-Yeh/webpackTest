import '../../css/opening_v2.scss';
import React, { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate  } from "react-router-dom";

import { FiLink } from "react-icons/fi";
import { TiUserOutline, TiKeyOutline } from "react-icons/ti";
import { VscDebugDisconnect } from "react-icons/vsc";

import { setUser } from "../../component/Player/userSlice";
import { setRoom, setRole } from "../PartyPage/partyPageSlice";

import { checkInputs } from "../../module/checkInputs";
import { Storage } from "../../module/storage";
import { Logger } from "../../module/logger";
import { env } from "../../../env";
import { formatWording } from "../../../utils/langUtils";
const logger = Logger({className: "OpeningPage"});
const storage = Storage();


const OpeningPageV2 = () => {
    const navigate = useNavigate();

    let initUserName = "";
    const playerName = storage.getStorage(env.LOCAL.STORAGE.PLAYER_NAME);
    if (playerName && playerName !== "") initUserName = playerName;

    const dispatch = useDispatch();
    const [userName, setUserName] = useState(initUserName);
    const [id, setId] = useState("");
    const [wording, setWording] = useState("");

    const handleLocalBtnClick = () => {
        logger.success(`Start with local mode!`);
        dispatch(setRole("slave"));
        let _name = formatWording("general.default.playerName", {});
        if (userName !== "") _name = userName;
        dispatch(setUser(_name));
        storage.setStorage(env.LOCAL.STORAGE.PLAYER_NAME, _name);
        storage.setStorage(env.LOCAL.STORAGE.ROOM_ID, id);
        navigate("/local");
    };

    const handlePartyBtnClick = () => {
        logger.success(`Start with party mode!`);
        let _name = formatWording("general.default.playerName", {});
        if (userName !== "") _name = userName;

        if (id !== "" && !checkInputs(id)) {
            noticeWording(formatWording("error.invalid.inputRoom", {}), 1500);
            return;
        }

        if (id !== "") {
            dispatch(setRoom(id));
            logger.info("slave");
            dispatch(setRole("slave"));
        } else {
            logger.info("host");
            dispatch(setRole("host"));
        }
        dispatch(setUser(_name));
        storage.setStorage(env.LOCAL.STORAGE.PLAYER_NAME, _name);
        storage.setStorage(env.LOCAL.STORAGE.ROOM_ID, id);
        navigate("/party");
    };

    const noticeWording = (str, timeout = 0) => {
        logger.info(`Notice: ${str}`);
        setWording(str);
        if (timeout) setTimeout(() => setWording(''), timeout);
    };

    const formSheet = () => {
        return (
            <>
                <div className="userName">
                    <div className="userName-input-label">
                        {formatWording("general.opening.inputName.label", {})} <TiUserOutline style = {{transform: 'translateX(2px)', fontSize: "20px"}}/>
                    </div>
                    <input
                        type="text"
                        className="userName-input"
                        value={userName}
                        onChange={(event) => setUserName(event.target.value)}
                        placeholder={formatWording("general.opening.inputName.placeHolder", {})}
                    />
                </div>
                <div className="roomID">
                    <div className="roomID-input-label">
                        {formatWording("general.opening.inputRoom.label", {})} <TiKeyOutline style = {{transform: 'translateX(2px)', fontSize: "20px"}}/>
                    </div>
                    <input
                        type="text"
                        className="roomID-input"
                        value={id}
                        onChange={(event) => setId(event.target.value.slice(0, 6))}
                        placeholder={formatWording("general.opening.inputRoom.placeHolder", {})}
                    />
                </div>
            </>
        );
    };


    return (
        <div className={"container-opening"}>
            <div className={"opening-page"}>
                <div className={"page-header"}>{formatWording("general.title", {})}</div>
                <div className={"form"}>
                    { formSheet() }
                    <div className="wording">{wording}</div>
                    <div className={"btn-block"}>
                        <div className={"start-local-btn"} onClick={handleLocalBtnClick}>
                            {formatWording("general.btn.localMode", {})} <VscDebugDisconnect style = {{transform: 'rotate(0deg) translateY(2px)', fontSize: "17px"}}/>
                        </div>
                        <div className={"start-party-btn"} onClick={handlePartyBtnClick}>
                            {formatWording("general.btn.partyMode", {})} <FiLink style = {{transform: 'rotate(0deg) translateY(2px)', fontSize: "14px"}}/>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OpeningPageV2;