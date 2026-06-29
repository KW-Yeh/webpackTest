import '../../css/main.scss';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { GrReturn } from "react-icons/gr";
import { FiArrowLeft } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import { setWinningStep } from "../../component/Modal/modalSlice";

import Record from "../../component/Record/Record.jsx";
import Notice from "../../component/Notice/Notice.jsx";
import InfoBlock from "../../component/InfoBlock/InfoBlock.jsx";
import Modal from "../../component/Modal/Modal.jsx";
import RestartBtn from "../../component/Button/RestartBtn.jsx";
import DigitInputGroup from "../../component/DigitInputGroup/DigitInputGroup.jsx";

import { Storage } from "../../module/storage";
import { Logger } from "../../module/logger";
import { shuffleArray } from "../../module/shuffleArray";
import { checkInputs } from "../../module/checkInputs";
import { env } from '../../../env.js';
import { formatWording } from "../../../utils/langUtils";

const storage = Storage();
const logger = Logger({className: "MainPage"});

const NUM_INPUT_PLACEHOLDER = formatWording("general.local.inputNumber.placeHolder", {});
const RULES = env.GAME.RULE;

const initStorage = () => {
    return storage.loadAll({
        initTarget: shuffleArray(env.GAME.NUMBER_RANGE).slice(0, 4).join(''),
        initRecord: [],
        initStep: 0,
        initIsWinning: false,
        initPlayingHistory: "",
        initHighestScore: formatWording("general.default.score", {}),
        initAverageScore: 0
    });
};

