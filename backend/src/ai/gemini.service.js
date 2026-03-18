import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export async function queryGemini({ prompt, imageBase64, mimeType = 'image/png' }) {
  if (!env.GEMINI_API_KEY) {
    throw new AppError('GEMINI_API_KEY nao configurada', 503);
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`;
  const parts = [{ text: prompt }];

  if (imageBase64) {
    parts.unshift({
      inline_data: {
        mime_type: mimeType,
        data: imageBase64
      }
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new AppError(`Gemini falhou com status ${response.status}`, response.status);
    }

    const data = await response.json();
    return {
      provider: 'gemini',
      text: data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim() || ''
    };
  } finally {
    clearTimeout(timeout);
  }
}
