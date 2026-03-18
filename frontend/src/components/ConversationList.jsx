export default function ConversationList({ conversations, activeConversationId, onSelect, onRefresh }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div>
          <p className="eyebrow">Historico</p>
          <h2>Conversas</h2>
        </div>
        <button className="ghost-button" onClick={onRefresh}>Atualizar</button>
      </div>

      <div className="conversation-list">
        {conversations.length === 0 && <p className="placeholder">Nenhuma conversa ainda. Envie a primeira mensagem.</p>}
        {conversations.map((conversation) => (
          <button
            key={conversation._id}
            className={`conversation-card ${activeConversationId === conversation._id ? 'active' : ''}`}
            onClick={() => onSelect(conversation._id)}
          >
            <strong>{conversation.title}</strong>
            <span>{conversation.summary || `${conversation.messages?.length || 0} mensagens`}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
