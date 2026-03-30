import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StreamService } from '../services/streamService.js';

export async function registerApiRoutes(app: FastifyInstance, service: StreamService) {
  app.get('/health', async () => ({ ok: true }));
  app.get('/state', async () => service.getState());

  app.post('/settings', async (req, reply) => {
    const body = z.record(z.any()).parse(req.body);
    service.updateSettings(body);
    return reply.send({ ok: true });
  });

  app.post('/rotation/next-match', async () => {
    service.incrementMatchCounter();
    return { ok: true };
  });

  app.post('/rotation/rotate', async () => {
    service.rotateParticipants();
    return { ok: true };
  });

  app.post('/participants/:id/ban', async (req) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    service.banParticipant(params.id);
    return { ok: true };
  });

  app.post('/votes', async (req) => {
    const body = z.object({ title: z.string().min(1), options: z.array(z.string().min(1)).min(2) }).parse(req.body);
    service.createVote(body.title, body.options);
    return { ok: true };
  });

  app.post('/votes/close', async () => {
    service.closeVote();
    return { ok: true };
  });
}
