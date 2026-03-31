import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { StreamService } from '../services/streamService.js';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

const effectRuleSchema = z
  .object({
    id: z.string().min(1),
    keyword: z.string().min(1),
    effect: z.enum(['confetti', 'shake', 'flash', 'gg-burst']),
    enabled: z.boolean(),
    obsSceneName: z.string().min(1).optional(),
    obsSourceName: z.string().min(1).optional(),
    obsSourceEnabled: z.boolean().optional(),
    obsActionType: z.enum(['scene-switch', 'source-toggle', 'both']).optional()
  })
  .strict()
  .superRefine((rule, ctx) => {
    const actionType = rule.obsActionType ?? 'both';

    if ((actionType === 'scene-switch' || actionType === 'both') && !rule.obsSceneName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'obsSceneName is required for scene-switch/both actions'
      });
    }

    if ((actionType === 'source-toggle' || actionType === 'both') && !rule.obsSourceName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'obsSourceName is required for source-toggle/both actions'
      });
    }
  });

export async function registerApiRoutes(app: FastifyInstance, service: StreamService) {
  const planTier = process.env.APP_PLAN_TIER === 'pro' ? 'pro' : 'free';
  const maxEffectRules = planTier === 'pro' ? 20 : 5;
  const billingWebhookSecret = process.env.BILLING_WEBHOOK_SECRET;
  const billingWebhookSigningSecret = process.env.BILLING_WEBHOOK_SIGNING_SECRET;
  const operatorToken = process.env.OPERATOR_TOKEN;
  const viewerToken = process.env.VIEWER_TOKEN;
  const isRbacEnabled = Boolean(operatorToken || viewerToken);

  function resolveRole(authHeader: string | string[] | undefined) {
    if (!isRbacEnabled) return 'admin' as const;
    const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!raw) return 'viewer' as const;
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (operatorToken && token === operatorToken) return 'operator' as const;
    if (viewerToken && token === viewerToken) return 'viewer' as const;
    return 'viewer' as const;
  }

  function requireOperator(authHeader: string | string[] | undefined) {
    const role = resolveRole(authHeader);
    return role === 'admin' || role === 'operator';
  }

  function authorizeWrite(authHeader: string | string[] | undefined) {
    if (!requireOperator(authHeader)) {
      return { ok: false as const, status: 403, message: 'operator role required' };
    }
    if (planTier === 'pro' && !service.getBillingStatus().active) {
      return { ok: false as const, status: 402, message: 'billing is inactive for pro plan' };
    }
    return { ok: true as const };
  }

  function verifyBillingSignature(payload: unknown, providedSignature: string | undefined) {
    if (!billingWebhookSigningSecret) return true;
    if (!providedSignature) return false;
    const expected = createHmac('sha256', billingWebhookSigningSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(providedSignature, 'utf8');
    if (expectedBuffer.length !== providedBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, providedBuffer);
  }

  app.get('/health', async () => ({ ok: true }));
  app.get('/health/runtime', async () => {
    const state = service.getState();
    return {
      ok: true,
      participants: state.participants.length,
      activeParticipants: state.activeParticipants.length,
      hasActiveVote: Boolean(state.voteSession?.active),
      platformErrorCount: state.platformErrors.length
    };
  });
  app.get('/state', async () => service.getState());
  app.get('/settings', async () => service.getState().settings);
  app.get('/effects', async () => service.getState().effectRules);
  app.get('/operations', async () => ({ ok: true, logs: service.getOperationLogs() }));
  app.get('/billing/plan', async () => ({ ok: true, tier: planTier, maxEffectRules }));
  app.get('/billing/status', async () => ({ ok: true, ...service.getBillingStatus() }));
  app.get('/analytics/summary', async () => ({ ok: true, summary: service.getAnalyticsSummary() }));
  app.get('/auth/me', async (req) => ({
    ok: true,
    role: resolveRole(req.headers.authorization),
    rbacEnabled: isRbacEnabled
  }));

  app.post('/billing/status', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    const body = z.object({
      active: z.boolean().optional(),
      trialEndsAt: z.string().nullable().optional()
    }).parse(req.body);
    service.updateBillingStatus(body);
    return { ok: true, ...service.getBillingStatus() };
  });

  app.post('/billing/webhook', async (req, reply) => {
    if (!billingWebhookSecret || req.headers['x-billing-secret'] !== billingWebhookSecret) {
      return reply.status(401).send({ ok: false, message: 'invalid billing webhook secret' });
    }
    const body = z.object({
      active: z.boolean().optional(),
      trialEndsAt: z.string().nullable().optional()
    }).parse(req.body);
    service.updateBillingStatus(body);
    return { ok: true, ...service.getBillingStatus() };
  });

  app.post('/billing/webhook/stripe', async (req, reply) => {
    if (!billingWebhookSecret || req.headers['x-billing-secret'] !== billingWebhookSecret) {
      return reply.status(401).send({ ok: false, message: 'invalid billing webhook secret' });
    }
    const signature = req.headers['x-billing-signature'];
    const signatureValue = Array.isArray(signature) ? signature[0] : signature;
    if (!verifyBillingSignature(req.body, signatureValue)) {
      return reply.status(401).send({ ok: false, message: 'invalid billing signature' });
    }
    const event = z.object({
      type: z.string(),
      data: z.object({
        object: z.object({
          status: z.string().optional(),
          current_period_end: z.number().optional()
        })
      })
    }).parse(req.body);

    if (event.type !== 'customer.subscription.updated' && event.type !== 'customer.subscription.created') {
      return { ok: true, ignored: true };
    }

    const status = event.data.object.status ?? 'inactive';
    const active = status === 'active' || status === 'trialing';
    const periodEnd = event.data.object.current_period_end;
    service.updateBillingStatus({
      active,
      trialEndsAt: typeof periodEnd === 'number' ? new Date(periodEnd * 1000).toISOString() : null
    });
    return { ok: true, ...service.getBillingStatus() };
  });

  app.post('/settings', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    const body = settingsPatchSchema.parse(req.body);
    const merged = {
      ...body,
      rotation: body.rotation ? { ...service.getState().settings.rotation, ...body.rotation } : undefined
    };

    service.updateSettings(merged);
    return reply.send({ ok: true, settings: service.getState().settings });
  });

  app.post('/effects', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    const rules = z.array(effectRuleSchema).min(1).max(maxEffectRules).parse(req.body);
    service.updateEffectRules(rules);
    return reply.send({ ok: true, effectRules: service.getState().effectRules });
  });

  app.post('/rotation/next-match', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    service.incrementMatchCounter();
    return { ok: true };
  });

  app.post('/rotation/rotate', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    service.rotateParticipants();
    return { ok: true };
  });

  app.post('/participants/:id/ban', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    const params = z.object({ id: z.string() }).parse(req.params);
    service.banParticipant(params.id);
    return { ok: true };
  });

  app.post('/votes', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    const body = z.object({ title: z.string().min(1), options: z.array(z.string().min(1)).min(2) }).parse(req.body);
    service.createVote(body.title, body.options);
    return { ok: true };
  });

  app.post('/votes/close', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    service.closeVote();
    return { ok: true };
  });

  app.post('/platform/errors/clear', async (req, reply) => {
    const authz = authorizeWrite(req.headers.authorization);
    if (!authz.ok) return reply.status(authz.status).send({ ok: false, message: authz.message });
    service.clearPlatformErrors();
    return { ok: true };
  });
}
