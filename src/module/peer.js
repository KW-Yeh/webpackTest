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

const PEER_OPEN_TIMEOUT_MS = 10000;

const createPeer = (peerId) =>
    new Promise((resolve, reject) => {
        const peer = new Peer(peerId, peerOptions);
        const cleanup = () => {
            clearTimeout(timer);
            peer.off('open', handleOpen);
            peer.off('error', handleError);
        };
        const handleOpen = () => {
            cleanup();
            resolve(peer);
        };
        const handleError = (error) => {
            cleanup();
            peer.destroy();
            reject(error);
        };
        const timer = setTimeout(() => {
            cleanup();
            peer.destroy();
            const error = new Error('Peer signaling connection timed out');
            error.type = 'peer-open-timeout';
            reject(error);
        }, PEER_OPEN_TIMEOUT_MS);
        peer.on('open', handleOpen);
        peer.on('error', handleError);
    });

export const createHostPeer = (roomCode) => createPeer(`bullscows-${roomCode}`);

export const createGuestPeer = () => createPeer(undefined);

export const connectToHost = (peer, roomCode) =>
    peer.connect(`bullscows-${roomCode}`, { reliable: true });

export const createHostConnectionPool = ({ maxPlayers = MAX_PARTY_PLAYERS, maxPendingConnections = 2 } = {}) => {
    const connections = new Map();
    const pendingConnections = new Map();
    const verifiedConnectionLimit = maxPlayers - 1;

    return {
        connections,
        pendingConnections,
        get size() {
            return connections.size;
        },
        hasCapacity: () => connections.size < verifiedConnectionLimit,
        registerPending: (conn) => {
            if (!conn || !conn.peer) {
                return false;
            }

            const existingConnection = pendingConnections.get(conn.peer);
            if (existingConnection) {
                return existingConnection === conn;
            }

            if (pendingConnections.size >= maxPendingConnections) {
                return false;
            }

            pendingConnections.set(conn.peer, conn);
            return true;
        },
        promote: (conn, { replacePeerId, replaceConnection } = {}) => {
            if (!conn?.peer || pendingConnections.get(conn.peer) !== conn) {
                return false;
            }

            const replacementRequested = replacePeerId !== undefined || replaceConnection !== undefined;
            const replacementIsValid = replacementRequested
                && replacePeerId !== undefined
                && replaceConnection !== undefined
                && connections.get(replacePeerId) === replaceConnection;

            if (replacementRequested && !replacementIsValid) {
                return false;
            }

            const existingConnection = connections.get(conn.peer);
            if (existingConnection && (!replacementIsValid || replacePeerId !== conn.peer || existingConnection !== replaceConnection)) {
                return false;
            }

            const verifiedSizeAfterReplacement = connections.size - (replacementIsValid ? 1 : 0);
            if (verifiedSizeAfterReplacement >= verifiedConnectionLimit) {
                return false;
            }

            pendingConnections.delete(conn.peer);
            if (replacementIsValid) connections.delete(replacePeerId);
            connections.set(conn.peer, conn);
            return true;
        },
        removePending: (peerId, conn) => {
            if (conn && pendingConnections.get(peerId) !== conn) {
                return false;
            }

            return pendingConnections.delete(peerId);
        },
        isVerified: (peerId, conn) => connections.get(peerId) === conn,
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
            pendingConnections.forEach((conn) => {
                try {
                    conn.close();
                } catch (error) {
                    return;
                }
            });
            connections.clear();
            pendingConnections.clear();
        },
    };
};
