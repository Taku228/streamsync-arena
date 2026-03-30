import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StreamService } from '../services/streamService.js';

const rotationSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(['match-count', 'timer']),
  rotateEveryMatches: z.number().int().min(1),
  rotateEverySeconds: z.number().int().min(1)
});

const settingsPatchSchema = z
  .object({
    entryKeyword: z.string().min(1).optional(),
    leaveKeyword: z.string().min(1).optional(),
    banKeyword: z.string().min(1).optional(),
    rotation: rotationSchema.partial().optional(),
    prioritizeLowParticipation: z.boolean().optional(),
    prioritizeMembers: z.boolean().optional(),
    prioritizeGifters: z.boolean().optional(),
    maxActiveParticipants: z.number().int().min(1).max(20).optional(),
    highlightFirstTimer: z.boolean().optional()
  })
  .strict();

export async function registerApiRoutes(app: FastifyInstance, service: StreamService) {
  app.get('/health', async () => ({ ok: true }));
  app.get('/state', async () => service.getState());
  app.get('/settings', async () => service.getState().settings);

  app.post('/settings', async (req, reply) => {
    const body = settingsPatchSchema.parse(req.body);
    const merged = {
      ...body,
      rotation: body.rotation ? { ...service.getState().settings.rotation, ...body.rotation } : undefined
    };

    service.updateSettings(merged);
    return reply.send({ ok: true, settings: service.getState().settings });
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
