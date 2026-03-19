import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import AuthCard from '../components/AuthCard.jsx';
import ChatSidebar from '../components/ChatSidebar.jsx';
import ChatHeader from '../components/ChatHeader.jsx';
import ChatThread from '../components/ChatThread.jsx';
import MessageComposer from '../components/MessageComposer.jsx';
import EmptyChatState from '../components/EmptyChatState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useRealtimeChat } from '../hooks/useRealtimeChat.js';

export default function ChatPage() {
  const auth = useAuth();
  const chat = useRealtimeChat({ token: auth.token, user: auth.user });

  useEffect(() => {
    if (auth.user && auth.token) {
      chat.refreshSidebar().catch((error) => chat.setError(error.message));
    }
  }, [auth.user?.id, auth.token]);

  if (auth.loading && !auth.user) {
    return <main className="flex min-h-screen items-center justify-center text-slate-400">Carregando sessao...</main>;
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
    <div className="min-h-screen bg-[#0b141a] text-white">
      <div className="mx-auto flex h-screen max-w-[1800px] overflow-hidden md:p-4">
        <div className="relative flex h-full w-full overflow-hidden rounded-none border border-white/5 bg-[#111b21] shadow-2xl md:rounded-[28px]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,211,102,0.06),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(0,168,132,0.08),transparent_22%)]" />
          <ChatSidebar
            currentUser={auth.user}
            conversations={chat.conversations}
            contacts={chat.contacts}
            activeConversationId={chat.activeConversation?.id}
            search={chat.search}
            onSearch={chat.setSearch}
            onOpenConversation={chat.openConversation}
            onStartConversation={chat.startConversation}
            onlineUserIds={chat.onlineUserIds}
            mobileOpen={chat.mobileSidebarOpen}
            onCloseMobile={() => chat.setMobileSidebarOpen(false)}
            onLogout={auth.logout}
          />

          <section className="relative z-10 flex min-w-0 flex-1 flex-col bg-[#0b141a]">
            <ChatHeader
              conversation={chat.activeConversation}
              typingNames={chat.typingNames}
              onlineUserIds={chat.onlineUserIds}
              onOpenSidebar={() => chat.setMobileSidebarOpen(true)}
            />

            {chat.error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-3 mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 md:mx-4">
                {chat.error}
              </motion.div>
            )}

            {chat.activeConversation ? (
              <>
                <ChatThread
                  messages={chat.messages}
                  currentUserId={auth.user.id}
                  hasMore={chat.hasMoreMessages}
                  loadingMessages={chat.loadingMessages}
                  onLoadOlder={chat.loadOlderMessages}
                />
                {chat.typingNames.length > 0 && (
                  <div className="px-4 pb-2 text-xs text-emerald-300 md:px-8">{chat.typingNames.join(', ')} digitando...</div>
                )}
                <MessageComposer
                  draft={chat.draft}
                  onDraftChange={chat.handleDraftChange}
                  onSend={chat.sendMessage}
                  onFiles={chat.handleFiles}
                  onAudioRecorded={chat.handleAudioRecorded}
                  attachments={chat.attachments}
                  onRemoveAttachment={chat.removeAttachment}
                />
              </>
            ) : (
              <EmptyChatState />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
