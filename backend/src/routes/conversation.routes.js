import { Router } from 'express';
import { getConversation, getConversations } from '../controllers/conversation.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', getConversations);
router.get('/:conversationId', getConversation);

export default router;
