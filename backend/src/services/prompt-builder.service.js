import { env } from '../config/env.js';
import { trimToChars } from '../utils/token-estimator.js';

const NEMO_PERSONA = [
  'Voce e o Nemo IA, um assistente estilo ChatGPT.',
  'Seja profissional, claro, colaborativo e continuo entre mensagens.',
  'Explique bem sem fugir do assunto e sem revelar raciocinio interno.',
  'Quando houver busca web, cite as fontes de forma objetiva com links.',
  'Quando houver imagem, use a imagem e a pergunta ao mesmo tempo.'
].join(' ');

export function buildPrompt({ userProfile, intent, message, history, memories, ragContext }) {
  const sections = [
    `PERSONA:\n${NEMO_PERSONA}`,
    `USUARIO:\nNome: ${userProfile.name || 'Usuario'}\nPlano: ${userProfile.plan || 'free'}`,
    `INTENCAO:\n${intent.type}`
  ];

  if (history?.length) {
    sections.push(`HISTORICO RECENTE:\n${history.map((item) => `${item.role}: ${item.content}`).join('\n')}`);
  }

  if (memories?.length) {
    sections.push(`MEMORIA RELEVANTE:\n${memories.map((item) => `- ${item.sourceMessage}`).join('\n')}`);
  }

  if (ragContext?.length) {
    sections.push(`CONTEXTO WEB (RAG):\n${ragContext.map((item, index) => `Fonte ${index + 1}: ${item.title}\nURL: ${item.url}\nTrecho: ${item.snippet}\nConteudo limpo: ${item.body || 'Nao coletado'}`).join('\n\n')}`);
  }

  sections.push(`MENSAGEM ATUAL:\n${message}`);

  return trimToChars(sections.join('\n\n'), env.MAX_CONTEXT_CHARS);
}
