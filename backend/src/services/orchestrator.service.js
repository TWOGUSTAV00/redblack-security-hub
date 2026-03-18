import { queryGemini } from '../ai/gemini.service.js';
import { queryDeepSeek } from '../ai/deepseek.service.js';
import { queryFallback } from '../ai/fallback.service.js';
import { classifyIntent } from '../router/intent-classifier.service.js';
import { chooseProvider } from '../router/provider-router.service.js';
import { buildRagContext } from '../rag/brave-search.service.js';
import { buildPrompt } from './prompt-builder.service.js';
import { normalizeImagePayload } from './multimodal.service.js';
import { appendMessage, getOrCreateConversation, recoverRelevantMemories, saveMemoryEntry } from '../memory/memory.service.js';
import { debounceKey } from '../utils/time.js';
import { readCache, writeCache } from './cache.service.js';
import { logger } from '../utils/logger.js';

async function callProvider(provider, payload) {
  if (provider === 'gemini') {
    return queryGemini(payload);
  }
  if (provider === 'deepseek') {
    return queryDeepSeek(payload);
  }
  return queryFallback(payload);
}

export async function executeChatFlow({ userId, conversationId, message, image, userProfile = {} }) {
  const conversation = await getOrCreateConversation(userId, conversationId);
  const recentHistory = conversation.messages.slice(-8);
  const multimodal = normalizeImagePayload(image);
  const intent = classifyIntent({ message, hasImage: multimodal.hasImage });
  const memories = await recoverRelevantMemories({ userId, query: message });
  const ragContext = intent.needsWeb ? await buildRagContext(message) : [];
  const prompt = buildPrompt({
    userProfile,
    intent,
    message,
    history: recentHistory,
    memories,
    ragContext
  });

  const userMessage = {
    role: 'user',
    content: message,
    provider: 'nemo',
    attachments: multimodal.hasImage ? [{ kind: 'image', mimeType: multimodal.mimeType, url: multimodal.imageUrl || 'inline', name: 'upload' }] : []
  };
  await appendMessage(conversation, userMessage);

  const cacheKey = debounceKey([userId, intent.type, message, multimodal.imageBase64 ? 'image' : 'text']);
  if (!multimodal.hasImage) {
    const cached = await readCache(cacheKey);
    if (cached) {
      await appendMessage(conversation, {
        role: 'assistant',
        content: cached.answer,
        provider: cached.provider,
        attachments: []
      });
      return { ...cached, cached: true, conversationId: conversation.id };
    }
  }

  const providers = chooseProvider(intent);
  let answer = null;
  const failures = [];

  for (const provider of providers) {
    try {
      answer = await callProvider(provider, {
        prompt,
        imageBase64: multimodal.imageBase64,
        mimeType: multimodal.mimeType
      });
      if (answer?.text) {
        break;
      }
    } catch (error) {
      failures.push({ provider, message: error.message });
      logger.warn({ provider, error: error.message }, 'Provider falhou, tentando fallback');
    }
  }

  answer ??= await queryFallback({ prompt });

  const assistantMessage = {
    role: 'assistant',
    content: answer.text,
    provider: answer.provider,
    attachments: []
  };

  await appendMessage(conversation, assistantMessage);
  await Promise.all([
    saveMemoryEntry({ userId, conversationId: conversation.id, text: message, provider: 'user', topic: intent.type }),
    saveMemoryEntry({ userId, conversationId: conversation.id, text: answer.text, provider: answer.provider, topic: intent.type })
  ]);

  const payload = {
    success: true,
    conversationId: conversation.id,
    answer: answer.text,
    provider: answer.provider,
    intent,
    ragContext,
    failures,
    cached: false
  };

  if (!multimodal.hasImage) {
    await writeCache(cacheKey, payload);
  }

  return payload;
}
