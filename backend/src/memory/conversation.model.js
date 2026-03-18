import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant', 'system'], required: true },
  content: { type: String, default: '' },
  provider: { type: String, default: 'nemo' },
  attachments: [{
    kind: { type: String, enum: ['image'], default: 'image' },
    mimeType: String,
    url: String,
    name: String
  }],
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, default: 'Nova conversa' },
  summary: { type: String, default: '' },
  lastMessageAt: { type: Date, default: Date.now },
  messages: [messageSchema]
}, { timestamps: true });

export const Conversation = mongoose.model('Conversation', conversationSchema);
