import clsx from 'clsx';
import UserAvatar from './UserAvatar.jsx';

function formatSidebarTime(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

export default function ChatSidebar({
  currentUser,
  conversations,
  contacts,
  search,
  onSearch,
  activeConversationId,
  onOpenConversation,
  onStartConversation,
  onlineUserIds,
  mobileOpen,
  onCloseMobile,
  onLogout
}) {
  return (
    <aside className={clsx(
      'fixed inset-y-0 left-0 z-30 w-full max-w-sm border-r border-white/5 bg-[#111b21] md:static md:flex md:w-[380px] md:flex-col',
      mobileOpen ? 'flex flex-col' : 'hidden'
    )}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <UserAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} className="h-11 w-11" />
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{currentUser.name}</p>
            <p className="truncate text-xs text-slate-400">{currentUser.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCloseMobile} className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300 md:hidden">Fechar</button>
          <button onClick={onLogout} className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300">Sair</button>
        </div>
      </div>

      <div className="p-3">
        <div className="rounded-2xl bg-[#202c33] px-3 py-2.5">
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Pesquisar por nome ou e-mail"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="border-b border-white/5 px-2 pb-2">
          <p className="px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">Conversas</p>
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onOpenConversation(conversation)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
                activeConversationId === conversation.id ? 'bg-[#202c33]' : 'hover:bg-white/5'
              )}
            >
              <UserAvatar
                name={conversation.title}
                avatarUrl={conversation.avatarUrl}
                online={conversation.counterpart ? onlineUserIds.includes(conversation.counterpart.id) : false}
                className="h-12 w-12"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
                  <span className="text-[11px] text-slate-500">{formatSidebarTime(conversation.lastMessageAt)}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-400">{conversation.lastMessagePreview || 'Sem mensagens ainda'}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-2 pb-4">
          <p className="px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">Contatos</p>
          {contacts.map((contact) => (
            <button
              key={contact.id}
              onClick={() => onStartConversation(contact)}
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
            >
              <UserAvatar name={contact.name} avatarUrl={contact.avatarUrl} online={onlineUserIds.includes(contact.id)} className="h-11 w-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{contact.name}</p>
                <p className="truncate text-xs text-slate-400">{contact.email}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
