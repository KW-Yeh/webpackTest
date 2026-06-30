import React from "react";
import { VscDebugRestart } from "react-icons/vsc";

const RestartBtn = (props) => {
    const onClick = props.onClick;
    const value = props.value;
    return (
        <button type="button" className="restart-action-btn" onClick={onClick}>
            <VscDebugRestart aria-hidden="true" style={{transform: 'translateY(2px)'}}/>
            <span>{value}</span>
        </button>
    );
};

export default React.memo(RestartBtn);
