import WinningModal from "./WinningModal.jsx";
import React, { useRef } from "react";
import { shallowEqual, useSelector } from "react-redux";
import { createPortal } from "react-dom";
import { useSpring, animated } from "@react-spring/web";

const Modal = (props) => {
    const winningStep = useSelector(state => state.alertReducer.winningStep, shallowEqual);
    const isAlertVisible = props.isAlertVisible;
    const portalTarget = props.portalTarget? props.portalTarget : document.body;
    const handleOverlayClick = props.action.cancel;
    const overlayRef = useRef(null);
    const alertType = props.alertType;

    const { xy } = useSpring({
        xy: isAlertVisible? 1 : 0 ,
        config: { duration: 300 },
    });

    const alertComponent = () => {
        if (alertType === "winning") {
            return (
                <WinningModal
                    data={{
                        "header": "遊戲獲勝",
                        "content": `一共花了 ${winningStep} 步。`
                    }}
                    step={ winningStep }
                    actionName="重新一局"
                    action={ props.action }
                />
            );
        } else {
            return null;
        }
    }

    return(
        isAlertVisible?
        createPortal(
            <div ref={overlayRef} id="overlay" onClick={handleOverlayClick}>
                <animated.div className={`modal-alert${alertType === "winning" ? " modal-alert-winning" : ""}`} style={{
                    transform: xy
                        .to({
                            range:  [0, 0.05, 0.3, 0.5, 0.8 , 1],
                            output: [1, 1.2 , 1  , 0.9, 1.1 , 1],
                        })
                        .to(xy => `scale(${xy})`),
                }}>
                    { alertComponent() }
                </animated.div>
            </div>
            , portalTarget) : null
    );
};

export default Modal;