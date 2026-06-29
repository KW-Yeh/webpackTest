import React, { useRef } from "react";

const DIGIT_COUNT = 4;

const normalizeValue = (value) => {
    const digits = String(value)
        .slice(0, DIGIT_COUNT)
        .split('')
        .map((digit) => /\d/.test(digit) ? digit : ' ');

    return digits.concat(Array(DIGIT_COUNT).fill(' ')).slice(0, DIGIT_COUNT);
};

const DigitInputGroup = ({ value, disabled = false, placeholder = "", onChange, onSubmit }) => {
    const inputRefs = useRef([]);
    const digits = normalizeValue(value);

    const emitChange = (nextDigits) => {
        onChange(nextDigits.join(''));
    };

    const focusIndex = (index) => {
        const input = inputRefs.current[index];
        if (!input) return;
        input.focus();
        input.select();
    };

    const handleChange = (index, event) => {
        const nextValue = event.target.value.replace(/\D/g, '');
        if (!nextValue) {
            const nextDigits = [...digits];
            nextDigits[index] = ' ';
            emitChange(nextDigits);
            return;
        }

        const nextDigits = [...digits];
        nextValue.slice(0, DIGIT_COUNT - index).split('').forEach((digit, offset) => {
            nextDigits[index + offset] = digit;
        });
        emitChange(nextDigits);

        const nextIndex = Math.min(index + nextValue.length, DIGIT_COUNT - 1);
        focusIndex(nextIndex);
    };

    const handleKeyDown = (index, event) => {
        if (event.key === 'Enter') {
            onSubmit();
            return;
        }

        if (event.key === 'Backspace' && !digits[index].trim() && index > 0) {
            event.preventDefault();
            const nextDigits = [...digits];
            nextDigits[index - 1] = ' ';
            emitChange(nextDigits);
            focusIndex(index - 1);
            return;
        }

        if (event.key === 'ArrowLeft' && index > 0) {
            event.preventDefault();
            focusIndex(index - 1);
            return;
        }

        if (event.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
            event.preventDefault();
            focusIndex(index + 1);
        }
    };

    const handlePaste = (index, event) => {
        const pastedValue = event.clipboardData.getData('text').replace(/\D/g, '');
        if (!pastedValue) return;

        event.preventDefault();
        const nextDigits = [...digits];
        pastedValue.slice(0, DIGIT_COUNT - index).split('').forEach((digit, offset) => {
            nextDigits[index + offset] = digit;
        });
        emitChange(nextDigits);
        focusIndex(Math.min(index + pastedValue.length, DIGIT_COUNT - 1));
    };

    return (
        <div className="digit-input-group" aria-label={placeholder}>
            {digits.map((digit, index) => (
                <input
                    key={index}
                    ref={(input) => { inputRefs.current[index] = input; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className="digit-input"
                    value={digit.trim()}
                    disabled={disabled}
                    aria-label={`${placeholder} ${index + 1}`}
                    onChange={(event) => handleChange(index, event)}
                    onKeyDown={(event) => handleKeyDown(index, event)}
                    onPaste={(event) => handlePaste(index, event)}
                />
            ))}
        </div>
    );
};

export default React.memo(DigitInputGroup);
