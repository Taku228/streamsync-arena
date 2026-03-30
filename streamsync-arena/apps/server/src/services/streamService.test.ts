import test from 'node:test';
import assert from 'node:assert/strict';
import type { Server as SocketIOServer } from 'socket.io';
import type { StreamSettings } from '@streamsync/shared';
import { StreamService } from './streamService.js';
import { defaultSettings } from '@streamsync/shared';

class FakeSettingsRepository {
  private data: StreamSettings | null = null;

  getSettings() {
    return this.data;
  }

  saveSettings(settings: StreamSettings) {
    this.data = settings;
  }
}

class FakeObsController {
  voteUpdated: boolean[] = [];
  effectCount = 0;

  async connect() {}
  async onVoteUpdated(active: boolean) {
    this.voteUpdated.push(active);
  }
  async onEffectTriggered() {
    this.effectCount += 1;
  }
}

class FakeGameStatsAdapter {
  async syncActiveParticipants(ids: string[]) {
    return Object.fromEntries(ids.map((id) => [id, { kills: 1, rank: 10 }]));
  }
}

function createService() {
  const io = { emit: () => undefined } as unknown as SocketIOServer;
  const settingsRepository = new FakeSettingsRepository();
  const obs = new FakeObsController();
  const service = new StreamService(io, new FakeGameStatsAdapter(), settingsRepository, obs);
  return { service, settingsRepository, obs };
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
