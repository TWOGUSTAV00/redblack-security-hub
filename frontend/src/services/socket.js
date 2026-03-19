import { io } from 'socket.io-client';
import { API_BASE_URL } from './api.js';

function socketBaseUrl() {
  return API_BASE_URL.replace(/\/api$/, '');
}

export function createChatSocket(token) {
  return io(socketBaseUrl(), {
    transports: ['websocket', 'polling'],
    auth: { token }
  });
}
