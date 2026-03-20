import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }],
  participantKey: { type: String, required: true, unique: true, index: true },
  lastMessageId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
  lastMessagePreview: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['direct'], default: 'direct' }
}, { timestamps: true });

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const ChatConversation = mongoose.model('ChatConversation', conversationSchema);
