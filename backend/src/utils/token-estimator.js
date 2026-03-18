export function estimateTokens(text = '') {
  return Math.ceil(text.length / 4);
}

export function trimToChars(text = '', maxChars = 12000) {
  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(text.length - maxChars);
}
