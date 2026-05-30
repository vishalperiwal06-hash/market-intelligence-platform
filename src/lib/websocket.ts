import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = () => {
  if (!socket) {
    let URL = process.env.NEXT_PUBLIC_WEBSOCKET_URL;
    if (!URL && typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.hostname;
      URL = `${protocol}//${host}:4000`;
    }
    if (!URL) {
      URL = 'ws://localhost:4000';
    }

    socket = io(URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
  }
  return socket;
};

