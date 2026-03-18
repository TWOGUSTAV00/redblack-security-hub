import { useMemo, useState } from 'react';
import { getConversation, listConversations } from '../services/conversation.js';
import { streamMessage } from '../services/chat.js';

const demoUser = {
  id: 'nemo-demo-user',
  name: 'Gustavo',
  plan: 'pro'
};

export function useChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [provider, setProvider] = useState('nemo');
  const [error, setError] = useState('');

  async function refreshConversations() {
    const data = await listConversations(demoUser.id);
    setConversations(data.conversations || []);
  }

  async function openConversation(conversationId) {
    setActiveConversationId(conversationId);
    const data = await getConversation(demoUser.id, conversationId);
    setMessages(data.conversation?.messages || []);
  }

  async function onSend() {
    if (!input.trim() && !selectedImage) return;

    setError('');
    setIsLoading(true);
    setTyping(true);

    const optimisticMessage = {
      role: 'user',
      content: input,
      attachments: selectedImage ? [{ kind: 'image', url: selectedImage.preview, name: selectedImage.file.name }] : []
    };

    setMessages((current) => [...current, optimisticMessage, { role: 'assistant', content: '', provider: 'nemo', streaming: true }]);

    const payload = {
      userId: demoUser.id,
      conversationId: activeConversationId,
      message: input,
      userProfile: demoUser,
      image: selectedImage ? {
        base64: selectedImage.base64,
        mimeType: selectedImage.file.type,
        url: selectedImage.preview
      } : null
    };

    setInput('');
    setSelectedImage(null);

    streamMessage(payload, {
      meta(meta) {
        setProvider(meta.provider || 'nemo');
        if (meta.conversationId) {
          setActiveConversationId(meta.conversationId);
        }
      },
      chunk(chunk) {
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: `${last.content || ''}${chunk.text}` };
          return next;
        });
      },
      done(done) {
        setMessages((current) => {
          const next = [...current];
          next[next.length - 1] = {
            role: 'assistant',
            content: done.answer,
            provider: done.provider,
            streaming: false
          };
          return next;
        });
        setTyping(false);
        setIsLoading(false);
        refreshConversations();
      },
      error(streamError) {
        setTyping(false);
        setIsLoading(false);
        setError(streamError.message || 'Falha ao enviar mensagem');
      }
    });
  }

  function onPickImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        const next = {
          file,
          base64,
          preview: URL.createObjectURL(file)
        };
        setSelectedImage(next);
        resolve(next);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const activeConversation = useMemo(
    () => conversations.find((item) => item._id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  return {
    demoUser,
    conversations,
    activeConversation,
    messages,
    input,
    selectedImage,
    isLoading,
    typing,
    provider,
    error,
    setInput,
    setSelectedImage,
    refreshConversations,
    openConversation,
    onSend,
    onPickImage
  };
}
