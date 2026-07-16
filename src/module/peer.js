import Peer from 'peerjs';

export const MAX_PARTY_PLAYERS = 6;

const peerOptions = {
    debug: 2,
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            {
                urls: [
                    'turn:eu-0.turn.peerjs.com:3478',
                    'turn:us-0.turn.peerjs.com:3478',
                ],
                username: 'peerjs',
                credential: 'peerjsp',
            },
        ],
        sdpSemantics: 'unified-plan',
    },
};

export const createHostPeer = (roomCode) =>
    new Promise((resolve, reject) => {
        const peer = new Peer(`bullscows-${roomCode}`, peerOptions);
        peer.on('open', () => resolve(peer));
        peer.on('error', reject);
    });

export const createGuestPeer = () =>
    new Promise((resolve, reject) => {
        const peer = new Peer(undefined, peerOptions);
        peer.on('open', () => resolve(peer));
        peer.on('error', reject);
    });

export const connectToHost = (peer, roomCode) =>
    peer.connect(`bullscows-${roomCode}`, { reliable: true });

export const createHostConnectionPool = ({ maxPlayers = MAX_PARTY_PLAYERS, maxPendingConnections = 2 } = {}) => {
    const connections = new Map();
    const connectionLimit = maxPlayers - 1 + maxPendingConnections;

    return {
        connections,
        get size() {
            return connections.size;
        },
        hasCapacity: () => connections.size < maxPlayers - 1,
        register: (conn) => {
            if (!conn || !conn.peer) {
                return false;
            }

            if (!connections.has(conn.peer) && connections.size >= connectionLimit) {
                return false;
            }

            connections.set(conn.peer, conn);
            return true;
        },
        remove: (peerId, conn) => {
            if (conn && connections.get(peerId) !== conn) {
                return false;
            }

            return connections.delete(peerId);
        },
        get: (peerId) => connections.get(peerId),
        broadcast: (message, { exceptPeerId } = {}) => {
            connections.forEach((conn, peerId) => {
                if (peerId === exceptPeerId || !conn.open) {
                    return;
                }

                try {
                    conn.send(message);
                } catch (error) {
                    return;
                }
            });
        },
        closeAll: () => {
            connections.forEach((conn) => {
                try {
                    conn.close();
                } catch (error) {
                    return;
                }
            });
            connections.clear();
        },
    };
};
