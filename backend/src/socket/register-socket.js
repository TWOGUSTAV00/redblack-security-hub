import crypto from 'node:crypto';
import { Server } from 'socket.io';
import { verifyToken, setUserStatus } from '../auth/auth.service.js';
import { logger } from '../utils/logger.js';
import { addOnlineSocket, getOnlineUserIds, isUserOnline, removeOnlineSocket } from '../chat/presence.store.js';
import { createMessage, deleteMessageForEveryone, deleteMessageForMe } from '../chat/chat.service.js';
import { getCallSession, removeCallSession, setCallSession } from '../chat/call-session.store.js';

export function registerSocket(server, allowedOrigins = []) {
  const io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, true);
      },
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Nao autenticado'));
      const payload = verifyToken(token);
      socket.data.user = {
        id: payload.sub,
        _id: payload.sub,
        name: payload.name,
        email: payload.email,
        avatarUrl: payload.avatarUrl || ''
      };
      return next();
    } catch (_error) {
      return next(new Error('Token invalido'));
    }
  });

  io.on('connection', async (socket) => {
    const currentUser = socket.data.user;
    addOnlineSocket(currentUser.id, socket.id);
    socket.join(`user:${currentUser.id}`);
    await setUserStatus(currentUser.id, 'online').catch(() => null);
    io.emit('presence:update', { onlineUserIds: getOnlineUserIds() });
    socket.emit('presence:snapshot', { onlineUserIds: getOnlineUserIds() });

    socket.on('conversation:join', ({ conversationId }) => {
      if (!conversationId) return;
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('conversation:typing', ({ conversationId, isTyping }) => {
      if (!conversationId) return;
      socket.to(`conversation:${conversationId}`).emit('conversation:typing', {
        conversationId,
        userId: currentUser.id,
        userName: currentUser.name,
        isTyping: Boolean(isTyping)
      });
    });

    socket.on('message:send', async (payload, callback) => {
      try {
        const response = await createMessage({
          senderId: currentUser.id,
          recipientId: payload.recipientId,
          conversationId: payload.conversationId,
          text: payload.text,
          media: payload.media || [],
          createdAtClient: payload.createdAtClient || null
        });

        socket.join(`conversation:${response.conversation.id}`);
        io.to(`conversation:${response.conversation.id}`).emit('message:new', response);
        for (const participant of response.conversation.participants || []) {
          io.to(`user:${participant.id}`).emit('conversation:update', response.conversation);
        }
        callback?.({ ok: true, ...response });
      } catch (error) {
        logger.error({ error: error.message }, 'Falha ao enviar mensagem');
        callback?.({ ok: false, message: error.message || 'Falha ao enviar mensagem' });
      }
    });

    socket.on('message:delete-for-me', async ({ messageId }, callback) => {
      try {
        const payload = await deleteMessageForMe(currentUser.id, messageId);
        io.to(`user:${currentUser.id}`).emit('message:deleted-for-me', payload);
        callback?.({ ok: true, ...payload });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on('message:delete-for-everyone', async ({ messageId }, callback) => {
      try {
        const payload = await deleteMessageForEveryone(currentUser.id, messageId);
        io.to(`conversation:${payload.conversationId}`).emit('message:deleted-for-everyone', payload);
        callback?.({ ok: true, ...payload });
      } catch (error) {
        callback?.({ ok: false, message: error.message });
      }
    });

    socket.on('call:initiate', ({ recipientId, conversationId, callType }, callback) => {
      const callId = crypto.randomUUID();
      const payload = {
        callId,
        callerId: currentUser.id,
        callerName: currentUser.name,
        recipientId,
        conversationId,
        callType: callType === 'video' ? 'video' : 'audio'
      };
      setCallSession(callId, payload);
      io.to(`user:${recipientId}`).emit('call:incoming', payload);
      callback?.({ ok: true, ...payload });
    });

    socket.on('call:accept', ({ callId }) => {
      const session = getCallSession(callId);
      if (!session) return;
      io.to(`user:${session.callerId}`).emit('call:accepted', { callId, byUserId: currentUser.id });
    });

    socket.on('call:reject', ({ callId }) => {
      const session = getCallSession(callId);
      if (!session) return;
      io.to(`user:${session.callerId}`).emit('call:rejected', { callId, byUserId: currentUser.id });
      removeCallSession(callId);
    });

    socket.on('webrtc:offer', ({ callId, targetUserId, offer }) => {
      io.to(`user:${targetUserId}`).emit('webrtc:offer', { callId, fromUserId: currentUser.id, offer });
    });

    socket.on('webrtc:answer', ({ callId, targetUserId, answer }) => {
      io.to(`user:${targetUserId}`).emit('webrtc:answer', { callId, fromUserId: currentUser.id, answer });
    });

    socket.on('webrtc:ice-candidate', ({ callId, targetUserId, candidate }) => {
      io.to(`user:${targetUserId}`).emit('webrtc:ice-candidate', { callId, fromUserId: currentUser.id, candidate });
    });

    socket.on('call:end', ({ callId, targetUserId }) => {
      io.to(`user:${targetUserId}`).emit('call:ended', { callId, byUserId: currentUser.id });
      removeCallSession(callId);
    });

    socket.on('disconnect', async () => {
      removeOnlineSocket(currentUser.id, socket.id);
      if (!isUserOnline(currentUser.id)) {
        await setUserStatus(currentUser.id, 'offline').catch(() => null);
      }
      io.emit('presence:update', { onlineUserIds: getOnlineUserIds() });
    });
  });

  return io;
}
