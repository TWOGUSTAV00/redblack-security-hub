import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import AuthCard from '../components/AuthCard.jsx';
import ChatSidebar from '../components/ChatSidebar.jsx';
import ChatHeader from '../components/ChatHeader.jsx';
import ChatThread from '../components/ChatThread.jsx';
import MessageComposer from '../components/MessageComposer.jsx';
import EmptyChatState from '../components/EmptyChatState.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useRealtimeChat } from '../hooks/useRealtimeChat.js';

function CallOverlay({ incomingCall, activeCall, onAccept, onReject, onEndCall, localStreamRef, remoteStreamRef }) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
  }, [activeCall?.callId, incomingCall?.callId, localStreamRef.current, remoteStreamRef.current]);

  if (!incomingCall && !activeCall) return null;

  const call = incomingCall || activeCall;
  const isIncoming = Boolean(incomingCall);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[32px] border border-white/10 bg-[#111b21] p-6 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.24em] text-emerald-400">Chamada</p>
        <h3 className="mt-3 text-2xl font-semibold text-white">{isIncoming ? `${call.callerName} está ligando` : 'Chamada em andamento'}</h3>
        <p className="mt-2 text-sm text-slate-400">{call.callType === 'video' ? 'Videochamada' : 'Chamada de voz'}</p>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div className="overflow-hidden rounded-3xl bg-[#0b141a]">
            {call.callType === 'video' ? <video ref={localVideoRef} autoPlay playsInline muted className="h-56 w-full object-cover" /> : <div className="flex h-56 items-center justify-center text-slate-400">Seu audio ativo</div>}
          </div>
          <div className="overflow-hidden rounded-3xl bg-[#0b141a]">
            {call.callType === 'video' ? <video ref={remoteVideoRef} autoPlay playsInline className="h-56 w-full object-cover" /> : <div className="flex h-56 items-center justify-center text-slate-400">Aguardando audio remoto</div>}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {isIncoming ? (
            <>
              <button onClick={onReject} className="rounded-full bg-rose-500 px-5 py-2 text-sm font-medium text-white">Recusar</button>
              <button onClick={onAccept} className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-[#081318]">Aceitar</button>
            </>
          ) : (
            <button onClick={onEndCall} className="rounded-full bg-rose-500 px-5 py-2 text-sm font-medium text-white">Encerrar</button>
          )}
        </div>
      </div>
    </div>
  );
}

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
      <div className="mx-auto flex h-screen max-w-[1900px] overflow-hidden md:p-4">
        <div className="relative flex h-full w-full overflow-hidden rounded-none border border-white/5 bg-[#111b21] shadow-2xl md:rounded-[30px]">
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
              onStartCall={chat.startCall}
              onEndCall={chat.endCall}
              activeCall={chat.activeCall}
            />

            {chat.error ? (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mx-3 mt-3 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 md:mx-4">
                {chat.error}
              </motion.div>
            ) : null}

            {chat.activeConversation ? (
              <>
                <ChatThread
                  messages={chat.messages}
                  currentUserId={auth.user.id}
                  onDeleteForMe={chat.deleteForMe}
                  onDeleteForEveryone={chat.deleteForEveryone}
                />
                {chat.typingNames.length > 0 ? (
                  <div className="px-4 pb-2 text-xs text-emerald-300 md:px-8">{chat.typingNames.join(', ')} digitando...</div>
                ) : null}
                <MessageComposer
                  draft={chat.draft}
                  onDraftChange={chat.handleDraftChange}
                  onSend={chat.sendMessage}
                  attachments={chat.attachments}
                  onFilesSelected={chat.onFilesSelected}
                  onRemoveAttachment={chat.onRemoveAttachment}
                  onAudioRecorded={chat.onAudioRecorded}
                />
              </>
            ) : (
              <EmptyChatState />
            )}
          </section>

          <CallOverlay
            incomingCall={chat.incomingCall}
            activeCall={chat.activeCall}
            onAccept={chat.acceptCall}
            onReject={chat.rejectCall}
            onEndCall={chat.endCall}
            localStreamRef={chat.localStreamRef}
            remoteStreamRef={chat.remoteStreamRef}
          />
        </div>
      </div>
    </div>
  );
}
