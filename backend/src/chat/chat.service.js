import { ChatConversation } from './chat-conversation.model.js';
import { ChatMessage } from './chat-message.model.js';
import { User } from '../auth/user.model.js';
import { AppError } from '../utils/errors.js';
import { uniqueIds, sortPair } from './chat.utils.js';
import mongoose from 'mongoose';

function normalizeMongoId(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return String(value._id || value.id || '');
  }
  return String(value);
}

function ensureValidObjectId(value, label = 'ID') {
  const normalized = normalizeMongoId(value);
  console.log(`${label} recebido:`, normalized);
  if (!normalized || !mongoose.isValidObjectId(normalized)) {
    throw new AppError(`${label} invalido`, 400);
  }
  return normalized;
}

function previewText(text = '', attachments = []) {
  if (text?.trim()) return text.trim().slice(0, 140);
  if (attachments.length) return attachments[0].kind === 'image' ? 'Imagem' : 'Arquivo';
  return 'Mensagem';
}

function unreadFor(conversation, userId) {
  return Number(conversation.unreadCounts?.get?.(String(userId)) ?? conversation.unreadCounts?.[String(userId)] ?? 0);
}

async function hydrateParticipantMap(ids) {
  const normalizedIds = uniqueIds(ids.map((id) => normalizeMongoId(id)).filter((id) => mongoose.isValidObjectId(id)));
  if (!normalizedIds.length) {
    return new Map();
  }
  const users = await User.find({ _id: { $in: normalizedIds } }).lean();
  return new Map(users.map((user) => [String(user._id), {
    id: String(user._id),
    _id: String(user._id),
    username: user.username,
    name: user.displayName,
    avatarUrl: user.avatarUrl || ''
  }]));
}

export async function listChatContacts(currentUserId, search = '') {
  const safeCurrentUserId = ensureValidObjectId(currentUserId, 'ID do usuario atual');
  const regex = search ? new RegExp(search, 'i') : null;
  const query = { _id: { $ne: safeCurrentUserId } };
  if (regex) {
    query.$or = [{ username: regex }, { displayName: regex }];
  }
  const users = await User.find(query).sort({ displayName: 1 }).limit(40).lean();
  return users.map((user) => ({
    id: String(user._id),
    _id: String(user._id),
    username: user.username,
    name: user.displayName,
    avatarUrl: user.avatarUrl || ''
  }));
}

export async function getOrCreateDirectConversation(currentUserId, otherUserId) {
  const safeCurrentUserId = ensureValidObjectId(currentUserId, 'ID do usuario atual');
  const safeOtherUserId = ensureValidObjectId(otherUserId, 'ID do contato');
  const [first, second] = sortPair(safeCurrentUserId, safeOtherUserId);
  let conversation = await ChatConversation.findOne({
    type: 'direct',
    participantIds: { $all: [first, second], $size: 2 }
  });

  if (!conversation) {
    conversation = await ChatConversation.create({
      type: 'direct',
      participantIds: [first, second],
      unreadCounts: {
        [first]: 0,
        [second]: 0
      }
    });
  }

  return conversation;
}

export async function listChatConversations(currentUserId) {
  const safeCurrentUserId = ensureValidObjectId(currentUserId, 'ID do usuario atual');
  const conversations = await ChatConversation.find({ participantIds: safeCurrentUserId })
    .sort({ lastMessageAt: -1 })
    .lean();

  const participantIds = uniqueIds(conversations.flatMap((conversation) => conversation.participantIds));
  const participantMap = await hydrateParticipantMap(participantIds);

  return conversations.map((conversation) => {
    const otherParticipants = conversation.participantIds
      .filter((participantId) => participantId !== String(currentUserId))
      .filter((participantId) => participantId !== safeCurrentUserId)
      .map((participantId) => participantMap.get(String(participantId)))
      .filter(Boolean);

    const counterpart = otherParticipants[0] || null;
    return {
      id: String(conversation._id),
      type: conversation.type,
      title: conversation.title || counterpart?.name || 'Nova conversa',
      avatarUrl: conversation.avatarUrl || counterpart?.avatarUrl || '',
      participantIds: conversation.participantIds,
      counterpart,
      lastMessageText: conversation.lastMessageText,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: unreadFor(conversation, currentUserId)
    };
  });
}

