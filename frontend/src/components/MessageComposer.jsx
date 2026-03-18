import UploadPreview from './UploadPreview.jsx';

export default function MessageComposer({
  value,
  onChange,
  onSend,
  onFile,
  image,
  onRemoveImage,
  disabled
}) {
  return (
    <footer className="composer-shell">
      <UploadPreview image={image} onRemove={onRemoveImage} />
      <div className="composer">
        <label className="icon-button file-button">
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFile(file);
              }
              event.target.value = '';
            }}
          />
          <span>Imagem</span>
        </label>
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Pergunte qualquer coisa. O Nemo IA vai escolher a melhor rota entre Gemini, DeepSeek, RAG ou multimodal."
          rows={1}
        />
        <button className="primary-button" onClick={onSend} disabled={disabled}>Enviar</button>
      </div>
    </footer>
  );
}
