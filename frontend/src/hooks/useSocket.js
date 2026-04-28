import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '../services/api';

// Use same backend URL as API for Socket.IO (set VITE_API_URL when deployed)
const SOCKET_URL = import.meta.env.VITE_API_URL || import.meta.env.VITE_SOCKET_URL || '';

export function useSocket() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const url = SOCKET_URL || window.location.origin;
    const s = io(url, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));
    return () => {
      s.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, []);

  return { socket, connected };
}
