import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  kind: { type: String, enum: ['image', 'file'], default: 'image' },
  name: { type: String, default: '' },
  url: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 }
}, { _id: false });

const chatConversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['direct', 'group'], default: 'direct' },
  participantIds: [{ type: String, required: true, index: true }],
  title: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  lastMessageText: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  unreadCounts: { type: Map, of: Number, default: {} },
  lastMessageSenderId: { type: String, default: '' },
  lastAttachments: [attachmentSchema]
}, { timestamps: true });

chatConversationSchema.index({ participantIds: 1, lastMessageAt: -1 });

export const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
