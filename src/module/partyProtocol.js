export const PARTY_MESSAGE = {
    HELLO: 'party:hello',
    ROSTER: 'party:roster',
    CHAT: 'party:chat',
    SETTINGS: 'party:settings',
    START: 'party:start',
    SYNC: 'party:sync',
    SUBMIT: 'party:submit',
    REVEAL: 'party:reveal',
    RACE_PROGRESS: 'party:race-progress',
    RACE_WIN: 'party:race-win',
    RACE_RESULT: 'party:race-result',
    LEAVE: 'party:leave',
    PING: 'party:ping',
    PONG: 'party:pong',
    REJECT: 'party:reject',
};

export const PARTY_MODE = {
    COOP: 'coop',
    RACE: 'race',
};

export const PARTY_PHASE = {
    CONNECTING: 'connecting',
    WAITING_ROOM: 'waiting_room',
    PLAYING: 'playing',
    RESULT: 'result',
};

export const createPartyMessage = (type, payload = {}) => ({ type, payload });

export const isPartyMessage = (data) =>
    data !== null &&
    typeof data === 'object' &&
    Object.values(PARTY_MESSAGE).includes(data.type) &&
    data.payload !== null &&
    typeof data.payload === 'object' &&
    !Array.isArray(data.payload);
