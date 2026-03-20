import { apiFetch } from './api.js';

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export function listContacts(token, search = '') {
  const query = search ? `?q=${encodeURIComponent(search)}` : '';
  return apiFetch(`/realtime-chat/contacts${query}`, {
    headers: authHeaders(token)
  });
}

export function listConversations(token) {
  return apiFetch('/realtime-chat/conversations', {
    headers: authHeaders(token)
  });
}

export function createDirectConversation(token, participantId, participantUsername = '') {
  return apiFetch('/realtime-chat/conversations/direct', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ participantId, participantUsername })
  });
}

export function getConversationMessages(token, conversationId, params = {}) {
  const search = new URLSearchParams();
  if (params.limit) search.set('limit', String(params.limit));
  if (params.before) search.set('before', params.before);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return apiFetch(`/realtime-chat/conversations/${conversationId}/messages${suffix}`, {
    headers: authHeaders(token)
  });
}

export function markConversationRead(token, conversationId) {
  return apiFetch(`/realtime-chat/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: authHeaders(token)
  });
}
