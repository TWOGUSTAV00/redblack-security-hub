import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  addContactToList,
  createConversationMessage,
  createDirectConversation,
  getContacts,
  getConversationMessages,
  getConversations,
  removeMessageForEveryone,
  removeMessageForMe,
  uploadMedia
} from '../controllers/realtime-chat.controller.js';
import { upload } from '../config/upload.js';

const router = Router();

router.use(requireAuth);
router.get('/contacts', getContacts);
router.post('/contacts', addContactToList);
router.get('/conversations', getConversations);
router.post('/conversations/direct', createDirectConversation);
router.get('/conversations/:conversationId/messages', getConversationMessages);
router.post('/conversations/:conversationId/messages', createConversationMessage);
router.post('/uploads', upload.array('files', 10), uploadMedia);
router.post('/messages/:messageId/delete-for-me', removeMessageForMe);
router.post('/messages/:messageId/delete-for-everyone', removeMessageForEveryone);

export default router;
