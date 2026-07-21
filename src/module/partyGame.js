export const isValidGuess = (guess) => /^\d{4}$/.test(guess) && new Set(guess).size === 4;

export const calculateAB = (guess, target) => {
    let a = 0;
    let b = 0;
    guess.split('').forEach((digit, index) => {
        if (digit === target[index]) a += 1;
        else if (target.includes(digit)) b += 1;
    });
    return { a, b };
};

export const compareRaceWins = (left, right) => (
    left.playMs - right.playMs
    || left.step - right.step
    || left.id.localeCompare(right.id)
);

export const createRestartVote = ({ id, hostId, playerIds, requestedAt, expiresAt }) => ({
    id,
    requestedAt,
    expiresAt,
    requiredIds: [...new Set(playerIds)],
    approvedIds: [hostId],
});

export const applyRestartVote = (vote, playerId, approved) => {
    if (!vote || !vote.requiredIds.includes(playerId) || vote.approvedIds.includes(playerId)) {
        return { vote, outcome: 'ignored' };
    }
    if (!approved) return { vote, outcome: 'rejected' };

    const nextVote = { ...vote, approvedIds: [...vote.approvedIds, playerId] };
    const outcome = nextVote.requiredIds.every((id) => nextVote.approvedIds.includes(id))
        ? 'approved'
        : 'pending';
    return { vote: nextVote, outcome };
};
