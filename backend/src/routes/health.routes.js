import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ success: true, service: 'nemo-ia-backend', status: 'ok' });
});

export default router;
