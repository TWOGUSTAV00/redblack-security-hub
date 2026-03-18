import { executeChatFlow } from '../services/orchestrator.service.js';

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function sendMessage(req, res, next) {
  try {
    const payload = await executeChatFlow({
      ...req.body,
      userId: req.user.id,
      userProfile: {
        name: req.user.name,
        plan: req.user.plan,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl || ''
      }
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

export async function streamMessage(req, res, next) {
  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const payload = await executeChatFlow({
      ...req.body,
      userId: req.user.id,
      userProfile: {
        name: req.user.name,
        plan: req.user.plan,
        username: req.user.username,
        avatarUrl: req.user.avatarUrl || ''
      }
    });
    const words = payload.answer.split(/(\s+)/).filter(Boolean);

    writeSse(res, 'meta', {
      conversationId: payload.conversationId,
      provider: payload.provider,
      intent: payload.intent
    });

    for (const chunk of words) {
      writeSse(res, 'chunk', { text: chunk });
      await new Promise((resolve) => setTimeout(resolve, 22));
    }

    writeSse(res, 'done', payload);
    res.end();
  } catch (error) {
    next(error);
  }
}
