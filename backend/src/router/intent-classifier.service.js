const KEYWORDS = {
  image: ['imagem', 'foto', 'print', 'analisar imagem', 'descreva a imagem'],
  code: ['codigo', 'programa', 'bug', 'erro', 'api', 'node', 'react', 'python', 'sql', 'script'],
  web: ['agora', 'atual', 'ultimas', 'noticia', 'pesquise', 'busque', 'na web', 'recentemente', 'hoje'],
  math: ['calcule', 'equacao', 'matematica', 'resolver', 'conta', 'formula', 'integral']
};

function containsKeyword(text, list) {
  return list.some((keyword) => text.includes(keyword));
}

export function classifyIntent({ message = '', hasImage = false }) {
  const normalized = message.toLowerCase();

  if (hasImage || containsKeyword(normalized, KEYWORDS.image)) {
    return { type: 'image', needsWeb: false, providerHint: 'gemini' };
  }

  if (containsKeyword(normalized, KEYWORDS.web)) {
    return { type: 'web_search', needsWeb: true, providerHint: 'gemini' };
  }

  if (containsKeyword(normalized, KEYWORDS.code) || containsKeyword(normalized, KEYWORDS.math)) {
    return { type: 'code', needsWeb: false, providerHint: 'deepseek' };
  }

  return { type: 'general', needsWeb: false, providerHint: 'gemini' };
}
