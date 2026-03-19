export function uniqueIds(ids = []) {
  return [...new Set(ids.map((item) => String(item)))];
}

export function sortPair(a, b) {
  return [String(a), String(b)].sort();
}
