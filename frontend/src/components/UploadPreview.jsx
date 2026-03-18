export default function UploadPreview({ image, onRemove }) {
  if (!image) return null;

  return (
    <div className="upload-preview">
      <img src={image.preview} alt={image.file.name} />
      <div>
        <strong>{image.file.name}</strong>
        <span>{Math.round(image.file.size / 1024)} KB</span>
      </div>
      <button className="ghost-button" onClick={onRemove}>Remover</button>
    </div>
  );
}
