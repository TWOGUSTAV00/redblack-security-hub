import mongoose from 'mongoose';

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video', 'file', 'audio'], required: true },
  name: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  size: { type: Number, default: 0 },
  url: { type: String, required: true }
}, { _id: false });

const chatMessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatConversation', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text: { type: String, default: '' },
  encryptedText: { type: String, default: '' },
  media: { type: [mediaSchema], default: [] },
  deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedForEveryone: { type: Boolean, default: false },
  createdAtClient: { type: Date, default: null },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

chatMessageSchema.index({ conversationId: 1, createdAt: -1 });

export const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
