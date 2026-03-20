import UserAvatar from './UserAvatar.jsx';

export default function ChatHeader({ conversation, typingNames, onlineUserIds, onOpenSidebar, onStartCall, onEndCall, activeCall }) {
  if (!conversation) {
    return (
      <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#202c33] px-4">
        <button onClick={onOpenSidebar} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-white md:hidden">Conversas</button>
        <p className="text-sm text-slate-400">Selecione uma conversa</p>
      </header>
    );
  }

  const online = conversation.counterpart ? onlineUserIds.includes(conversation.counterpart.id) : false;
  const subtitle = typingNames.length ? `${typingNames.join(', ')} digitando...` : (online ? 'online' : 'offline');

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#202c33] px-4">
      <div className="flex items-center gap-3">
        <button onClick={onOpenSidebar} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-white md:hidden">Voltar</button>
        <UserAvatar name={conversation.title} avatarUrl={conversation.avatarUrl} online={online} className="h-10 w-10" />
        <div>
          <p className="font-medium text-white">{conversation.title}</p>
          <p className="text-xs text-slate-400">{subtitle}</p>
        </div>
      </div>

      {conversation.counterpart ? (
        <div className="flex items-center gap-2">
          {activeCall ? (
            <button onClick={onEndCall} className="rounded-full bg-rose-500 px-3 py-1.5 text-xs text-white">Encerrar</button>
          ) : (
            <>
              <button onClick={() => onStartCall('audio')} className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-200">Ligar</button>
              <button onClick={() => onStartCall('video')} className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-200">Video</button>
            </>
          )}
        </div>
      ) : null}
    </header>
  );
}
