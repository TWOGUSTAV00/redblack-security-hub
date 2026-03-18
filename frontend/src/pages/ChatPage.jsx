import { useEffect } from 'react';
import AuthCard from '../components/AuthCard.jsx';
import TopBar from '../components/TopBar.jsx';
import ConversationList from '../components/ConversationList.jsx';
import ChatWindow from '../components/ChatWindow.jsx';
import MessageComposer from '../components/MessageComposer.jsx';
import { useChat } from '../hooks/useChat.js';
import { useAuth } from '../hooks/useAuth.js';

export default function ChatPage() {
  const auth = useAuth();
  const {
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
  } = useChat({ user: auth.user, token: auth.token });

  useEffect(() => {
    if (auth.user && auth.token) {
      refreshConversations();
    }
  }, [auth.user, auth.token]);

  if (auth.loading) {
    return <main className="auth-shell"><section className="auth-card"><h1>Carregando sessao...</h1></section></main>;
  }

  if (!auth.user || !auth.token) {
    return (
      <AuthCard
        loading={auth.loading}
        error={auth.error}
        onLogin={(payload) => auth.login(payload).catch((error) => auth.setError(error.message))}
        onRegister={(payload) => auth.register(payload).catch((error) => auth.setError(error.message))}
      />
    );
  }

  return (
    <main className="app-shell">
      <TopBar provider={provider} userName={auth.user.name} onLogout={auth.logout} />

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
