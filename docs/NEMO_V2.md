# Nemo IA V2

## Visao geral

Esta versao cria um Nemo IA em arquitetura profissional, modular e pronta para escalar. O backend foi separado em Node.js + Express e o frontend em React com experiencia de chat estilo ChatGPT. O stack usa MongoDB para historico e memoria, Redis para cache e um orquestrador central para decidir quando chamar Gemini, DeepSeek, multimodal ou fluxo RAG com Brave Search.

## Arquitetura

```text
Usuario Web (React)
  -> API Gateway (Express)
    -> Orquestrador Nemo IA
      -> Classificador de intencao
      -> Router de providers
      -> Prompt Builder
      -> Memoria (MongoDB + embeddings)
      -> Cache (Redis)
      -> RAG (Brave Search + limpeza de conteudo)
      -> Multimodal (imagem + texto)
      -> Providers: Gemini / DeepSeek / Fallback
```

## Estrutura criada

```text
backend/
  src/
    ai/
    config/
    controllers/
    memory/
    middleware/
    rag/
    router/
    routes/
    services/
    utils/
frontend/
  src/
    components/
    hooks/
    pages/
    services/
docker-compose.yml
```

## O que cada modulo faz

### 1. API Gateway
- Arquivos: `backend/src/app.js`, `backend/src/routes/*`
- Centraliza entrada HTTP, middlewares, logs e roteamento.

### 2. Orquestrador Nemo IA
- Arquivo: `backend/src/services/orchestrator.service.js`
- Junta historico, memoria relevante, contexto web, upload de imagem e roteamento do provider.

### 3. Roteador inteligente
- Arquivos: `backend/src/router/intent-classifier.service.js`, `backend/src/router/provider-router.service.js`
- Detecta tipo da pergunta e prioriza:
  - `gemini` para geral e imagem
  - `deepseek` para codigo/logica
  - `gemini + RAG` para perguntas atuais
  - `fallback` quando APIs falham

### 4. RAG com Brave Search
- Arquivo: `backend/src/rag/brave-search.service.js`
- Busca resultados oficiais da Brave Search API, coleta snippets e pode limpar HTML dos links retornados para enriquecer o prompt.

### 5. Memoria inteligente
- Arquivos: `backend/src/memory/*`, `backend/src/ai/embeddings.service.js`
- Salva historico no MongoDB.
- Gera embeddings hash-based para semantic search local.
- Recupera memorias mais relevantes por similaridade.

### 6. Prompt Builder
- Arquivo: `backend/src/services/prompt-builder.service.js`
- Monta o prompt final usando:
  - perfil do usuario
  - intencao
  - historico recente
  - memoria relevante
  - dados da busca web
  - mensagem atual

### 7. Multimodal
- Arquivo: `backend/src/services/multimodal.service.js`
- Normaliza imagem enviada para Gemini Vision com texto junto.

### 8. Frontend estilo ChatGPT
- Arquivos: `frontend/src/pages/ChatPage.jsx`, `frontend/src/components/*`
- Sidebar com historico.
- Janela de chat com mensagens, preview de imagem, digitacao/streaming e loading states.

## Fluxo de requisicao

1. Usuario envia texto ou imagem no React.
2. Frontend abre `POST /api/chat/stream`.
3. API Gateway recebe e entrega ao Orquestrador.
4. Nemo IA classifica a intencao.
5. Se precisar, consulta Brave Search e prepara RAG.
6. Busca memorias relevantes no MongoDB.
7. Prompt Builder monta contexto final.
8. Router tenta provider principal.
9. Se falhar, aplica fallback automatico.
10. Resposta volta em streaming para o frontend.
11. Historico e memoria sao persistidos no MongoDB.
12. Respostas frequentes ficam em cache no Redis.

## Variaveis de ambiente

### Backend
- `PORT`
- `FRONTEND_URL`
- `MONGODB_URI`
- `MONGO_URI` (alias)
- `MONGODB_URL` (alias)
- `REDIS_URL`
- `REDISCLOUD_URL` (alias)
- `BRAVE_SEARCH_API_KEY`
- `BRAVE_API_KEY` (alias)
- `GEMINI_API_KEY`
- `GOOGLE_AI_STUDIO_API_KEY` (alias)
- `GOOGLE_API_KEY` (alias)
- `GEMINI_MODEL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_KEY` (alias)
- `DEEPSEEK_MODEL`
- `CACHE_TTL_SECONDS`
- `MAX_CONTEXT_CHARS`
- `ENABLE_WEB_FETCH`

### Frontend
- `VITE_API_BASE_URL`

## Como rodar com Docker

```bash
docker compose up --build
```

Frontend: [http://localhost:5173](http://localhost:5173)
Backend: [http://localhost:8080/api/health](http://localhost:8080/api/health)

## Como conectar suas chaves reais

No backend, basta definir estas variaveis no Render, Docker ou `.env`:

- `GEMINI_API_KEY`
- `DEEPSEEK_API_KEY`
- `BRAVE_SEARCH_API_KEY`
- `MONGODB_URI`
- `REDIS_URL`

Se o seu provedor usar outros nomes, o backend tambem aceita aliases comuns:

- Gemini: `GOOGLE_AI_STUDIO_API_KEY`, `GOOGLE_API_KEY`
- DeepSeek: `DEEPSEEK_KEY`
- Brave: `BRAVE_API_KEY`
- MongoDB: `MONGO_URI`, `MONGODB_URL`
- Redis: `REDISCLOUD_URL`

Foi adicionado um blueprint separado em [render-node.yaml](C:\Users\Fiscal\Documents\New project\render-node.yaml) para subir essa nova stack sem substituir o servico Flask atual.

## Como rodar sem Docker

### Backend
```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Exemplo de requisicao real

### HTTP JSON
```bash
curl -X POST http://localhost:8080/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "gustavo-1",
    "message": "Pesquise as ultimas noticias sobre Gemini e resuma em 5 pontos",
    "userProfile": {
      "name": "Gustavo",
      "plan": "pro"
    }
  }'
```

### Resposta esperada
```json
{
  "success": true,
  "conversationId": "67d4b1...",
  "answer": "Resumo das noticias...",
  "provider": "gemini",
  "intent": {
    "type": "web_search",
    "needsWeb": true,
    "providerHint": "gemini"
  },
  "ragContext": [
    {
      "title": "...",
      "url": "https://...",
      "snippet": "..."
    }
  ],
  "failures": [],
  "cached": false
}
```

## Melhorias naturais daqui

1. Trocar embeddings hash por provider real de embeddings.
2. Adicionar autenticao JWT e tenants por workspace.
3. Separar orquestrador, memoria e RAG em servicos independentes.
4. Implementar observabilidade com OpenTelemetry.
5. Colocar fila para ingestao de documentos.
6. Adicionar upload de PDF/DOCX no frontend React.

## Referencias
- Brave Search API: [https://brave.com/search/api/](https://brave.com/search/api/)
- Conceito RAG: [Elastic - chatbot RAG](https://www.elastic.co/pt/getting-started/enterprise-search/build-chatbot-rag-app?utm_source=chatgpt.com)
