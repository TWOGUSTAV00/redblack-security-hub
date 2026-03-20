import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createDirectConversation,
  deleteForEveryone,
  deleteForMe,
  getConversationMessages,
  listContacts,
  listConversations,
  uploadFiles
} from '../services/realtime-chat.js';
import { createChatSocket } from '../services/socket.js';
import { API_BASE_URL } from '../services/api.js';

const PAGE_SIZE = 40;

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: String(user.id || user._id || ''),
    _id: String(user._id || user.id || ''),
    name: user.name || 'Usuario',
    email: user.email || '',
    avatarUrl: user.avatarUrl || '',
    status: user.status || 'offline'
  };
}

function normalizeConversation(conversation) {
  if (!conversation) return null;
  const participants = (conversation.participants || []).map((item) => normalizeUser(item)).filter(Boolean);
  const counterpart = normalizeUser(conversation.counterpart) || participants[0] || null;
  return {
    id: String(conversation.id || conversation._id || ''),
    participants,
    counterpart,
    title: conversation.title || counterpart?.name || 'Nova conversa',
    avatarUrl: conversation.avatarUrl || counterpart?.avatarUrl || '',
    lastMessagePreview: conversation.lastMessagePreview || '',
    lastMessageAt: conversation.lastMessageAt || new Date().toISOString()
  };
}

function normalizeMessage(message) {
  if (!message) return null;
  const media = (message.media || []).map((item) => ({
    ...item,
    url: String(item.url || '').startsWith('http') ? item.url : `${API_BASE_URL.replace(/\/api$/, '')}${item.url}`
  }));
  return {
    id: String(message.id || message._id || ''),
    conversationId: String(message.conversationId || ''),
    senderId: String(message.senderId || ''),
    sender: normalizeUser(message.sender),
    text: message.text || '',
    media,
    deletedForEveryone: Boolean(message.deletedForEveryone),
    deletedFor: (message.deletedFor || []).map((item) => String(item)),
    createdAt: message.createdAt || new Date().toISOString(),
    readBy: (message.readBy || []).map((item) => String(item))
  };
}

function mergeConversations(current, nextConversation) {
  const safe = normalizeConversation(nextConversation);
  if (!safe?.id) return current;
  const existingIndex = current.findIndex((item) => item.id === safe.id);
  if (existingIndex === -1) {
    return [safe, ...current].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  }
  const copy = [...current];
  copy[existingIndex] = { ...copy[existingIndex], ...safe };
  return copy.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
}

