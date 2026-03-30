import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYouTubeMessage, parseTwitchPrivmsg, normalizeTwitchMessage } from '../normalizers.js';

test('normalizeYouTubeMessage maps display message to normalized message', () => {
  const normalized = normalizeYouTubeMessage(
    {
      id: 'yt-1',
      snippet: { displayMessage: '参加', publishedAt: '2026-03-30T00:00:00Z' },
      authorDetails: { channelId: 'c1', displayName: 'UserA', isChatSponsor: true }
    },
    'stream-yt'
  );

  assert.ok(normalized);
  assert.equal(normalized.platform, 'youtube');
  assert.equal(normalized.message, '参加');
  assert.equal(normalized.isMember, true);
});

test('parseTwitchPrivmsg parses IRC line', () => {
  const parsed = parseTwitchPrivmsg(
    '@badge-info=;badges=subscriber/1;color=#1E90FF;display-name=Foo;id=abc;tmi-sent-ts=1711000000000;user-id=42 :foo!foo@foo.tmi.twitch.tv PRIVMSG #mychannel :GG'
  );

  assert.ok(parsed);
  assert.equal(parsed.userName, 'foo');
  assert.equal(parsed.text, 'GG');
  assert.equal(parsed.tags['display-name'], 'Foo');
});

test('normalizeTwitchMessage maps IRC line to normalized model', () => {
  const normalized = normalizeTwitchMessage(
    '@badge-info=;badges=moderator/1,subscriber/6;display-name=Foo;id=abc;tmi-sent-ts=1711000000000;user-id=42 :foo!foo@foo.tmi.twitch.tv PRIVMSG #mychannel :ドンマイ',
    'stream-tw'
  );

  assert.ok(normalized);
  assert.equal(normalized.platform, 'twitch');
  assert.equal(normalized.message, 'ドンマイ');
  assert.equal(normalized.isModerator, true);
  assert.equal(normalized.isSubscriber, true);
});
