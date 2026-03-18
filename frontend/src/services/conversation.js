import { apiFetch } from './api.js';

export async function listConversations(userId) {
  return apiFetch(`/conversations/${userId}`);
}

export async function getConversation(userId, conversationId) {
  return apiFetch(`/conversations/${userId}/${conversationId}`);
}
