const onlineUsers = new Map();

function listUserSockets(userId) {
  return onlineUsers.get(String(userId)) || new Set();
}

export function addOnlineSocket(userId, socketId) {
  const key = String(userId);
  const current = onlineUsers.get(key) || new Set();
  current.add(socketId);
  onlineUsers.set(key, current);
}

export function removeOnlineSocket(userId, socketId) {
  const key = String(userId);
  const current = onlineUsers.get(key);
  if (!current) return;
  current.delete(socketId);
  if (current.size === 0) {
    onlineUsers.delete(key);
    return;
  }
  onlineUsers.set(key, current);
}

export function isUserOnline(userId) {
  return listUserSockets(userId).size > 0;
}

export function getOnlineUserIds() {
  return [...onlineUsers.keys()];
}
