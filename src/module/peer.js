import Peer from 'peerjs';

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
