import { useEffect, useMemo, useRef, useState } from 'react';
import { createDirectConversation, getConversationMessages, listContacts, listConversations, markConversationRead } from '../services/realtime-chat.js';
import { createChatSocket } from '../services/socket.js';

const PAGE_SIZE = 30;

function getEntityId(entity) {
  if (!entity) return '';
  return String(entity.id || entity._id || '');
}

function normalizeChatEntity(entity) {
  if (!entity) return null;
  const normalizedId = String(entity.id || entity._id || '');
  const normalizedUsername = String(entity.username || '').trim().toLowerCase();
  if (!normalizedId && !normalizedUsername) return null;
  return {
    ...entity,
    id: normalizedId,
    _id: String(entity._id || normalizedId),
    username: normalizedUsername
  };
}

function attachmentsSignature(attachments = []) {
  return attachments.map((attachment) => `${attachment.kind}:${attachment.name}:${attachment.url}`).join('|');
}

function isSameMessagePayload(left, right) {
  return left?.senderId === right?.senderId
    && (left?.text || '') === (right?.text || '')
    && attachmentsSignature(left?.attachments) === attachmentsSignature(right?.attachments);
}

function mergeConversationList(current, nextConversation) {
  const existingIndex = current.findIndex((item) => item.id === nextConversation.id);
  if (existingIndex === -1) {
    return [nextConversation, ...current].sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
  }
  const next = [...current];
  next[existingIndex] = { ...next[existingIndex], ...nextConversation };
  return next.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
}

