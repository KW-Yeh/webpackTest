import React, { Suspense } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

/***
 * https://blog.logrocket.com/lazy-loading-components-in-react-16-6-6cea535c0b52/
 * Use React.lazy() to dynamically import components;
 * Use <Suspense/> to handle the fallback, such as a loading component;
 * Use <ErrorBoundary> to handle error rendering React.lazy() component.
 ***/
const MainPage = React.lazy(() => {
    return Promise.all([
        import(/* webpackChunkName: "MainPage" */"./pages/MainPage/MainPage.jsx"),
        new Promise(resolve => setTimeout(resolve, 1000))
    ]).then(([moduleExports]) => moduleExports);
});
const PartyPage = React.lazy(() => {
    return Promise.all([
        import(/* webpackChunkName: "PartyPage" */"./pages/PartyPage/PartyPage.jsx"),
        new Promise(resolve => setTimeout(resolve, 1000))
    ]).then(([moduleExports]) => moduleExports);
});
import OpeningPageV2 from "./pages/OpeningPage/OpeningPageV2.jsx";
import Loader from "./component/Loader/Loader.jsx";
import ErrorBoundary from "./component/ErrorBoundary/ErrorBoundary.jsx";

import { formatWording } from "../utils/langUtils";

const ROOM_CODE_PATTERN = /^\d{6}$/;

const PartyRoute = () => {
    const location = useLocation();
    const inviteRoomCode = new URLSearchParams(location.search).get('room')?.trim() || '';

    if (inviteRoomCode) {
        return (
            <Navigate
                replace
                to="/"
                state={{
                    stage: "party_setup",
                    roomID: inviteRoomCode,
                    notice: ROOM_CODE_PATTERN.test(inviteRoomCode) ? "" : formatWording("error.invalid.inputRoom", {}),
                }}
            />
        );
    }

    return <PartyPage/>;
};

const Home = () => {
    return (
        <ErrorBoundary fallback={<p>{formatWording("error.load.page", {})}</p>}>
            <Suspense fallback={<Loader/>}>
                <HashRouter>
                    <Routes>
                        <Route path="/local" element={<MainPage/>}/>
                        <Route path="/party" element={<PartyRoute/>}/>
                        <Route path="/" element={<OpeningPageV2/>}/>
                    </Routes>
                </HashRouter>
            </Suspense>
        </ErrorBoundary>
    );
};

export default Home;
