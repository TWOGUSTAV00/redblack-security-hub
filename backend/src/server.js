import http from 'node:http';
import { createApp, startServer } from './app.js';
import { registerSocket } from './socket/register-socket.js';

const { app, allowedOrigins } = await createApp();
const server = http.createServer(app);

registerSocket(server, allowedOrigins);
startServer(server);
