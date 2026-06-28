import Peer from 'peerjs';

export const createHostPeer = (roomCode) =>
    new Promise((resolve, reject) => {
        const peer = new Peer(`bullscows-${roomCode}`);
        peer.on('open', () => resolve(peer));
        peer.on('error', reject);
    });

export const createGuestPeer = () =>
    new Promise((resolve, reject) => {
        const peer = new Peer();
        peer.on('open', () => resolve(peer));
        peer.on('error', reject);
    });

export const connectToHost = (peer, roomCode) =>
    peer.connect(`bullscows-${roomCode}`, { reliable: true });
