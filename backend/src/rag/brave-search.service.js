import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

function stripHtml(html = '') {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchBrave(query) {
  if (!env.BRAVE_SEARCH_API_KEY) {
    return [];
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.DEFAULT_TIMEOUT_MS);

  try {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(env.BRAVE_SEARCH_COUNT));
    url.searchParams.set('country', 'BR');
    url.searchParams.set('search_lang', 'pt-br');

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new AppError(`Brave Search falhou com status ${response.status}`, response.status);
    }

    const data = await response.json();
    const results = data?.web?.results || [];

    return results.map((item) => ({
      title: item.title,
      url: item.url,
      snippet: [item.description, ...(item.extra_snippets || [])].filter(Boolean).join(' ')
    }));
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchWebDocument(url) {
  if (!env.ENABLE_WEB_FETCH) {
    return '';
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(env.DEFAULT_TIMEOUT_MS, 10000));

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'NemoIA/1.0' } });
    if (!response.ok) {
      return '';
    }

    const html = await response.text();
    return stripHtml(html).slice(0, 3000);
  } catch {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

export async function buildRagContext(query) {
  const results = await searchBrave(query);
  const enriched = [];

  for (const result of results.slice(0, 3)) {
    const body = await fetchWebDocument(result.url);
    enriched.push({ ...result, body });
  }

  return enriched;
}
