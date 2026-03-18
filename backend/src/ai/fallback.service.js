export async function queryFallback({ prompt }) {
  const shortened = prompt.length > 1200 ? `${prompt.slice(0, 1200)}...` : prompt;
  return {
    provider: 'fallback',
    text: `Estou operando em modo de contingencia. Segue a melhor resposta possivel com base no contexto recebido:\n\n${shortened}`
  };
}
