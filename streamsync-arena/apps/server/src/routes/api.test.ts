import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
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
