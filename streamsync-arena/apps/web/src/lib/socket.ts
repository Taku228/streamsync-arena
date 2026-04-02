import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  ?? import.meta.env.VITE_API_BASE_URL
  ?? 'http://localhost:3001';

export const socket = io(SOCKET_URL, { autoConnect: true });

export function reconnectSocket() {
  if (socket.connected) return;
  socket.connect();
}
