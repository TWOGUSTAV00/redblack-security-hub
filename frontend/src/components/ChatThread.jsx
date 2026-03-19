import { useEffect, useMemo, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';

function shouldShowAvatar(messages, index) {
  if (index === 0) return true;
  return messages[index - 1].senderId !== messages[index].senderId;
}

export default function ChatThread({ messages, currentUserId, hasMore, loadingMessages, onLoadOlder }) {
  const containerRef = useRef(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const groupedMessages = useMemo(() => messages, [messages]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-[#0b141a] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_65%)] px-3 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
        {hasMore && (
          <button onClick={onLoadOlder} disabled={loadingMessages} className="mx-auto rounded-full bg-white/5 px-4 py-2 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50">
            {loadingMessages ? 'Carregando...' : 'Carregar mensagens antigas'}
          </button>
        )}
        {groupedMessages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === currentUserId}
            showAvatar={shouldShowAvatar(groupedMessages, index)}
            senderName={message.sender?.name || 'Contato'}
          />
        ))}
      </div>
    </div>
  );
}
