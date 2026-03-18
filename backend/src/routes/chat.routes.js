import { Router } from 'express';
import { sendMessage, streamMessage } from '../controllers/chat.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.post('/message', sendMessage);
router.post('/stream', streamMessage);

export default router;
