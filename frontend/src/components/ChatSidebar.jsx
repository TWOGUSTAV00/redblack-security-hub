import { motion } from 'framer-motion';
import clsx from 'clsx';
import UserAvatar from './UserAvatar.jsx';

function formatSidebarTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function getEntityId(entity) {
  if (!entity) return '';
  return String(entity._id || entity.id || '');
}

export default function ChatSidebar({
  currentUser,
  conversations,
  contacts,
  activeConversationId,
  search,
  onSearch,
  onOpenConversation,
  onStartConversation,
  onlineUserIds,
  mobileOpen,
  onCloseMobile,
  onLogout
}) {
  return (
    <aside className={clsx(
      'fixed inset-y-0 left-0 z-30 w-full max-w-sm flex-col border-r border-white/5 bg-[#111b21] md:static md:flex md:w-[380px]',
      mobileOpen ? 'flex' : 'hidden'
    )}>
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <UserAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} className="h-10 w-10" />
          <div>
            <p className="font-medium text-white">{currentUser.name}</p>
            <p className="text-xs text-slate-400">@{currentUser.username}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300 md:hidden" onClick={onCloseMobile}>Fechar</button>
          <button className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-slate-300" onClick={onLogout}>Sair</button>
        </div>
      </div>

      <div className="p-3">
        <div className="flex items-center gap-2 rounded-2xl bg-[#202c33] px-3 py-2">
          <span className="text-slate-500">?</span>
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Pesquisar ou iniciar conversa"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {contacts.length > 0 && (
          <div className="border-b border-white/5 px-2 pb-2">
            <p className="px-3 py-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">Contatos</p>
            {contacts.map((contact) => {
              const contactId = getEntityId(contact);
              if (!contactId) return null;
              return (
              <button
                key={contactId}
                onClick={() => onStartConversation({ ...contact, id: contactId, _id: contactId })}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/5"
              >
                <UserAvatar name={contact.name} avatarUrl={contact.avatarUrl} online={onlineUserIds.includes(contactId)} className="h-11 w-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{contact.name}</p>
                  <p className="truncate text-xs text-slate-400">@{contact.username}</p>
                </div>
              </button>
            )})}
          </div>
        )}

        <div className="px-2 pb-4">
          {conversations.map((conversation) => (
            <motion.button
              layout
              key={conversation.id}
              onClick={() => onOpenConversation(conversation)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition',
                activeConversationId === conversation.id ? 'bg-[#202c33]' : 'hover:bg-white/5'
              )}
            >
              <UserAvatar
                name={conversation.title}
                avatarUrl={conversation.avatarUrl || conversation.counterpart?.avatarUrl}
                online={conversation.counterpart ? onlineUserIds.includes(conversation.counterpart.id) : false}
                className="h-12 w-12"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium text-white">{conversation.title}</p>
                  <span className="shrink-0 text-[11px] text-slate-500">{formatSidebarTime(conversation.lastMessageAt)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="truncate text-xs text-slate-400">{conversation.lastMessageText || 'Sem mensagens ainda'}</p>
                  {conversation.unreadCount > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-[#081318]">
                      {conversation.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </aside>
  );
}
