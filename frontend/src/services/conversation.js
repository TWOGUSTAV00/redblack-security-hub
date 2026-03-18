import { apiFetch } from './api.js';

export async function listConversations(token) {
  return apiFetch('/conversations', {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function getConversation(conversationId, token) {
  return apiFetch(`/conversations/${conversationId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}
