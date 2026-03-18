import { env } from '../config/env.js';

const DIMENSION = 128;

export function createEmbedding(text = '') {
  const vector = new Array(DIMENSION).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ');

  for (const token of normalized.split(/\s+/).filter(Boolean)) {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = ((hash << 5) - hash) + token.charCodeAt(index);
      hash |= 0;
    }
    const bucket = Math.abs(hash) % DIMENSION;
    vector[bucket] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

export function cosineSimilarity(left = [], right = []) {
  if (!left.length || !right.length) {
    return 0;
  }

  let numerator = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    numerator += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (!leftMagnitude || !rightMagnitude) {
    return 0;
  }

  return numerator / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function embeddingMode() {
  return env.EMBEDDING_MODE;
}
