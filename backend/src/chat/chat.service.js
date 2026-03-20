import mongoose from 'mongoose';
import { User } from '../auth/user.model.js';
import { ChatConversation } from './chat-conversation.model.js';
import { ChatMessage } from './chat-message.model.js';
import { AppError } from '../utils/errors.js';
import { decryptMessageText, encryptMessageText } from '../utils/crypto.js';

function toObjectId(value, label = 'ID') {
  const normalized = String(value || '').trim();
  if (!normalized || !mongoose.Types.ObjectId.isValid(normalized)) {
    throw new AppError(`${label} invalido`, 400);
  }
  return new mongoose.Types.ObjectId(normalized);
}

function buildParticipantKey(userIds) {
  return [...userIds].map((id) => String(id)).sort().join(':');
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: String(user._id),
    _id: String(user._id),
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl || '',
    status: user.status || 'offline'
  };
}

function messagePreview(message) {
  if (message.text) return message.text.slice(0, 120);
  if (message.media?.length) {
    if (message.media[0].type === 'image') return 'Imagem';
    if (message.media[0].type === 'video') return 'Video';
    if (message.media[0].type === 'audio') return 'Audio';
    return 'Arquivo';
  }
  return 'Mensagem';
}

function sanitizeMessage(message, currentUserId, senderMap) {
  const deletedForIds = (message.deletedFor || []).map((item) => String(item));
  const isDeletedForCurrentUser = deletedForIds.includes(String(currentUserId));
  return {
    id: String(message._id),
    conversationId: String(message.conversationId),
    senderId: String(message.senderId),
    sender: senderMap.get(String(message.senderId)) || null,
    text: message.deletedForEveryone || isDeletedForCurrentUser ? '' : (message.text || decryptMessageText(message.encryptedText) || ''),
    media: message.deletedForEveryone || isDeletedForCurrentUser ? [] : (message.media || []),
    deletedForEveryone: Boolean(message.deletedForEveryone),
    deletedFor: deletedForIds,
    createdAt: message.createdAt,
    readBy: (message.readBy || []).map((id) => String(id))
  };
}

async function loadUsersMap(userIds) {
  const uniqueIds = [...new Set(userIds.map((id) => String(id)).filter(Boolean))];
  const users = await User.find({ _id: { $in: uniqueIds } }).lean();
  return new Map(users.map((user) => [String(user._id), sanitizeUser(user)]));
}

async function getUserByReference(reference) {
  const value = String(reference || '').trim();
  if (!value) {
    throw new AppError('Contato invalido', 400);
  }

  if (mongoose.Types.ObjectId.isValid(value)) {
    const user = await User.findById(value).lean();
    if (user) return user;
  }

  const user = await User.findOne({ email: value.toLowerCase() }).lean();
  if (user) return user;

  throw new AppError('Contato nao encontrado', 404);
}

export async function listChatContacts(currentUserId, search = '') {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const regex = search ? new RegExp(search, 'i') : null;
  const query = { _id: { $ne: currentId } };
  if (regex) {
    query.$or = [{ name: regex }, { email: regex }];
  }

  const users = await User.find(query).sort({ name: 1 }).limit(50).lean();
  return users.map((user) => sanitizeUser(user));
}

export async function addContact(currentUserId, contactId) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const contactObjectId = toObjectId(contactId, 'ID do contato');
  if (String(currentId) === String(contactObjectId)) {
    throw new AppError('Voce nao pode adicionar a propria conta', 400);
  }

  await User.updateOne(
    { _id: currentId, 'contacts.userId': { $ne: contactObjectId } },
    { $push: { contacts: { userId: contactObjectId } } }
  );

  const contact = await User.findById(contactObjectId).lean();
  if (!contact) {
    throw new AppError('Contato nao encontrado', 404);
  }
  return sanitizeUser(contact);
}

export async function getOrCreateDirectConversation(currentUserId, otherUserReference) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const otherUser = await getUserByReference(otherUserReference);
  const otherId = toObjectId(otherUser._id, 'ID do contato');
  if (String(currentId) === String(otherId)) {
    throw new AppError('Voce nao pode iniciar conversa com o proprio usuario', 400);
  }

  const participantKey = buildParticipantKey([currentId, otherId]);
  let conversation = await ChatConversation.findOne({ participantKey });
  if (!conversation) {
    conversation = await ChatConversation.create({
      participants: [currentId, otherId],
      participantKey,
      createdBy: currentId,
      lastMessageAt: new Date()
    });
  }
  return conversation;
}

