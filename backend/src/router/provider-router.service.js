export function chooseProvider(intent) {
  if (intent.type === 'image') {
    return ['gemini', 'deepseek', 'fallback'];
  }

  if (intent.type === 'code') {
    return ['deepseek', 'gemini', 'fallback'];
  }

  if (intent.type === 'web_search') {
    return ['gemini', 'deepseek', 'fallback'];
  }

  return ['gemini', 'deepseek', 'fallback'];
}