export function useRealtimeChat({ token, user }) {
  const safeUser = normalizeUser(user);
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [error, setError] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [typingNames, setTypingNames] = useState([]);
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);

  async function refreshSidebar(searchTerm = search) {
    if (!token) return;
    const [conversationData, contactData] = await Promise.all([
      listConversations(token),
      listContacts(token, searchTerm)
    ]);
    setConversations((conversationData.conversations || []).map((item) => normalizeConversation(item)).filter(Boolean));
    setContacts(
      (contactData.contacts || [])
        .map((item) => normalizeUser(item))
        .filter(Boolean)
        .filter((item) => item.id !== safeUser?.id)
    );
  }

  async function openConversation(conversation) {
    const normalized = normalizeConversation(conversation);
    if (!token || !normalized?.id) {
      setError('Conversa invalida.');
      return;
    }
    setError('');
    setActiveConversation(normalized);
    setLoadingMessages(true);
    try {
      const data = await getConversationMessages(token, normalized.id, { limit: PAGE_SIZE });
      setMessages((data.messages || []).map((item) => normalizeMessage(item)).filter(Boolean));
      setHasMoreMessages(Boolean(data.hasMore));
      socketRef.current?.emit('conversation:join', { conversationId: normalized.id });
      setMobileSidebarOpen(false);
    } catch (err) {
      setError(err.message || 'Nao foi possivel abrir a conversa.');
    } finally {
      setLoadingMessages(false);
    }
  }

  async function startConversation(contact) {
    const normalized = normalizeUser(contact);
    if (!normalized?.id) {
      setError('Contato invalido.');
      return;
    }
    try {
      const data = await createDirectConversation(token, normalized.id, normalized.email);
      const conversation = normalizeConversation(data.conversation);
      setConversations((current) => mergeConversations(current, conversation));
      await openConversation(conversation);
    } catch (err) {
      setError(err.message || 'Nao foi possivel iniciar a conversa.');
    }
  }

  function onFilesSelected(fileList) {
    const files = [...(fileList || [])].slice(0, 8);
    const next = files.map((file) => ({
      localId: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      previewType: file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'file'
    }));
    setAttachments((current) => [...current, ...next]);
  }

  function onAudioRecorded(file) {
    onFilesSelected([file]);
  }

  function onRemoveAttachment(localId) {
    setAttachments((current) => {
      const found = current.find((item) => item.localId === localId);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return current.filter((item) => item.localId !== localId);
    });
  }

  async function uploadPendingFiles() {
    if (!attachments.length) return [];
    const data = await uploadFiles(token, attachments.map((item) => item.file));
    return data.files || [];
  }

  async function sendMessage() {
    if (!socketRef.current) return;
    const recipientId = activeConversation?.counterpart?.id || '';
    if (!activeConversation?.id || !recipientId) {
      setError('Selecione uma conversa antes de enviar mensagem.');
      return;
    }

    if (!draft.trim() && !attachments.length) {
      return;
    }

    try {
      setError('');
      const media = await uploadPendingFiles();
      const optimisticMessage = normalizeMessage({
        id: `temp-${Date.now()}`,
        conversationId: activeConversation.id,
        senderId: safeUser.id,
        sender: safeUser,
        text: draft.trim(),
        media,
        createdAt: new Date().toISOString()
      });

      setMessages((current) => [...current, optimisticMessage]);
      setDraft('');
      setAttachments((current) => {
        current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
        return [];
      });

      socketRef.current.emit('message:send', {
        conversationId: activeConversation.id,
        recipientId,
        text: optimisticMessage.text,
        media,
        createdAtClient: new Date().toISOString()
      }, (response) => {
        if (!response?.ok) {
          setError(response?.message || 'Falha ao enviar mensagem.');
          setMessages((current) => current.filter((item) => item.id !== optimisticMessage.id));
          return;
        }

        const normalizedConversation = normalizeConversation(response.conversation);
        const normalizedMessage = normalizeMessage(response.message);
        setConversations((current) => mergeConversations(current, normalizedConversation));
        setActiveConversation(normalizedConversation);
        setMessages((current) => current.map((item) => item.id === optimisticMessage.id ? normalizedMessage : item));
      });
    } catch (err) {
      setError(err.message || 'Falha ao enviar mensagem.');
    }
  }

  function deleteMessage(message, scope) {
    if (!socketRef.current || !message?.id) return;
    const eventName = scope === 'everyone' ? 'message:delete-for-everyone' : 'message:delete-for-me';
    socketRef.current.emit(eventName, { messageId: message.id }, (response) => {
      if (!response?.ok) {
        setError(response?.message || 'Falha ao apagar mensagem.');
        return;
      }
      if (scope === 'everyone') {
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deletedForEveryone: true, text: '', media: [] } : item));
      } else {
        setMessages((current) => current.filter((item) => item.id !== message.id));
      }
    });
  }

  async function startCall(callType) {
    if (!socketRef.current || !activeConversation?.counterpart?.id) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === 'video'
    });
    localStreamRef.current = stream;

    socketRef.current.emit('call:initiate', {
      recipientId: activeConversation.counterpart.id,
      conversationId: activeConversation.id,
      callType
    }, async (response) => {
      if (!response?.ok) {
        setError('Nao foi possivel iniciar a chamada.');
        return;
      }
      setActiveCall({ ...response, stream, mode: 'outgoing' });
      await createPeerConnection(response.callId, activeConversation.counterpart.id, stream, true);
    });
  }

  async function createPeerConnection(callId, targetUserId, localStream, isOfferer) {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    peerRef.current = peer;
    remoteStreamRef.current = new MediaStream();

    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    peer.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => remoteStreamRef.current.addTrack(track));
      setActiveCall((current) => current ? { ...current, remoteStream: remoteStreamRef.current } : current);
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit('webrtc:ice-candidate', { callId, targetUserId, candidate: event.candidate });
      }
    };

    if (isOfferer) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit('webrtc:offer', { callId, targetUserId, offer });
    }
  }

  function cleanupCall() {
    peerRef.current?.close?.();
    peerRef.current = null;
    localStreamRef.current?.getTracks?.().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setIncomingCall(null);
    setActiveCall(null);
  }

  async function acceptCall() {
    if (!incomingCall) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: incomingCall.callType === 'video'
    });
    localStreamRef.current = stream;
    setActiveCall({ ...incomingCall, stream, mode: 'incoming' });
    socketRef.current?.emit('call:accept', { callId: incomingCall.callId });
    await createPeerConnection(incomingCall.callId, incomingCall.callerId, stream, false);
    setIncomingCall(null);
  }

  function rejectCall() {
    if (!incomingCall) return;
    socketRef.current?.emit('call:reject', { callId: incomingCall.callId });
    setIncomingCall(null);
  }

  function endCall() {
    if (activeCall) {
      const targetUserId = activeCall.recipientId || activeCall.callerId;
      socketRef.current?.emit('call:end', { callId: activeCall.callId, targetUserId });
    }
    cleanupCall();
  }

  useEffect(() => {
    if (!token || !safeUser?.id) return undefined;
    const socket = createChatSocket(token);
    socketRef.current = socket;

    socket.on('presence:snapshot', ({ onlineUserIds: ids }) => setOnlineUserIds(ids || []));
    socket.on('presence:update', ({ onlineUserIds: ids }) => setOnlineUserIds(ids || []));
    socket.on('conversation:update', (conversation) => {
      setConversations((current) => mergeConversations(current, conversation));
    });
    socket.on('conversation:typing', ({ conversationId, userName, isTyping }) => {
      if (conversationId !== activeConversation?.id) return;
      setTypingNames(isTyping ? [userName] : []);
    });
    socket.on('message:new', ({ conversation, message }) => {
      const normalizedConversation = normalizeConversation(conversation);
      const normalizedMessage = normalizeMessage(message);
      setConversations((current) => mergeConversations(current, normalizedConversation));
      if (normalizedConversation?.id === activeConversation?.id) {
        setMessages((current) => {
          const existing = current.find((item) => item.id === normalizedMessage.id);
          return existing ? current : [...current, normalizedMessage];
        });
        if (document.hidden && normalizedMessage.senderId !== safeUser.id && Notification.permission === 'granted') {
          navigator.serviceWorker?.ready.then((registration) => {
            registration.showNotification(normalizedConversation.title, {
              body: normalizedMessage.text || normalizedConversation.lastMessagePreview || 'Nova mensagem'
            });
          }).catch(() => null);
        }
      }
    });
    socket.on('message:deleted-for-me', ({ messageId }) => {
      setMessages((current) => current.filter((item) => item.id !== messageId));
    });
    socket.on('message:deleted-for-everyone', ({ messageId }) => {
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, deletedForEveryone: true, text: '', media: [] } : item));
    });
    socket.on('call:incoming', (payload) => setIncomingCall(payload));
    socket.on('call:accepted', async ({ callId, byUserId }) => {
      const peer = peerRef.current;
      if (!peer || !activeCall || activeCall.callId !== callId) return;
      const offer = peer.localDescription;
      if (!offer) {
        const createdOffer = await peer.createOffer();
        await peer.setLocalDescription(createdOffer);
      }
      socket.emit('webrtc:offer', {
        callId,
        targetUserId: byUserId,
        offer: peer.localDescription
      });
    });
    socket.on('call:rejected', () => cleanupCall());
    socket.on('call:ended', () => cleanupCall());
    socket.on('webrtc:offer', async ({ callId, fromUserId, offer }) => {
      if (!peerRef.current && localStreamRef.current) {
        await createPeerConnection(callId, fromUserId, localStreamRef.current, false);
      }
      const peer = peerRef.current;
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('webrtc:answer', { callId, targetUserId: fromUserId, answer });
    });
    socket.on('webrtc:answer', async ({ answer }) => {
      const peer = peerRef.current;
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(answer));
    });
    socket.on('webrtc:ice-candidate', async ({ candidate }) => {
      const peer = peerRef.current;
      if (!peer || !candidate) return;
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    });

    return () => {
      socket.disconnect();
      cleanupCall();
    };
  }, [token, safeUser?.id, activeConversation?.id]);

  useEffect(() => {
    if (!token) return;
    const timeoutId = setTimeout(() => {
      refreshSidebar().catch((error) => setError(error.message));
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [token, search]);

  function handleDraftChange(value) {
    setDraft(value);
    if (!activeConversation?.id) return;
    socketRef.current?.emit('conversation:typing', { conversationId: activeConversation.id, isTyping: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('conversation:typing', { conversationId: activeConversation.id, isTyping: false });
    }, 900);
  }

  const filteredConversations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return conversations;
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(normalizedSearch) ||
      conversation.counterpart?.email?.toLowerCase().includes(normalizedSearch)
    );
  }, [conversations, search]);

  return {
    conversations: filteredConversations,
    contacts,
    activeConversation,
    messages,
    loadingMessages,
    hasMoreMessages,
    draft,
    attachments,
    search,
    error,
    mobileSidebarOpen,
    onlineUserIds,
    typingNames,
    incomingCall,
    activeCall,
    setSearch,
    setError,
    setMobileSidebarOpen,
    refreshSidebar,
    openConversation,
    startConversation,
    handleDraftChange,
    onFilesSelected,
    onAudioRecorded,
    onRemoveAttachment,
    sendMessage,
    deleteForMe: (message) => deleteMessage(message, 'me'),
    deleteForEveryone: (message) => deleteMessage(message, 'everyone'),
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    localStreamRef,
    remoteStreamRef
  };
}
