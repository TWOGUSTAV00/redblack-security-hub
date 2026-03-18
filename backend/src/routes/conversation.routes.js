import { Router } from 'express';
import { getConversation, getConversations } from '../controllers/conversation.controller.js';

const router = Router();

router.get('/:userId', getConversations);
router.get('/:userId/:conversationId', getConversation);

export default router;
