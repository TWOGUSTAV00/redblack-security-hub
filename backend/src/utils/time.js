export function debounceKey(parts = []) {
  return parts.filter(Boolean).join(':').toLowerCase();
}
