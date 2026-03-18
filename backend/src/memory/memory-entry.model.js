import mongoose from 'mongoose';

const memoryEntrySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  conversationId: { type: String, required: true, index: true },
  sourceMessage: { type: String, default: '' },
  normalizedText: { type: String, default: '' },
  embedding: { type: [Number], default: [] },
  metadata: {
    provider: { type: String, default: 'nemo' },
    topic: { type: String, default: 'general' }
  }
}, { timestamps: true });

export const MemoryEntry = mongoose.model('MemoryEntry', memoryEntrySchema);
