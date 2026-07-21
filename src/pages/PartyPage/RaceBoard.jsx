import React, { useMemo, useRef, useState } from 'react';

import DigitInputGroup from '../../component/DigitInputGroup/DigitInputGroup.jsx';
import { checkInputs } from '../../module/checkInputs';
import { calculateAB, isValidGuess } from '../../module/partyGame';
import { formatWording } from '../../../utils/langUtils';

const formatDuration = (playMs) => `${(playMs / 1000).toFixed(2)}s`;

const getLocalRaceStart = (startAt) => {
    const key = `bulls-cows-race-start-${startAt}`;
    const stored = Number(window.sessionStorage.getItem(key));
    const receivedAt = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
    if (!stored) window.sessionStorage.setItem(key, String(receivedAt));
    return performance.now() - Math.max(0, Date.now() - receivedAt);
};

const RaceBoard = ({
    game,
    roster,
    meId,
    isResult,
    isRestartPending,
    isHost,
    notice,
    onProgress,
    onWin,
    onReturnToWaiting,
}) => {
    const [guess, setGuess] = useState('');
    const [records, setRecords] = useState([]);
    const [validationNotice, setValidationNotice] = useState('');
    const [finished, setFinished] = useState(() => game.race.wins.some((win) => win.id === meId));
    const localStartRef = useRef(getLocalRaceStart(game.startAt));
    const progress = game.race.progress;
    const result = game.race.result;
    const winner = roster.find((player) => player.id === result?.winnerId);

    const opponents = useMemo(
        () => roster.filter((player) => player.id !== meId),
        [meId, roster],
    );

    const handleSubmit = () => {
        if (finished || isResult || isRestartPending) return;
        const normalized = guess.replace(/\D/g, '');
        if (!checkInputs(normalized) || !isValidGuess(normalized)) {
            setValidationNotice(formatWording('error.invalid.inputNumber', {}));
            return;
        }

        const step = Math.max(records.length, progress[meId]?.step || 0) + 1;
        const { a, b } = calculateAB(normalized, game.target);
        setRecords((current) => [...current, { guess: normalized, step, a, b }]);
        setGuess('');
        setValidationNotice('');
        onProgress({ guess: normalized, step, a, b });
        if (a === 4) {
            setFinished(true);
            onWin({ playMs: Math.max(0, Math.round(performance.now() - localStartRef.current)), step });
        }
    };

    return (
        <section className="party-board party-race-board">
            <header className="party-board-header">
                <div>
                    <div className="party-board-mode">{formatWording('party.mode.race', {})}</div>
                    <h1>{formatWording('party.race.title', {})}</h1>
                </div>
                {isResult && isHost && !isRestartPending && (
                    <button type="button" className="party-secondary-btn" onClick={onReturnToWaiting}>
                        {formatWording('party.btn.backToWaiting', {})}
                    </button>
                )}
            </header>

            {result && (
                <div className="party-win-banner">
                    {formatWording('party.race.winner', {
                        name: winner?.name || formatWording('general.default.playerName', {}),
                        time: formatDuration(result.playMs),
                    })}
                </div>
            )}

            {!isResult && (
                <div className="party-input-block">
                    <DigitInputGroup
                        value={guess}
                        disabled={finished || isRestartPending}
                        onChange={setGuess}
                        onSubmit={handleSubmit}
                        placeholder={formatWording('general.local.inputNumber.placeHolder', {})}
                    />
                    <button type="button" className="submit-answer-btn" disabled={finished || isRestartPending} onClick={handleSubmit}>
                        {formatWording(finished ? 'party.race.finished' : 'party.btn.submit', {})}
                    </button>
                </div>
            )}

            {(validationNotice || notice) && <div className="party-status" role="status">{validationNotice || notice}</div>}

            <div className="party-race-layout">
                <section className="party-player-record party-race-own-record">
                    <header>{formatWording('party.record.mine', {})}</header>
                    {records.map((entry) => (
                        <div className="party-record-entry" key={entry.step}>
                            <span className="party-record-round">#{entry.step}</span>
                            <span className="party-record-guess">{entry.guess.split('').join(' ')}</span>
                            <span className="party-record-ab">{entry.a}A {entry.b}B</span>
                        </div>
                    ))}
                </section>
                <section className="party-race-opponents">
                    <header>{formatWording('party.race.opponents', {})}</header>
                    {opponents.map((player) => {
                        const playerProgress = progress[player.id];
                        return (
                            <div className="party-race-opponent" key={player.id}>
                                <span>{player.name}</span>
                                <span className={`party-peer-status ${player.online ? 'is-online' : 'is-offline'}`} />
                                <span>{formatWording('party.race.step', { count: playerProgress?.step || 0 })}</span>
                                <span className="party-record-ab">
                                    {playerProgress ? `${playerProgress.a}A ${playerProgress.b}B` : '--'}
                                </span>
                            </div>
                        );
                    })}
                </section>
            </div>
        </section>
    );
};

export default React.memo(RaceBoard);
