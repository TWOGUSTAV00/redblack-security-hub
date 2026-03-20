import { API_BASE_URL, apiFetch } from './api.js';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export function listContacts(token, search = '') {
  const query = search ? `?q=${encodeURIComponent(search)}` : '';
  return apiFetch(`/realtime-chat/contacts${query}`, { headers: authHeaders(token) });
}

export function addContact(token, contactId) {
  return apiFetch('/realtime-chat/contacts', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ contactId })
  });
}

export function listConversations(token) {
  return apiFetch('/realtime-chat/conversations', { headers: authHeaders(token) });
}

export function createDirectConversation(token, participantId, participantEmail = '') {
  return apiFetch('/realtime-chat/conversations/direct', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ participantId, participantEmail })
  });
}

export function getConversationMessages(token, conversationId, params = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.before) search.set('before', params.before);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiFetch(`/realtime-chat/conversations/${conversationId}/messages${suffix}`, { headers: authHeaders(token) });
}

export async function uploadFiles(token, files) {
  const formData = new FormData();
  [...files].forEach((file) => formData.append('files', file));

  const response = await fetch(`${API_BASE_URL}/realtime-chat/uploads`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Erro HTTP ${response.status}`);
  }

  return response.json();
}

export function deleteForMe(token, messageId) {
  return apiFetch(`/realtime-chat/messages/${messageId}/delete-for-me`, {
    method: 'POST',
    headers: authHeaders(token)
  });
}

export function deleteForEveryone(token, messageId) {
  return apiFetch(`/realtime-chat/messages/${messageId}/delete-for-everyone`, {
    method: 'POST',
    headers: authHeaders(token)
  });
}
