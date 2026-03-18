import { useEffect } from 'react';
import TopBar from '../components/TopBar.jsx';
import ConversationList from '../components/ConversationList.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import MessageComposer from '../components/MessageComposer.jsx';
import { useChat } from '../hooks/useChat.js';

export default function ChatPage() {
  const {
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
  } = useChat();

  useEffect(() => {
    refreshConversations();
  }, []);

  return (
    <main className="app-shell">
      <TopBar provider={provider} userName={demoUser.name} />

      <div className="workspace">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversation?._id}
          onSelect={openConversation}
          onRefresh={refreshConversations}
        />

        <section className="chat-panel">
          <ChatWindow title={activeConversation?.title} messages={messages} typing={typing} />
          {error && <div className="error-banner">{error}</div>}
          <MessageComposer
            value={input}
            onChange={setInput}
            onSend={onSend}
            onFile={onPickImage}
            image={selectedImage}
            onRemoveImage={() => setSelectedImage(null)}
            disabled={isLoading}
          />
        </section>
      </div>
    </main>
  );
}
