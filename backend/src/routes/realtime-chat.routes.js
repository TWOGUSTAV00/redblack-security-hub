import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createDirectConversation, getContacts, getConversationMessages, getConversations, markRead } from '../controllers/realtime-chat.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/contacts', getContacts);
router.get('/conversations', getConversations);
router.post('/conversations/direct', createDirectConversation);
router.get('/conversations/:conversationId/messages', getConversationMessages);
router.post('/conversations/:conversationId/read', markRead);

export default router;
