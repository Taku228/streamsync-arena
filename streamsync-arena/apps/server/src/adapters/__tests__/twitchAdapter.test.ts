import test from 'node:test';
import assert from 'node:assert/strict';
import { TwitchChatAdapter } from '../twitchAdapter.js';

type Handler = (...args: any[]) => void;

class FakeSocket {
  static readonly OPEN = 1;
  readyState = FakeSocket.OPEN;
  sent: string[] = [];
  handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler) {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  emit(event: string, ...args: any[]) {
    const list = this.handlers.get(event) ?? [];
    for (const handler of list) handler(...args);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.emit('close');
  }
}

test('TwitchChatAdapter replies to PING with PONG', async () => {
  const socket = new FakeSocket();
  const adapter = new TwitchChatAdapter({
    channel: 'arena',
    streamId: 'tw-stream',
    botUserName: 'bot',
    oauthToken: 'oauth:test',
    socketFactory: () => socket as unknown as any
  });

  adapter.connect();
  socket.emit('open');
  socket.emit('message', 'PING :tmi.twitch.tv\r\n');

  assert.ok(socket.sent.some((line) => line.includes('PONG :tmi.twitch.tv')));
  adapter.disconnect();
});

test('TwitchChatAdapter surfaces handler errors via onError', async () => {
  const socket = new FakeSocket();
  const adapter = new TwitchChatAdapter({
    channel: 'arena',
    streamId: 'tw-stream',
    botUserName: 'bot',
    oauthToken: 'oauth:test',
    socketFactory: () => socket as unknown as any
  });

  const errors: string[] = [];
  adapter.onError((error) => errors.push(error.message));
  adapter.onMessage(async () => {
    throw new Error('handler boom');
  });

  adapter.connect();
  socket.emit('open');
  socket.emit(
    'message',
    '@badge-info=;badges=;display-name=Foo;id=abc;tmi-sent-ts=1711000000000;user-id=42 :foo!foo@foo.tmi.twitch.tv PRIVMSG #arena :GG\r\n'
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(errors[0], 'handler boom');
  adapter.disconnect();
});