export async function getConversationDetail(currentUserId, conversationId) {
  const safeCurrentUserId = ensureValidObjectId(currentUserId, 'ID do usuario atual');
  const safeConversationId = ensureValidObjectId(conversationId, 'ID da conversa');
  const conversation = await ChatConversation.findOne({ _id: safeConversationId, participantIds: safeCurrentUserId }).lean();
  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }

  const participantMap = await hydrateParticipantMap(conversation.participantIds);
  return {
    id: String(conversation._id),
    type: conversation.type,
    title: conversation.title || conversation.participantIds.filter((id) => id !== safeCurrentUserId).map((id) => participantMap.get(id)?.name).filter(Boolean).join(', ') || 'Conversa',
    avatarUrl: conversation.avatarUrl || '',
    participants: conversation.participantIds.map((id) => participantMap.get(id)).filter(Boolean),
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: unreadFor(conversation, currentUserId)
  };
}

export async function listMessages(currentUserId, conversationId, { limit = 30, before } = {}) {
  const safeCurrentUserId = ensureValidObjectId(currentUserId, 'ID do usuario atual');
  const safeConversationId = ensureValidObjectId(conversationId, 'ID da conversa');
  const conversation = await ChatConversation.findOne({ _id: safeConversationId, participantIds: safeCurrentUserId }).lean();
  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }

  const query = { conversationId: safeConversationId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const safeLimit = Math.min(Number(limit) || 30, 60);
  const messages = await ChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .lean();

  const senderIds = uniqueIds(messages.map((message) => message.senderId));
  const participantMap = await hydrateParticipantMap(senderIds);

  const ordered = messages.reverse().map((message) => ({
    id: String(message._id),
    conversationId: message.conversationId,
    senderId: message.senderId,
    sender: participantMap.get(String(message.senderId)) || null,
    text: message.text,
    attachments: message.attachments || [],
    createdAt: message.createdAt,
    readBy: message.readBy || []
  }));

  return {
    messages: ordered,
    hasMore: messages.length === safeLimit
  };
}

export async function markConversationRead(currentUserId, conversationId) {
  const safeCurrentUserId = ensureValidObjectId(currentUserId, 'ID do usuario atual');
  const safeConversationId = ensureValidObjectId(conversationId, 'ID da conversa');
  const conversation = await ChatConversation.findOne({ _id: safeConversationId, participantIds: safeCurrentUserId });
  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }
  conversation.unreadCounts.set(safeCurrentUserId, 0);
  await conversation.save();
  await ChatMessage.updateMany(
    { conversationId: safeConversationId, readBy: { $ne: safeCurrentUserId } },
    { $addToSet: { readBy: safeCurrentUserId } }
  );
  return true;
}

export async function sendChatMessage({ senderId, conversationId, recipientId, text = '', attachments = [] }) {
  const safeSenderId = ensureValidObjectId(senderId, 'ID do remetente');
  const normalizedAttachments = (attachments || []).map((attachment) => ({
    kind: attachment.kind === 'file' ? 'file' : 'image',
    name: attachment.name || '',
    url: attachment.url || '',
    mimeType: attachment.mimeType || '',
    size: Number(attachment.size || 0)
  }));

  let conversation = null;
  if (conversationId) {
    const safeConversationId = ensureValidObjectId(conversationId, 'ID da conversa');
    conversation = await ChatConversation.findOne({ _id: safeConversationId, participantIds: safeSenderId });
  } else if (recipientId) {
    conversation = await getOrCreateDirectConversation(safeSenderId, recipientId);
  }

  if (!conversation) {
    throw new AppError('Conversa nao encontrada para envio', 404);
  }

  const message = await ChatMessage.create({
    conversationId: String(conversation._id),
    senderId: safeSenderId,
    text: text || '',
    attachments: normalizedAttachments,
    readBy: [safeSenderId]
  });

  conversation.lastMessageText = previewText(text, normalizedAttachments);
  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessageSenderId = safeSenderId;
  conversation.lastAttachments = normalizedAttachments;
  for (const participantId of conversation.participantIds) {
    if (String(participantId) === safeSenderId) {
      conversation.unreadCounts.set(String(participantId), 0);
    } else {
      conversation.unreadCounts.set(String(participantId), unreadFor(conversation, participantId) + 1);
    }
  }
  await conversation.save();

  const participantMap = await hydrateParticipantMap(conversation.participantIds);
  const sender = participantMap.get(safeSenderId) || null;

  return {
    conversation: {
      id: String(conversation._id),
      type: conversation.type,
      title: conversation.title || conversation.participantIds.filter((id) => id !== safeSenderId).map((id) => participantMap.get(String(id))?.name).filter(Boolean).join(', ') || 'Conversa',
      avatarUrl: conversation.avatarUrl || '',
      participantIds: conversation.participantIds,
      lastMessageText: conversation.lastMessageText,
      lastMessageAt: conversation.lastMessageAt
    },
    message: {
      id: String(message._id),
      conversationId: String(conversation._id),
      senderId: safeSenderId,
      sender,
      text: message.text,
      attachments: normalizedAttachments,
      createdAt: message.createdAt,
      readBy: message.readBy
    }
  };
}
