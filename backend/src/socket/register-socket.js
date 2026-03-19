import { Server } from 'socket.io';
import { verifyToken } from '../auth/auth.service.js';
import { logger } from '../utils/logger.js';
import { addOnlineSocket, getOnlineUserIds, isUserOnline, removeOnlineSocket } from '../chat/presence.store.js';
import { getConversationDetail, markConversationRead, sendChatMessage } from '../chat/chat.service.js';

export function registerSocket(server, allowedOrigins = []) {
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true);
      },
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return next(new Error('Nao autenticado'));
      }
      const payload = verifyToken(token);
      socket.data.user = {
        id: payload.sub,
        username: payload.username,
        name: payload.displayName,
        avatarUrl: payload.avatarUrl || ''
      };
      next();
    } catch (_error) {
      next(new Error('Token invalido'));
    }
  });

  io.on('connection', (socket) => {
    const currentUser = socket.data.user;
    addOnlineSocket(currentUser.id, socket.id);
    socket.join(`user:${currentUser.id}`);
    socket.emit('presence:snapshot', { onlineUserIds: getOnlineUserIds() });
    io.emit('presence:update', { userId: currentUser.id, online: true, onlineUserIds: getOnlineUserIds() });

    socket.on('chat:conversation:join', async ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conversation:${conversationId}`);
      await markConversationRead(currentUser.id, conversationId).catch(() => null);
      const detail = await getConversationDetail(currentUser.id, conversationId).catch(() => null);
      if (detail) {
        io.to(`user:${currentUser.id}`).emit('chat:conversation:read', { conversationId });
      }
    });

    socket.on('chat:typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('chat:typing', {
        conversationId,
        userId: currentUser.id,
        name: currentUser.name,
        isTyping: Boolean(isTyping)
      });
    });

    socket.on('chat:message:send', async (payload, callback) => {
      try {
        const sent = await sendChatMessage({
          senderId: currentUser.id,
          conversationId: payload.conversationId,
          recipientId: payload.recipientId,
          text: payload.text,
          attachments: payload.attachments
        });

        socket.join(`conversation:${sent.conversation.id}`);
        io.to(`conversation:${sent.conversation.id}`).emit('chat:message:new', sent);
        for (const participantId of sent.conversation.participantIds || []) {
          io.to(`user:${participantId}`).emit('chat:conversation:update', sent.conversation);
        }
        callback?.({ ok: true, ...sent });
      } catch (error) {
        logger.error({ error: error.message }, 'Falha ao enviar mensagem realtime');
        callback?.({ ok: false, message: error.message || 'Falha ao enviar mensagem' });
      }
    });

    socket.on('disconnect', () => {
      removeOnlineSocket(currentUser.id, socket.id);
      if (!isUserOnline(currentUser.id)) {
        io.emit('presence:update', { userId: currentUser.id, online: false, onlineUserIds: getOnlineUserIds() });
      }
    });
  });

  return io;
}
