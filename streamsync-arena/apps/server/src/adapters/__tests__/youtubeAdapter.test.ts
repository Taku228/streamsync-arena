import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { YouTubeLiveAdapter } from '../youtubeAdapter.js';

test('YouTubeLiveAdapter emits normalized message from API response', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    calls.push(String(input));
    return {
      ok: true,
      json: async () => ({
        pollingIntervalMillis: 10_000,
        nextPageToken: 'next',
        items: [
          {
            id: 'yt-1',
            snippet: { displayMessage: '参加', publishedAt: '2026-03-30T00:00:00Z' },
            authorDetails: { channelId: 'u1', displayName: 'viewer' }
          }
        ]
      })
    } as Response;
  }) as typeof fetch;

  try {
    const adapter = new YouTubeLiveAdapter({
      apiKey: 'key',
      liveChatId: 'chat',
      streamId: 'stream',
      pollIntervalMs: 10
    });

    const messages: string[] = [];
    adapter.onMessage((message) => {
      messages.push(message.message);
    });

    adapter.connect();
    await delay(20);
    adapter.disconnect();

    assert.equal(messages[0], '参加');
    assert.ok(calls[0].includes('liveChatId=chat'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('YouTubeLiveAdapter stops retrying after disconnect on fetch failure', async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    throw new Error('network down');
  }) as typeof fetch;

  try {
    const adapter = new YouTubeLiveAdapter({
      apiKey: 'key',
      liveChatId: 'chat',
      streamId: 'stream',
      pollIntervalMs: 10
    });

    const errors: string[] = [];
    adapter.onError((error) => {
      errors.push(error.message);
    });

    adapter.connect();
    await delay(5);
    adapter.disconnect();
    const callsAtDisconnect = callCount;
    await delay(40);

    assert.ok(errors.length >= 1);
    assert.equal(callCount, callsAtDisconnect);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
