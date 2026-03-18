import { getConversationMessages, listConversations } from '../memory/memory.service.js';

export async function getConversations(req, res, next) {
  try {
    const conversations = await listConversations(req.user.id);
    res.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const { conversationId } = req.params;
    const conversation = await getConversationMessages(req.user.id, conversationId);
    res.json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}
