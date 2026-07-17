import React from "react";

// Match a result string of the form "x A y B" (whitespace groups captured so
// the rendered row's textContent stays byte-for-byte equivalent to the source).
const AB_RESULT_PATTERN = /^(\s*)(\d+)(\s*)A(\s*)(\d+)(\s*)B(\s*)$/;

// Presentation-only transform: split the "x A y B" result string into
// colour-coded, colour-blind-safe badges (A = green, B = orange) while keeping
// the "A"/"B" letters inside each badge. The underlying record string, its
// storage serialization and MainPage.compareAnswer are NOT touched.
const renderResult = (raw) => {
    const result = raw == null ? "" : String(raw);
    const match = result.match(AB_RESULT_PATTERN);
    if (!match) {
        // Fault-tolerant: unexpected/empty result strings render as plain text.
        return result;
    }
    const [, lead, aNum, aGap, midGap, bNum, bGap, trail] = match;
    return (
        <>
            {lead}
            <span className="ab-badge ab-badge-a">{`${aNum}${aGap}A`}</span>
            {midGap}
            <span className="ab-badge ab-badge-b">{`${bNum}${bGap}B`}</span>
            {trail}
        </>
    );
};

const Record = (props) => {
    const record = props.record;
    return (
        <ul className="ul-no-bullet">
            {record.length > 0 &&
                record.map((item, index) => {
                    const [guess, result] = item.split(":");
                    return (
                        <li key={index} className="record-item">
                            <div className="item">
                                <div className="record-item-input">{guess}</div>
                                <i className="record-item-arrow"></i>
                                <div className="record-item-result">{renderResult(result)}</div>
                            </div>
                        </li>
                    );
                })
            }
        </ul>
    );
};

export default React.memo(Record);
