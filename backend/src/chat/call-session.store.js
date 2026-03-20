const callSessions = new Map();

export function setCallSession(callId, payload) {
  callSessions.set(callId, payload);
}

export function getCallSession(callId) {
  return callSessions.get(callId) || null;
}

export function removeCallSession(callId) {
  callSessions.delete(callId);
}
