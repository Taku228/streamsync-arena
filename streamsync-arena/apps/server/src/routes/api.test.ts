import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createHmac } from 'node:crypto';
import { registerApiRoutes } from './api.js';
import type { DashboardState } from '@streamsync/shared';
import { defaultEffectRules, defaultSettings } from '@streamsync/shared';

class FakeService {
  private readonly state: DashboardState = {
    participants: [],
    activeParticipants: [],
    recentMessages: [],
    voteSession: null,
    settings: defaultSettings,
    effectRules: defaultEffectRules,
    matchCounter: 0,
    platformErrors: []
  };

  getState() {
    return this.state;
  }

  getOperationLogs() {
    return [
      { at: new Date('2026-01-01T00:00:00.000Z').toISOString(), action: 'settings', detail: '参加設定を更新しました' }
    ];
  }

  getAnalyticsSummary() {
    return {
      participantsQueued: 2,
      participantsActive: 1,
      messagesInMemory: 12,
      uniqueChattersInMemory: 5,
      votesCast: 4,
      effectsTriggered: 3,
      lastUpdatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
    };
  }

  private billing = {
    active: process.env.BILLING_ACTIVE !== 'false',
    trialEndsAt: process.env.BILLING_TRIAL_END ?? null,
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString()
  };

  getBillingStatus() {
    return this.billing;
  }

  updateBillingStatus(next: Partial<{ active: boolean; trialEndsAt: string | null }>) {
    this.billing = { ...this.billing, ...next, updatedAt: new Date('2026-01-02T00:00:00.000Z').toISOString() };
  }

  updateSettings(next: Partial<typeof defaultSettings>) {
    this.state.settings = { ...this.state.settings, ...next };
  }

  incrementMatchCounter() {}
  rotateParticipants() {}
  banParticipant() {}
  createVote() {}
  closeVote() {}
  clearPlatformErrors() {
    this.state.platformErrors = [];
  }
  async ingestMessage(message: DashboardState['recentMessages'][number]) {
    this.state.recentMessages.unshift(message);
  }

  updateEffectRules(rules: typeof defaultEffectRules) {
    this.state.effectRules = rules;
  }
}

async function createAppWithRoutes() {
  const app = Fastify();
  const service = new FakeService();
  await registerApiRoutes(app, service as never);
  app.setErrorHandler((error: unknown, _req, reply) => {
    const message = error instanceof Error ? error.message : "unknown";
    reply.status(400).send({ ok: false, message });
  });
  return app;
}

test.afterEach(() => {
  delete process.env.APP_PLAN_TIER;
  delete process.env.OPERATOR_TOKEN;
  delete process.env.VIEWER_TOKEN;
  delete process.env.BILLING_ACTIVE;
  delete process.env.BILLING_TRIAL_END;
  delete process.env.BILLING_WEBHOOK_SECRET;
  delete process.env.BILLING_WEBHOOK_SIGNING_SECRET;
});

test('POST /settings accepts valid payload', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/settings',
    payload: {
      entryKeyword: '参加する',
      maxActiveParticipants: 5,
      rotation: {
        rotateEveryMatches: 2
      }
    }
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.settings.entryKeyword, '参加する');
  assert.equal(json.settings.maxActiveParticipants, 5);
  assert.equal(json.settings.rotation.rotateEveryMatches, 2);

  await app.close();
});

test('POST /settings rejects unknown keys and invalid values', async () => {
  const app = await createAppWithRoutes();

  const badResponse = await app.inject({
    method: 'POST',
    url: '/settings',
    payload: {
      maxActiveParticipants: 0,
      unsafe: true
    }
  });

  assert.equal(badResponse.statusCode, 400);

  await app.close();
});


test('POST /effects accepts valid rules', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/effects',
    payload: [
      { id: '1', keyword: 'GG', effect: 'gg-burst', enabled: true, obsActionType: 'both', obsSceneName: 'SceneA', obsSourceName: 'SrcA' },
      { id: '2', keyword: '8888', effect: 'flash', enabled: false, obsActionType: 'scene-switch', obsSceneName: 'SceneB' }
    ]
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.effectRules.length, 2);

  await app.close();
});

test('POST /effects rejects invalid payload', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/effects',
    payload: [
      { id: '', keyword: '', effect: 'invalid', enabled: true }
    ]
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});


