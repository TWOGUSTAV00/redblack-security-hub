import { getConversationMessages, listConversations } from '../memory/memory.service.js';

export async function getConversations(req, res, next) {
  try {
    const { userId } = req.params;
    const conversations = await listConversations(userId);
    res.json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const { userId, conversationId } = req.params;
    const conversation = await getConversationMessages(userId, conversationId);
    res.json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}
