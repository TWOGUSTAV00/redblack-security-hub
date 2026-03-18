import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';

export default function ChatWindow({ title, messages, typing }) {
  return (
    <section className="chat-window">
      <header className="chat-window-head">
        <div>
          <p className="eyebrow">Conversa ativa</p>
          <h2>{title || 'Nova conversa'}</h2>
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-state">
            <h3>Pronto para conversar</h3>
            <p>Envie texto, imagem ou uma pergunta que precise de busca web. O Nemo IA escolhe o melhor fluxo sozinho.</p>
          </div>
        )}
        {messages.map((message, index) => <MessageBubble key={`${message.role}-${index}`} message={message} />)}
        {typing && <TypingIndicator />}
      </div>
    </section>
  );
}