test('POST /platform/errors/clear clears state', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/platform/errors/clear'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);

  await app.close();
});

test('POST /debug/mock-message injects a join/leave message', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/debug/mock-message',
    payload: {
      kind: 'join',
      userName: 'tester'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ok, true);

  await app.close();
});

test('POST /debug/mock-message returns 400 when platform is not mock', async () => {
  process.env.CHAT_PLATFORM = 'youtube';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/debug/mock-message',
    payload: {
      kind: 'join',
      userName: 'tester'
    }
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().ok, false);

  await app.close();
  delete process.env.CHAT_PLATFORM;
});

test('GET /health/runtime returns runtime summary', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'GET',
    url: '/health/runtime'
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(typeof json.participants, 'number');
  assert.equal(typeof json.activeParticipants, 'number');
  assert.equal(typeof json.hasActiveVote, 'boolean');
  assert.equal(typeof json.platformErrorCount, 'number');

  await app.close();
});

test('GET /operations returns operation logs', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'GET',
    url: '/operations'
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(Array.isArray(json.logs), true);
  assert.equal(json.logs[0].action, 'settings');

  await app.close();
});

test('GET /billing/plan returns free tier defaults', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'GET',
    url: '/billing/plan'
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.tier, 'free');
  assert.equal(json.maxEffectRules, 5);

  await app.close();
});

test('GET /billing/status returns current billing state', async () => {
  process.env.BILLING_ACTIVE = 'false';
  process.env.BILLING_TRIAL_END = '2026-12-31T00:00:00.000Z';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'GET',
    url: '/billing/status'
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.active, false);
  assert.equal(json.trialEndsAt, '2026-12-31T00:00:00.000Z');

  await app.close();
});

test('POST /billing/status updates billing state', async () => {
  process.env.OPERATOR_TOKEN = 'op-secret';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/billing/status',
    headers: { authorization: 'Bearer op-secret' },
    payload: { active: false, trialEndsAt: '2027-01-01T00:00:00.000Z' }
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.active, false);
  assert.equal(json.trialEndsAt, '2027-01-01T00:00:00.000Z');

  await app.close();
});

test('POST /billing/webhook rejects invalid secret', async () => {
  process.env.BILLING_WEBHOOK_SECRET = 'whsec';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/billing/webhook',
    headers: { 'x-billing-secret': 'wrong' },
    payload: { active: false }
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});

test('POST /billing/webhook updates billing state with valid secret', async () => {
  process.env.BILLING_WEBHOOK_SECRET = 'whsec';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/billing/webhook',
    headers: { 'x-billing-secret': 'whsec' },
    payload: { active: false, trialEndsAt: '2028-01-01T00:00:00.000Z' }
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.active, false);
  assert.equal(json.trialEndsAt, '2028-01-01T00:00:00.000Z');

  await app.close();
});

test('POST /billing/webhook/stripe ignores unsupported event types', async () => {
  process.env.BILLING_WEBHOOK_SECRET = 'whsec';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/billing/webhook/stripe',
    headers: { 'x-billing-secret': 'whsec' },
    payload: {
      type: 'invoice.created',
      data: { object: { status: 'active', current_period_end: 1893456000 } }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ignored, true);
  await app.close();
});

test('POST /billing/webhook/stripe maps subscription status to billing state', async () => {
  process.env.BILLING_WEBHOOK_SECRET = 'whsec';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/billing/webhook/stripe',
    headers: { 'x-billing-secret': 'whsec' },
    payload: {
      type: 'customer.subscription.updated',
      data: { object: { status: 'trialing', current_period_end: 1893456000 } }
    }
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.active, true);
  assert.equal(typeof json.trialEndsAt, 'string');

  await app.close();
});

