import React, { useEffect, useMemo, useState } from 'react';

import DigitInputGroup from '../../component/DigitInputGroup/DigitInputGroup.jsx';
import { checkInputs } from '../../module/checkInputs';
import { calculateAB, isValidGuess } from '../../module/partyGame';
import { formatWording } from '../../../utils/langUtils';

const CoopBoard = ({
    game,
    roster,
    meId,
    submittedIds,
    isResult,
    isRestartPending,
    isHost,
    notice,
    onSubmit,
    onReturnToWaiting,
}) => {
    const [guess, setGuess] = useState('');
    const [validationNotice, setValidationNotice] = useState('');
    const round = game.coop.round;
    const hasSubmitted = submittedIds.includes(meId);
    const rounds = game.coop.rounds;
    const latestRound = rounds[rounds.length - 1];
    const winnerIds = isResult
        ? (latestRound?.entries || []).filter((entry) => entry.a === 4).map((entry) => entry.id)
        : [];

    useEffect(() => {
        setGuess('');
        setValidationNotice('');
    }, [round]);

    const entriesByPlayer = useMemo(() => {
        const result = new Map(roster.map((player) => [player.id, []]));
        rounds.forEach((roundItem) => {
            roundItem.entries.forEach((entry) => {
                if (!result.has(entry.id)) result.set(entry.id, []);
                result.get(entry.id).push({ ...entry, round: roundItem.round });
            });
        });
        return result;
    }, [roster, rounds]);

    const handleSubmit = () => {
        if (hasSubmitted || isResult || isRestartPending) return;
        const normalized = guess.replace(/\D/g, '');
        if (!checkInputs(normalized) || !isValidGuess(normalized)) {
            setValidationNotice(formatWording('error.invalid.inputNumber', {}));
            return;
        }
        const { a, b } = calculateAB(normalized, game.target);
        onSubmit({ guess: normalized, a, b, step: round });
        setGuess('');
        setValidationNotice('');
    };

    return (
        <section className="party-board party-coop-board">
            <header className="party-board-header">
                <div>
                    <div className="party-board-mode">{formatWording('party.mode.coop', {})}</div>
                    <h1>{formatWording('party.coop.round', { count: round })}</h1>
                </div>
                {isResult && isHost && !isRestartPending && (
                    <button type="button" className="party-secondary-btn" onClick={onReturnToWaiting}>
                        {formatWording('party.btn.backToWaiting', {})}
                    </button>
                )}
            </header>

            {isResult && (
                <div className="party-win-banner">
                    {formatWording('party.coop.winner', {
                        name: roster.filter((player) => winnerIds.includes(player.id)).map((player) => player.name).join('、'),
                    })}
                </div>
            )}

            {!isResult && (
                <div className="party-input-block">
                    <DigitInputGroup
                        value={guess}
                        disabled={hasSubmitted || isRestartPending}
                        onChange={setGuess}
                        onSubmit={handleSubmit}
                        placeholder={formatWording('general.local.inputNumber.placeHolder', {})}
                    />
                    <button type="button" className="submit-answer-btn" disabled={hasSubmitted || isRestartPending} onClick={handleSubmit}>
                        {formatWording(hasSubmitted ? 'party.coop.submitted' : 'party.btn.submit', {})}
                    </button>
                </div>
            )}

            {(validationNotice || notice) && <div className="party-status" role="status">{validationNotice || notice}</div>}
            {!isResult && submittedIds.length > 0 && (
                <div className="party-submit-status">
                    {formatWording('party.coop.waiting', { submitted: submittedIds.length, total: roster.filter((player) => player.online).length })}
                </div>
            )}

            <div className="party-multi-records">
                {roster.map((player) => (
                    <section className="party-player-record" key={player.id}>
                        <header>
                            <span>{player.name}</span>
                            <span className={`party-peer-status ${player.online ? 'is-online' : 'is-offline'}`} />
                        </header>
                        {(entriesByPlayer.get(player.id) || []).map((entry) => (
                            <div className="party-record-entry" key={`${player.id}-${entry.round}`}>
                                <span className="party-record-round">#{entry.round}</span>
                                <span className="party-record-guess">{entry.guess.split('').join(' ')}</span>
                                <span className="party-record-ab">{entry.a}A {entry.b}B</span>
                            </div>
                        ))}
                        {submittedIds.includes(player.id) && (
                            <div className="party-player-pending">{formatWording('party.coop.ready', {})}</div>
                        )}
                    </section>
                ))}
            </div>
        </section>
    );
};

export default React.memo(CoopBoard);
