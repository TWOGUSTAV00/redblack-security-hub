import { Conversation } from './conversation.model.js';
import { MemoryEntry } from './memory-entry.model.js';
import { createEmbedding, cosineSimilarity } from '../ai/embeddings.service.js';

export async function getOrCreateConversation(userId, conversationId) {
  if (conversationId) {
    const existing = await Conversation.findOne({ _id: conversationId, userId });
    if (existing) {
      return existing;
    }
  }

  return Conversation.create({ userId, title: 'Nova conversa', messages: [] });
}

export async function appendMessage(conversation, message) {
  conversation.messages.push(message);
  conversation.lastMessageAt = new Date();
  if (conversation.messages.length === 1 && message.role === 'user') {
    conversation.title = message.content.slice(0, 60) || 'Nova conversa';
  }
  if (message.role === 'assistant' && message.content) {
    conversation.summary = message.content.slice(0, 140);
  }
  await conversation.save();
  return conversation;
}

export async function saveMemoryEntry({ userId, conversationId, text, provider, topic }) {
  if (!text?.trim()) {
    return null;
  }

  return MemoryEntry.create({
    userId,
    conversationId,
    sourceMessage: text,
    normalizedText: text.toLowerCase(),
    embedding: createEmbedding(text),
    metadata: { provider, topic }
  });
}

export async function recoverRelevantMemories({ userId, query, limit = 4 }) {
  const queryEmbedding = createEmbedding(query);
  const entries = await MemoryEntry.find({ userId }).sort({ updatedAt: -1 }).limit(40).lean();

  return entries
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding || [])
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .filter((entry) => entry.score > 0.2);
}

export async function listConversations(userId) {
  return Conversation.find({ userId }).sort({ lastMessageAt: -1 }).lean();
}

export async function getConversationMessages(userId, conversationId) {
  return Conversation.findOne({ _id: conversationId, userId }).lean();
}