export function useRealtimeChat({ token, user }) {
  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [error, setError] = useState('');
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  async function refreshSidebar(searchTerm = search) {
    if (!token) return;
    const [conversationData, contactData] = await Promise.all([
      listConversations(token),
      listContacts(token, searchTerm)
    ]);
    console.log('CONTACTS API:', contactData.contacts || []);
    setConversations(conversationData.conversations || []);
    const currentUserId = String(user?.id || user?._id || '');
    setContacts(
      (contactData.contacts || [])
        .map((contact) => normalizeChatEntity(contact))
        .filter(Boolean)
        .filter((contact) => String(contact.id || contact._id || '') !== currentUserId && contact.username !== user?.username)
    );
  }

  async function openConversation(conversation, { preserveSidebar = false } = {}) {
    const conversationId = getEntityId(conversation);
    if (!token || !conversationId) {
      setError('Conversa invalida. ID nao encontrado.');
      return;
    }
    setError('');
    setActiveConversation(conversation);
    setSelectedContact(conversation.counterpart || null);
    setLoadingMessages(true);
    try {
      const data = await getConversationMessages(token, conversationId, { limit: PAGE_SIZE });
      setMessages(data.messages || []);
      setHasMoreMessages(Boolean(data.hasMore));
      await markConversationRead(token, conversationId).catch(() => null);
      socketRef.current?.emit('chat:conversation:join', { conversationId });
      if (!preserveSidebar) {
        setMobileSidebarOpen(false);
      }
    } catch (error) {
      setMessages([]);
      setHasMoreMessages(false);
      setError(error.message || 'Nao foi possivel abrir a conversa.');
    } finally {
      setLoadingMessages(false);
    }
  }

  async function startConversation(contact) {
    const normalizedContact = normalizeChatEntity(contact);
    console.log('Contato clicado:', contact);
    console.log('ID normalizado:', normalizedContact?.id, normalizedContact?._id);
    if (!normalizedContact || !normalizedContact.id) {
      console.error('Usuario invalido:', contact);
      setError('Contato invalido. ID nao encontrado.');
      return;
    }
    const participantId = normalizedContact.id;
    setError('');
    setSelectedContact(normalizedContact);
    try {
      const data = await createDirectConversation(token, participantId, normalizedContact.username || '');
      const conversation = {
        ...data.conversation,
        id: getEntityId(data.conversation) || data.conversation?.id || '',
        _id: getEntityId(data.conversation),
        counterpart: normalizeChatEntity(data.conversation?.counterpart) || normalizedContact,
        lastMessageText: data.conversation?.lastMessageText || '',
        lastMessageAt: data.conversation?.lastMessageAt || new Date().toISOString(),
        unreadCount: Number(data.conversation?.unreadCount || 0)
      };
      if (!conversation.id) {
        throw new Error('Conversa criada sem ID valido.');
      }
      setConversations((current) => mergeConversationList(current, conversation));
      await openConversation(conversation);
    } catch (error) {
      setError(error.message || 'Nao foi possivel iniciar a conversa com esse usuario.');
    }
  }

  async function loadOlderMessages() {
    const conversationId = getEntityId(activeConversation);
    if (!token || !conversationId || !messages.length || loadingMessages) return;
    setLoadingMessages(true);
    const oldest = messages[0];
    const data = await getConversationMessages(token, conversationId, {
      limit: PAGE_SIZE,
      before: oldest.createdAt
    });
    setMessages((current) => [...(data.messages || []), ...current]);
    setHasMoreMessages(Boolean(data.hasMore));
    setLoadingMessages(false);
  }

  useEffect(() => {
    if (!token) return undefined;
    const socket = createChatSocket(token);
    socketRef.current = socket;

    socket.on('presence:snapshot', ({ onlineUserIds: ids }) => setOnlineUserIds(ids || []));
    socket.on('presence:update', ({ onlineUserIds: ids }) => setOnlineUserIds(ids || []));
    socket.on('chat:typing', ({ conversationId, userId, name, isTyping }) => {
      if (conversationId !== activeConversation?.id || userId === user?.id) return;
      setTypingUsers((current) => {
        const next = { ...current };
        if (isTyping) next[userId] = name;
        else delete next[userId];
        return next;
      });
    });
    socket.on('chat:conversation:update', () => {
      refreshSidebar().catch(() => null);
    });
    socket.on('chat:conversation:read', ({ conversationId }) => {
      setConversations((current) => current.map((conversation) => conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation));
    });
    socket.on('chat:message:new', ({ conversation, message }) => {
      setConversations((current) => mergeConversationList(current, {
        ...conversation,
        unreadCount: conversation.id === activeConversation?.id ? 0 : 1
      }));
      if (conversation.id === activeConversation?.id) {
        setMessages((current) => {
          const exact = current.find((item) => item.id === message.id);
          if (exact) return current;
          const optimisticIndex = current.findIndex((item) => item.optimistic && isSameMessagePayload(item, message));
          if (optimisticIndex >= 0) {
            const next = [...current];
            next[optimisticIndex] = message;
            return next;
          }
          return [...current, message];
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id, activeConversation?.id]);

  useEffect(() => {
    if (!token) return;
    const timeoutId = setTimeout(() => {
      refreshSidebar(search).catch((error) => setError(error.message));
    }, 180);
    return () => clearTimeout(timeoutId);
  }, [token, search]);

  function handleDraftChange(value) {
    setDraft(value);
    const conversationId = getEntityId(activeConversation);
    if (!conversationId || !socketRef.current) return;
    socketRef.current.emit('chat:typing', { conversationId, isTyping: true });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('chat:typing', { conversationId, isTyping: false });
    }, 900);
  }

  function handleFiles(fileList) {
    const files = [...(fileList || [])].slice(0, 4);
    Promise.all(files.map((file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          id: `${file.name}-${file.size}-${Date.now()}`,
          kind: file.type.startsWith('image/') ? 'image' : 'file',
          name: file.name,
          mimeType: file.type,
          size: file.size,
          url: String(reader.result || '')
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }))).then((next) => setAttachments((current) => [...current, ...next]));
  }

  function removeAttachment(id) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function handleAudioRecorded(audioAttachment) {
    if (!audioAttachment) return;
    setAttachments((current) => [...current, audioAttachment]);
  }

  async function sendMessage() {
    if (!socketRef.current) return;
    if (!draft.trim() && !attachments.length) return;

    let recipientId = getEntityId(selectedContact) || getEntityId(activeConversation?.counterpart) || null;
    let conversationId = getEntityId(activeConversation) || null;

    if (!conversationId && !recipientId && contacts.length > 0 && search) {
      const exact = contacts.find((contact) => contact.name.toLowerCase() === search.toLowerCase() || contact.username.toLowerCase() === search.toLowerCase());
      if (exact) {
        recipientId = getEntityId(exact);
      }
    }

    if (!conversationId && !recipientId) {
      setError('Selecione uma conversa ou um contato para enviar mensagem.');
      return;
    }
    setError('');

    const payload = {
      conversationId,
      recipientId,
      text: draft.trim(),
      attachments: attachments.map(({ id, ...rest }) => rest)
    };

    const tempMessage = {
      id: `temp-${Date.now()}`,
      conversationId: conversationId || 'pending',
      senderId: user.id,
      sender: user,
      text: draft.trim(),
      attachments,
      createdAt: new Date().toISOString(),
      optimistic: true,
      readBy: [user.id]
    };
    setMessages((current) => [...current, tempMessage]);
    setDraft('');
    setAttachments([]);
    socketRef.current.emit('chat:typing', { conversationId: conversationId || activeConversation?.id, isTyping: false });

    socketRef.current.emit('chat:message:send', payload, async (response) => {
      if (!response?.ok) {
        setError(response?.message || 'Falha ao enviar mensagem');
        setMessages((current) => current.filter((message) => message.id !== tempMessage.id));
        return;
      }

      const normalizedConversation = {
        ...response.conversation,
        counterpart: selectedContact || activeConversation?.counterpart || null,
        unreadCount: 0
      };
      setConversations((current) => mergeConversationList(current, normalizedConversation));
      setActiveConversation((current) => current?.id === normalizedConversation.id ? { ...current, ...normalizedConversation } : normalizedConversation);
      setMessages((current) => current.map((message) => message.id === tempMessage.id ? response.message : message));
      setMessages((current) => {
        const withoutTemp = current.filter((message) => message.id !== tempMessage.id);
        const exists = withoutTemp.find((message) => message.id === response.message.id);
        return exists ? withoutTemp : [...withoutTemp, response.message];
      });
      if (!conversationId) {
        socketRef.current?.emit('chat:conversation:join', { conversationId: normalizedConversation.id });
      }
    });
  }

  const filteredConversations = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return conversations;
    return conversations.filter((conversation) =>
      conversation.title?.toLowerCase().includes(normalizedSearch) ||
      conversation.lastMessageText?.toLowerCase().includes(normalizedSearch)
    );
  }, [conversations, search]);

  return {
    conversations: filteredConversations,
    contacts,
    activeConversation,
    messages,
    hasMoreMessages,
    loadingMessages,
    draft,
    attachments,
    search,
    error,
    mobileSidebarOpen,
    onlineUserIds,
    typingNames: Object.values(typingUsers),
    setSearch,
    setError,
    setMobileSidebarOpen,
    openConversation,
    startConversation,
    loadOlderMessages,
    handleDraftChange,
    handleFiles,
    removeAttachment,
    handleAudioRecorded,
    sendMessage,
    refreshSidebar
  };
}
