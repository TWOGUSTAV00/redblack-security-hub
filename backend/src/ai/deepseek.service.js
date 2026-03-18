import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export async function queryDeepSeek({ prompt }) {
  if (!env.DEEPSEEK_API_KEY) {
    throw new AppError('DEEPSEEK_API_KEY nao configurada', 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: 'Voce e o Nemo IA. Responda em portugues do Brasil com clareza, contexto e boa didatica.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new AppError(`DeepSeek falhou com status ${response.status}`, response.status);
    }

    const data = await response.json();
    return {
      provider: 'deepseek',
      text: data?.choices?.[0]?.message?.content?.trim() || ''
    };
  } finally {
    clearTimeout(timeout);
  }
}
