export function normalizeImagePayload(file) {
  if (!file) {
    return { hasImage: false, mimeType: null, imageBase64: null, imageUrl: null };
  }

  return {
    hasImage: true,
    mimeType: file.mimeType || 'image/png',
    imageBase64: file.base64 || null,
    imageUrl: file.url || null
  };
}
