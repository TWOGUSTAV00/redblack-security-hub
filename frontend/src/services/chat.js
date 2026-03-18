import { apiFetch, API_BASE_URL } from './api.js';

export async function sendMessage(payload, token) {
  return apiFetch('/chat/message', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(payload)
  });
}

export function streamMessage(payload, token, handlers) {
  const controller = new AbortController();

  fetch(`${API_BASE_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  }).then(async (response) => {
    if (!response.ok || !response.body) {
      throw new Error(`Falha no streaming (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n');
        const event = lines.find((line) => line.startsWith('event:'))?.replace('event:', '').trim();
        const data = lines.find((line) => line.startsWith('data:'))?.replace('data:', '').trim();
        if (!event || !data) continue;
        const parsed = JSON.parse(data);
        handlers?.[event]?.(parsed);
      }
    }
  }).catch((error) => handlers?.error?.(error));

  return () => controller.abort();
}
