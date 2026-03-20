import mongoose from 'mongoose';
import { listChatContacts, listChatConversations, getConversationDetail, listMessages, getOrCreateDirectConversation, markConversationRead } from '../chat/chat.service.js';

export async function getContacts(req, res, next) {
  try {
    const contacts = await listChatContacts(req.user.id, req.query.q || '');
    res.json({ success: true, contacts });
  } catch (error) {
    next(error);
  }
}

export async function getConversations(req, res, next) {
  try {
    const conversations = await listChatConversations(req.user.id);
    res.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function createDirectConversation(req, res, next) {
  try {
    const participantId = String(req.body.participantId || req.body._id || '').trim();
    const participantUsername = String(req.body.participantUsername || req.body.username || '').trim().toLowerCase();
    console.log('createDirectConversation payload:', {
      currentUserId: req.user.id,
      participantId,
      participantUsername
    });

    if (!participantId && !participantUsername) {
      return res.status(400).json({ success: false, message: 'ID invalido' });
    }

    if (participantId && !mongoose.Types.ObjectId.isValid(participantId) && !participantUsername) {
      return res.status(400).json({ success: false, message: 'ID invalido' });
    }

    const participantReference = mongoose.Types.ObjectId.isValid(participantId)
      ? participantId
      : participantUsername;

    const conversation = await getOrCreateDirectConversation(req.user.id, participantReference);
    const detail = await getConversationDetail(req.user.id, conversation.id);
    res.status(201).json({ success: true, conversation: detail });
  } catch (error) {
    next(error);
  }
}

export async function getConversationMessages(req, res, next) {
  try {
    const payload = await listMessages(req.user.id, req.params.conversationId, {
      limit: req.query.limit,
      before: req.query.before
    });
    res.json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
}

export async function markRead(req, res, next) {
  try {
    await markConversationRead(req.user.id, req.params.conversationId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
