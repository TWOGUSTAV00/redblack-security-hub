export default function MessageBubble({ message }) {
  const isUser = message.role === 'user';

  return (
    <article className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">{isUser ? 'Voce' : 'Nemo'}</div>
      <div className="message-body">
        {message.attachments?.map((attachment) => (
          <img key={attachment.url} src={attachment.url} alt={attachment.name || 'Imagem'} className="message-image" />
        ))}
        <div className="message-text">{message.content || (message.streaming ? '...' : '')}</div>
        {message.provider && !isUser && <span className="message-provider">{message.provider}</span>}
      </div>
    </article>
  );
}