const MainPage = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { initTarget, initRecord, initStep, initIsWinning, initPlayingHistory, initHighestScore, initAverageScore } = initStorage();
    const [notice, setNotice] = useState("");
    const [num, setNum] = useState("");
    const [isAlertVisible, setAlertVisible] = useState(false);
    const [inputEditable, setInputEditable] = useState(!initIsWinning);
    const [isWin, setIsWin] = useState(initIsWinning);
    const [target, setTarget] = useState(initTarget);
    const [record, setRecord] = useState(initRecord);
    const [highestScore, setHighestScore] = useState(initHighestScore);
    const [playingHistory, setPlayingHistory] = useState(initPlayingHistory);
    const [averageScore, setAverageScore] = useState(initAverageScore);

    const count = useRef(initStep);
    const isMounted = useRef(false);

    useEffect(() => {
        if (isMounted.current) {
            storage.saveAll({
                currentTarget: target,
                currentRecord: record.join(","),
                currentStep: count.current,
                currentIsWinning: isWin,
                currentPlayingHistory: playingHistory,
                currentHighestScore: highestScore,
                currentAverageScore: averageScore
            });
        }
    }, [target, record, isWin, playingHistory, highestScore, averageScore]);

    useEffect(() => {
        if (isMounted.current) {
            resetStates();
            noticeWording(formatWording("general.newRound", {}), 1500);
            logger.verbose(`New target number: ${target}`);
        }
    }, [target]);

    useEffect(() => {
        if (isMounted.current && isWin) {
            setInputEditable(false);
            setAlertVisible(true);
            dispatch(setWinningStep(count.current));

            let currentPlayingHistory = ""+count.current;
            if (playingHistory !== "") currentPlayingHistory = playingHistory+","+count.current
            setPlayingHistory(currentPlayingHistory);

            let currentHighestScore = highestScore;
            if (highestScore === formatWording("general.default.score", {}) || count.current < Number(highestScore)) currentHighestScore = count.current;
            setHighestScore(currentHighestScore);

            let avg = count.current;
            let temp = currentPlayingHistory.split(",");
            const length = temp.length;
            if (length > 0) {
                temp = temp.map(str => Number(str));
                temp = temp.reduce((partialSum, a) => partialSum + a, count.current);
                avg = temp / (length+1);
                avg = Math.floor(avg);
            }
            setAverageScore(avg);
        }
    }, [isWin]);

    useEffect(() => {isMounted.current = true}, []);

    const noticeWording = (str, timeout = 0) => {
        logger.info(`Notice: ${str}`);
        setNotice(str);
        if (timeout) setTimeout(() => setNotice(''), timeout);
    };

    const resetStates = () => {
        logger.info("Reset states");
        setNotice("");
        setNum("");
        setInputEditable(true);
        setIsWin(false);
        setRecord([]);
        setAlertVisible(false);
        count.current = 0;
    };

    const calculateAB = (num) => {
        let a = 0, b = 0;
        num.split('').map((digit, index) => {
            if (digit === target[index]) {
                a++;
            } else if (target.includes(digit)) {
                b++;
            }
        });
        return {a, b};
    };

    const compareAnswer = () => {
        if (isWin) return;
        logger.info("Compare answer");
        const guess = num.replace(/\D/g, '');
        if (!checkInputs(guess) || [...new Set(guess)].length < 4 || guess.length !== 4) {
            logger.info("Invalid input");
            noticeWording(formatWording("error.invalid.inputNumber", {}), 1500);
        } else {
            count.current++;
            const {a, b} = calculateAB(guess);
            const _res = `${guess.split('').join(' ')}:${a} A ${b} B`;
            setRecord([...record, _res]);
            logger.verbose(`Current result ${_res}`);

            if (a === 4) {
                logger.info("Winning");
                noticeWording(formatWording("alert.local.win", {count: count.current}));
                setIsWin(true);
            }
        }
        setNum("");
    };

    const handleOverlayClick = useCallback(() => {
        setAlertVisible(false);
    }, []);

    const newRound = useCallback(() => {
        logger.info("New round");
        setTarget(shuffleArray(env.GAME.NUMBER_RANGE).slice(0, 4).join(''));
    }, []);

    const handleRestartClick = useCallback(() => {
        if (!window.confirm(formatWording("alert.restart.confirm", {}))) return;
        newRound();
    }, [newRound]);

    return(
        <div className="container-main">
            <Modal
                portalTarget={document.body}
                alertType="winning"
                action={{
                    confirm: () => handleRestartClick(),
                    cancel: () => handleOverlayClick()
                }}
                isAlertVisible={isAlertVisible}/>
            <button type="button" className="game-back-btn" onClick={() => navigate(-1)}>
                <FiArrowLeft aria-hidden="true" />
                <span>{formatWording("general.btn.back", {})}</span>
            </button>
            <div className="rule-block"><InfoBlock text={RULES}/></div>
            <div className="input-block">
                <DigitInputGroup
                    value={num}
                    disabled={!inputEditable}
                    onChange={setNum}
                    onSubmit={compareAnswer}
                    placeholder={NUM_INPUT_PLACEHOLDER}
                />
                <i className="enter" onClick={compareAnswer}><GrReturn/></i>
            </div>
            <div className="currentHighestScore">
                { formatWording("general.local.step", {count: highestScore, avg: averageScore? averageScore: formatWording("general.default.score", {})}) }
                <a className="clearStorage" onClick={() => {
                    if (window.confirm(formatWording("alert.local.clean.playingHistory", {}))) {
                        logger.info("Remove playing record");
                        storage.setStorage(env.LOCAL.STORAGE.PLAYING_HISTORY, "");
                        storage.setStorage(env.LOCAL.STORAGE.CURRENT_HIGHEST_SCORE, formatWording("general.default.score", {}));
                        storage.setStorage(env.LOCAL.STORAGE.AVERAGE_SCORE, 0);
                        setHighestScore(formatWording("general.default.score", {}));
                        setPlayingHistory("");
                        setAverageScore(0);
                    }
                }}>{formatWording("general.clean.playingHistory", {})}</a>
            </div>
            <div className="button-area"><RestartBtn onClick={() => handleRestartClick()} value={formatWording("general.restart", {})}/></div>
            <div className="notice-block"><Notice text={notice}/></div>
            <div className="record-block"><Record record={record}/></div>
        </div>
    );
};

export default React.memo(MainPage);