export async function listChatConversations(currentUserId) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const conversations = await ChatConversation.find({ participants: currentId })
    .sort({ lastMessageAt: -1 })
    .populate('participants', 'name email avatarUrl status')
    .lean();

  return conversations.map((conversation) => {
    const counterpart = (conversation.participants || [])
      .map((user) => sanitizeUser(user))
      .find((user) => user.id !== String(currentId)) || null;

    return {
      id: String(conversation._id),
      participants: (conversation.participants || []).map((user) => sanitizeUser(user)),
      counterpart,
      title: counterpart?.name || 'Nova conversa',
      avatarUrl: counterpart?.avatarUrl || '',
      lastMessagePreview: conversation.lastMessagePreview || '',
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: 0
    };
  });
}

export async function getConversationDetail(currentUserId, conversationId) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const conversationObjectId = toObjectId(conversationId, 'ID da conversa');
  const conversation = await ChatConversation.findOne({ _id: conversationObjectId, participants: currentId })
    .populate('participants', 'name email avatarUrl status')
    .lean();

  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }

  const participants = (conversation.participants || []).map((user) => sanitizeUser(user));
  const counterpart = participants.find((user) => user.id !== String(currentId)) || null;
  return {
    id: String(conversation._id),
    participants,
    counterpart,
    title: counterpart?.name || 'Nova conversa',
    avatarUrl: counterpart?.avatarUrl || '',
    lastMessagePreview: conversation.lastMessagePreview || '',
    lastMessageAt: conversation.lastMessageAt
  };
}

export async function listMessages(currentUserId, conversationId, { limit = 30, before } = {}) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const conversationObjectId = toObjectId(conversationId, 'ID da conversa');
  const conversation = await ChatConversation.findOne({ _id: conversationObjectId, participants: currentId }).lean();
  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }

  const query = { conversationId: conversationObjectId };
  if (before) {
    query.createdAt = { $lt: new Date(before) };
  }

  const items = await ChatMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 30, 60))
    .lean();

  const senderMap = await loadUsersMap(items.map((item) => item.senderId));
  const messages = items.reverse().map((item) => sanitizeMessage(item, currentId, senderMap));
  return {
    messages,
    hasMore: items.length === Math.min(Number(limit) || 30, 60)
  };
}

export async function createMessage({ senderId, recipientId, conversationId, text = '', media = [], createdAtClient = null }) {
  const senderObjectId = toObjectId(senderId, 'ID do remetente');
  let conversation = null;

  if (conversationId) {
    const conversationObjectId = toObjectId(conversationId, 'ID da conversa');
    conversation = await ChatConversation.findOne({ _id: conversationObjectId, participants: senderObjectId });
  } else {
    conversation = await getOrCreateDirectConversation(senderObjectId, recipientId);
  }

  if (!conversation) {
    throw new AppError('Conversa nao encontrada', 404);
  }

  const safeText = String(text || '').trim();
  if (!safeText && !(media || []).length) {
    throw new AppError('Mensagem vazia', 400);
  }

  const message = await ChatMessage.create({
    conversationId: conversation._id,
    senderId: senderObjectId,
    text: safeText,
    encryptedText: safeText ? encryptMessageText(safeText) : '',
    media,
    createdAtClient,
    readBy: [senderObjectId]
  });

  conversation.lastMessageId = message._id;
  conversation.lastMessagePreview = messagePreview({ text: safeText, media });
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  const senderMap = await loadUsersMap(conversation.participants);
  return {
    conversation: await getConversationDetail(senderObjectId, conversation._id),
    message: sanitizeMessage(message.toObject(), senderObjectId, senderMap)
  };
}

export async function deleteMessageForMe(currentUserId, messageId) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const messageObjectId = toObjectId(messageId, 'ID da mensagem');
  const message = await ChatMessage.findById(messageObjectId);
  if (!message) {
    throw new AppError('Mensagem nao encontrada', 404);
  }
  if (!message.deletedFor.some((id) => String(id) === String(currentId))) {
    message.deletedFor.push(currentId);
    await message.save();
  }
  return { messageId: String(message._id), deletedForUserId: String(currentId) };
}

export async function deleteMessageForEveryone(currentUserId, messageId) {
  const currentId = toObjectId(currentUserId, 'ID do usuario atual');
  const messageObjectId = toObjectId(messageId, 'ID da mensagem');
  const message = await ChatMessage.findById(messageObjectId);
  if (!message) {
    throw new AppError('Mensagem nao encontrada', 404);
  }
  if (String(message.senderId) !== String(currentId)) {
    throw new AppError('Apenas o remetente pode apagar para todos', 403);
  }
  message.text = '';
  message.encryptedText = '';
  message.media = [];
  message.deletedForEveryone = true;
  await message.save();
  return { messageId: String(message._id), conversationId: String(message.conversationId) };
}
