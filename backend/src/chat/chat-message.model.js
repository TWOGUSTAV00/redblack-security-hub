import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  kind: { type: String, enum: ['image', 'file'], default: 'image' },
  name: { type: String, default: '' },
  url: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 }
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  senderId: { type: String, required: true, index: true },
  text: { type: String, default: '' },
  attachments: [attachmentSchema],
  deliveredAt: { type: Date, default: Date.now },
  readBy: [{ type: String }]
}, { timestamps: true });

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
