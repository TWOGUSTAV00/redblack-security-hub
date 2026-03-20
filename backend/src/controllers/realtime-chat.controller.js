import {
  addContact,
  createMessage,
  deleteMessageForEveryone,
  deleteMessageForMe,
  getConversationDetail,
  getOrCreateDirectConversation,
  listChatContacts,
  listChatConversations,
  listMessages
} from '../chat/chat.service.js';
import { mapUploadedFile } from '../config/upload.js';

export async function getContacts(req, res, next) {
  try {
    const contacts = await listChatContacts(req.user.id, req.query.q || '');
    res.json({ success: true, contacts });
  } catch (error) {
    next(error);
  }
}

export async function addContactToList(req, res, next) {
  try {
    const contact = await addContact(req.user.id, req.body.contactId);
    res.status(201).json({ success: true, contact });
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
    const reference = req.body.participantId || req.body.participantEmail || '';
    const conversation = await getOrCreateDirectConversation(req.user.id, reference);
    const detail = await getConversationDetail(req.user.id, conversation._id);
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

export async function uploadMedia(req, res, next) {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const files = (req.files || []).map((file) => {
      const mapped = mapUploadedFile(file);
      return { ...mapped, url: `${baseUrl}${mapped.url}` };
    });
    res.status(201).json({ success: true, files });
  } catch (error) {
    next(error);
  }
}

export async function createConversationMessage(req, res, next) {
  try {
    const payload = await createMessage({
      senderId: req.user.id,
      conversationId: req.params.conversationId === 'new' ? null : req.params.conversationId,
      recipientId: req.body.recipientId,
      text: req.body.text,
      media: req.body.media || [],
      createdAtClient: req.body.createdAtClient || null
    });
    res.status(201).json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
}

export async function removeMessageForMe(req, res, next) {
  try {
    const payload = await deleteMessageForMe(req.user.id, req.params.messageId);
    res.json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
}

export async function removeMessageForEveryone(req, res, next) {
  try {
    const payload = await deleteMessageForEveryone(req.user.id, req.params.messageId);
    res.json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
}
