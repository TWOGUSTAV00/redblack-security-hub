export default function TopBar({ provider, userName, onLogout }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Nemo IA</p>
        <h1>Assistente multimodal com RAG, memoria e orquestracao inteligente</h1>
      </div>
      <div className="topbar-badges">
        <span className="badge">Usuario: {userName}</span>
        <span className="badge badge-active">Provider ativo: {provider}</span>
        <button className="ghost-button" onClick={onLogout}>Sair</button>
      </div>
    </header>
  );
}
