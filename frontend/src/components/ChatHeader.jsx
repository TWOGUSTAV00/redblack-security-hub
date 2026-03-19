import UserAvatar from './UserAvatar.jsx';

function formatHeaderStatus(conversation, typingNames, onlineUserIds) {
  if (typingNames.length) {
    return `${typingNames.join(', ')} digitando...`;
  }
  if (conversation?.counterpart && onlineUserIds.includes(conversation.counterpart.id)) {
    return 'online';
  }
  return 'offline';
}

export default function ChatHeader({ conversation, typingNames, onlineUserIds, onOpenSidebar }) {
  if (!conversation) {
    return (
      <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#202c33] px-4">
        <button onClick={onOpenSidebar} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-white md:hidden">Conversas</button>
        <p className="text-sm text-slate-400">Selecione uma conversa</p>
      </header>
    );
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-white/5 bg-[#202c33] px-4">
      <div className="flex items-center gap-3">
        <button onClick={onOpenSidebar} className="rounded-full bg-white/5 px-3 py-1.5 text-sm text-white md:hidden">Voltar</button>
        <UserAvatar
          name={conversation.title}
          avatarUrl={conversation.avatarUrl || conversation.counterpart?.avatarUrl}
          online={conversation.counterpart ? onlineUserIds.includes(conversation.counterpart.id) : false}
          className="h-10 w-10"
        />
        <div>
          <p className="font-medium text-white">{conversation.title}</p>
          <p className="text-xs text-slate-400">{formatHeaderStatus(conversation, typingNames, onlineUserIds)}</p>
        </div>
      </div>
    </header>
  );
}