test('POST /billing/webhook/stripe enforces optional signature validation', async () => {
  process.env.BILLING_WEBHOOK_SECRET = 'whsec';
  process.env.BILLING_WEBHOOK_SIGNING_SECRET = 'sigsecret';
  const app = await createAppWithRoutes();
  const payload = {
    type: 'customer.subscription.updated',
    data: { object: { status: 'active', current_period_end: 1893456000 } }
  };
  const signature = createHmac('sha256', 'sigsecret').update(JSON.stringify(payload)).digest('hex');

  const forbidden = await app.inject({
    method: 'POST',
    url: '/billing/webhook/stripe',
    headers: { 'x-billing-secret': 'whsec', 'x-billing-signature': 'invalid' },
    payload
  });
  assert.equal(forbidden.statusCode, 401);

  const allowed = await app.inject({
    method: 'POST',
    url: '/billing/webhook/stripe',
    headers: { 'x-billing-secret': 'whsec', 'x-billing-signature': signature },
    payload
  });
  assert.equal(allowed.statusCode, 200);

  await app.close();
});

test('GET /analytics/summary returns aggregate metrics', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'GET',
    url: '/analytics/summary'
  });

  assert.equal(response.statusCode, 200);
  const json = response.json();
  assert.equal(json.ok, true);
  assert.equal(json.summary.participantsQueued, 2);
  assert.equal(json.summary.votesCast, 4);
  assert.equal(json.summary.effectsTriggered, 3);

  await app.close();
});

test('GET /auth/me resolves role from bearer token', async () => {
  process.env.OPERATOR_TOKEN = 'op-secret';
  process.env.VIEWER_TOKEN = 'view-secret';
  const app = await createAppWithRoutes();

  const viewerResponse = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: 'Bearer view-secret' }
  });
  assert.equal(viewerResponse.statusCode, 200);
  assert.equal(viewerResponse.json().role, 'viewer');

  const operatorResponse = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: 'Bearer op-secret' }
  });
  assert.equal(operatorResponse.statusCode, 200);
  assert.equal(operatorResponse.json().role, 'operator');

  await app.close();
});

test('POST /settings requires operator when RBAC is enabled', async () => {
  process.env.OPERATOR_TOKEN = 'op-secret';
  process.env.VIEWER_TOKEN = 'view-secret';
  const app = await createAppWithRoutes();

  const forbidden = await app.inject({
    method: 'POST',
    url: '/settings',
    payload: { entryKeyword: '参加' },
    headers: { authorization: 'Bearer view-secret' }
  });
  assert.equal(forbidden.statusCode, 403);

  const allowed = await app.inject({
    method: 'POST',
    url: '/settings',
    payload: { entryKeyword: '参加' },
    headers: { authorization: 'Bearer op-secret' }
  });
  assert.equal(allowed.statusCode, 200);

  await app.close();
});

test('POST /settings returns 402 when pro billing is inactive', async () => {
  process.env.APP_PLAN_TIER = 'pro';
  process.env.BILLING_ACTIVE = 'false';
  process.env.OPERATOR_TOKEN = 'op-secret';
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/settings',
    payload: { entryKeyword: '参加' },
    headers: { authorization: 'Bearer op-secret' }
  });

  assert.equal(response.statusCode, 402);
  await app.close();
});

test('POST /effects enforces free-tier max rule count', async () => {
  process.env.APP_PLAN_TIER = 'free';
  const app = await createAppWithRoutes();

  const payload = Array.from({ length: 6 }, (_, index) => ({
    id: String(index + 1),
    keyword: `k${index + 1}`,
    effect: 'flash' as const,
    enabled: true,
    obsActionType: 'scene-switch' as const,
    obsSceneName: 'SceneA'
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/effects',
    payload
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});

test('POST /effects allows larger max in pro tier', async () => {
  process.env.APP_PLAN_TIER = 'pro';
  const app = await createAppWithRoutes();

  const payload = Array.from({ length: 6 }, (_, index) => ({
    id: String(index + 1),
    keyword: `k${index + 1}`,
    effect: 'flash' as const,
    enabled: true,
    obsActionType: 'scene-switch' as const,
    obsSceneName: 'SceneA'
  }));

  const response = await app.inject({
    method: 'POST',
    url: '/effects',
    payload
  });

  assert.equal(response.statusCode, 200);

  await app.close();
});


test('POST /effects rejects missing obs fields for selected action', async () => {
  const app = await createAppWithRoutes();

  const response = await app.inject({
    method: 'POST',
    url: '/effects',
    payload: [
      { id: '1', keyword: 'GG', effect: 'gg-burst', enabled: true, obsActionType: 'source-toggle' }
    ]
  });

  assert.equal(response.statusCode, 400);

  await app.close();
});
