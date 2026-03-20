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
    const participantReference = req.body.participantId || req.body.participantUsername || req.body.username || '';
    console.log('createDirectConversation payload:', {
      currentUserId: req.user.id,
      participantId: req.body.participantId,
      participantUsername: req.body.participantUsername,
      username: req.body.username
    });
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
