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
