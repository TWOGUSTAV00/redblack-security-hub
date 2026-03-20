import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble.jsx';

export default function ChatThread({ messages, currentUserId, onDeleteForMe, onDeleteForEveryone }) {
  const containerRef = useRef(null);

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto bg-[#0b141a] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03),transparent_65%)] px-3 py-4 md:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            mine={message.senderId === currentUserId}
            onDeleteForMe={onDeleteForMe}
            onDeleteForEveryone={onDeleteForEveryone}
          />
        ))}
      </div>
    </div>
  );
}
