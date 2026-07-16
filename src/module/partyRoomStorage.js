const PARTY_ROOM_KEY = 'bulls-cows-party-room';

export const loadPartyRoom = () => {
    try {
        const saved = window.sessionStorage.getItem(PARTY_ROOM_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch {
        return null;
    }
};

export const savePartyRoom = (role, roomCode) => {
    try {
        window.sessionStorage.setItem(PARTY_ROOM_KEY, JSON.stringify({ role, roomCode }));
    } catch {
        return;
    }
};

export const clearPartyRoom = () => {
    try {
        window.sessionStorage.removeItem(PARTY_ROOM_KEY);
    } catch {
        return;
    }
};
