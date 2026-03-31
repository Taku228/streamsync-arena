import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server as SocketIOServer } from 'socket.io';
import type { StreamSettings } from '@streamsync/shared';
import { StreamService } from './streamService.js';
import { defaultSettings } from '@streamsync/shared';

class FakeSettingsRepository {
  private data: StreamSettings | null = null;
  private effectRules: { id: string; keyword: string; effect: "confetti" | "shake" | "flash" | "gg-burst"; enabled: boolean }[] | null = null;

  getSettings() {
    return this.data;
  }

  saveSettings(settings: StreamSettings) {
    this.data = settings;
  }

  getEffectRules() {
    return this.effectRules;
  }

  saveEffectRules(rules: { id: string; keyword: string; effect: "confetti" | "shake" | "flash" | "gg-burst"; enabled: boolean }[]) {
    this.effectRules = rules;
  }
}

class FakeObsController {
  voteUpdated: boolean[] = [];
  effectCount = 0;
  disconnectCalled = false;

  async connect() {}
  async disconnect() {
    this.disconnectCalled = true;
  }
  async onVoteUpdated(active: boolean) {
    this.voteUpdated.push(active);
  }
  async onEffectTriggered() {
    this.effectCount += 1;
  }
}

class FakeGameStatsAdapter {
  shouldThrow = false;

  async syncActiveParticipants(ids: string[]) {
    if (this.shouldThrow) {
      throw new Error('stats backend down');
    }
    return Object.fromEntries(ids.map((id) => [id, { kills: 1, rank: 10 }]));
  }
}

function createService() {
  const io = { emit: () => undefined } as unknown as SocketIOServer;
  const settingsRepository = new FakeSettingsRepository();
  const obs = new FakeObsController();
  const gameStats = new FakeGameStatsAdapter();
  const service = new StreamService(io, gameStats, settingsRepository, obs);
  return { service, settingsRepository, obs, gameStats };
}

test('entry keyword adds participant and leave keyword removes it', async () => {
  const { service } = createService();
  await service.initialize();

  await service.ingestMessage({
    id: 'm1',
    platform: 'mock',
    streamId: 's1',
    userId: 'u1',
    userName: 'Alice',
    displayName: 'Alice',
    message: defaultSettings.entryKeyword,
    timestamp: Date.now()
  });

  assert.equal(service.getState().participants.length, 1);
  assert.equal(service.getState().activeParticipants.length, 1);

  await service.ingestMessage({
    id: 'm2',
    platform: 'mock',
    streamId: 's1',
    userId: 'u1',
    userName: 'Alice',
    displayName: 'Alice',
    message: defaultSettings.leaveKeyword,
    timestamp: Date.now()
  });

  assert.equal(service.getState().participants.length, 0);
});

test('vote and effect trigger OBS hooks', async () => {
  const { service, obs } = createService();
  await service.initialize();

  service.createVote('Map?', ['A', 'B']);
  assert.deepEqual(obs.voteUpdated, [true]);

  await service.ingestMessage({
    id: 'm3',
    platform: 'mock',
    streamId: 's1',
    userId: 'u2',
    userName: 'Bob',
    displayName: 'Bob',
    message: 'A',
    timestamp: Date.now()
  });

  assert.equal(service.getState().voteSession?.options[0].votes, 1);

  await service.ingestMessage({
    id: 'm4',
    platform: 'mock',
    streamId: 's1',
    userId: 'u2',
    userName: 'Bob',
    displayName: 'Bob',
    message: 'GGです',
    timestamp: Date.now()
  });

  assert.equal(obs.effectCount, 1);

  service.closeVote();
  assert.deepEqual(obs.voteUpdated, [true, false]);
});

test('same user vote is counted once per vote session', async () => {
  const { service } = createService();
  await service.initialize();
  service.createVote('Map?', ['A', 'B']);

  await service.ingestMessage({
    id: 'v1',
    platform: 'mock',
    streamId: 's1',
    userId: 'u-voter',
    userName: 'Voter',
    displayName: 'Voter',
    message: 'A',
    timestamp: Date.now()
  });

  await service.ingestMessage({
    id: 'v2',
    platform: 'mock',
    streamId: 's1',
    userId: 'u-voter',
    userName: 'Voter',
    displayName: 'Voter',
    message: 'A',
    timestamp: Date.now()
  });

  assert.equal(service.getState().voteSession?.options[0].votes, 1);
});


test('timer mode rotates active participants automatically', async () => {
  const { service } = createService();
  await service.initialize();

  service.updateSettings({
    maxActiveParticipants: 1,
    rotation: {
      ...defaultSettings.rotation,
      enabled: true,
      mode: 'timer',
      rotateEverySeconds: 1
    }
  });

  await service.ingestMessage({
    id: 'm5',
    platform: 'mock',
    streamId: 's1',
    userId: 'u5',
    userName: 'P1',
    displayName: 'P1',
    message: defaultSettings.entryKeyword,
    timestamp: Date.now()
  });

  await service.ingestMessage({
    id: 'm6',
    platform: 'mock',
    streamId: 's1',
    userId: 'u6',
    userName: 'P2',
    displayName: 'P2',
    message: defaultSettings.entryKeyword,
    timestamp: Date.now()
  });

  assert.equal(service.getState().activeParticipants[0]?.platformUserId, 'u5');

  await new Promise((resolve) => setTimeout(resolve, 1200));

  assert.equal(service.getState().activeParticipants[0]?.platformUserId, 'u6');
  await service.stop();
});


test('effect rules are saved through repository', async () => {
  const { service, settingsRepository } = createService();
  await service.initialize();

  service.updateEffectRules([
    { id: 'x', keyword: '8888', effect: 'flash', enabled: true }
  ]);

  assert.equal(service.getState().effectRules.length, 1);
  assert.equal(service.getState().effectRules[0]?.obsActionType, 'both');
  assert.equal(settingsRepository.getEffectRules()?.[0]?.keyword, '8888');
});

test('stop disconnects OBS controller', async () => {
  const { service, obs } = createService();
  await service.initialize();

  await service.stop();

  assert.equal(obs.disconnectCalled, true);
});

test('reportPlatformError coalesces duplicate errors in a short window', async () => {
  const { service } = createService();
  await service.initialize();

  service.reportPlatformError(new Error('twitch disconnected'));
  service.reportPlatformError(new Error('twitch disconnected'));
  service.reportPlatformError(new Error('twitch disconnected'));

  const first = service.getState().platformErrors[0] ?? '';
  assert.equal(service.getState().platformErrors.length, 1);
  assert.match(first, /\(x3\)$/);
});

test('ingestMessage handles game stats sync failures without throwing', async () => {
  const { service, gameStats } = createService();
  gameStats.shouldThrow = true;
  await service.initialize();

  await service.ingestMessage({
    id: 'm-fail',
    platform: 'mock',
    streamId: 's1',
    userId: 'u-fail',
    userName: 'ErrorUser',
    displayName: 'ErrorUser',
    message: defaultSettings.entryKeyword,
    timestamp: Date.now()
  });

  const first = service.getState().platformErrors[0] ?? '';
  assert.match(first, /stats backend down/);
});
