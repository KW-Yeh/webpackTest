import React from "react";

const WinningModal = (props) => {
    const data = props.data;
    const handleOnclick = props.action.confirm;
    const actionName = props.actionName;
    const step = props.step;

    return (
        <div className={"alert-block alert-block-winning"}>
            <span className="win-confetti" aria-hidden="true">
                <i className="win-piece win-piece-star" />
                <i className="win-piece win-piece-star" />
                <i className="win-piece win-piece-star" />
                <i className="win-piece" />
                <i className="win-piece" />
                <i className="win-piece" />
                <i className="win-piece" />
                <i className="win-piece" />
                <i className="win-piece" />
                <i className="win-piece" />
            </span>
            <div className="alert-header">{data.header}</div>
            <div className="alert-content">
                {step != null ? (
                    <span className="win-step">
                        <span className="win-step-lead">一共花了</span>
                        <span className="win-step-number">{step}</span>
                        <span className="win-step-unit">步</span>
                    </span>
                ) : (
                    data.content
                )}
            </div>
            <div className="alert-footer">
                <button className="next-round-btn" value="Next Round" onClick={handleOnclick}>{actionName}</button>
            </div>
        </div>
    );
};

export default React.memo(WinningModal);
