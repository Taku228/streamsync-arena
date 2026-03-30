import WebSocket from 'ws';
import type { ChatMessage } from '@streamsync/shared';
import type { PlatformAdapter } from './platform.js';
import { normalizeTwitchMessage } from './normalizers.js';

type TwitchAdapterConfig = {
  channel: string;
  streamId: string;
  botUserName: string;
  oauthToken: string;
};

export class TwitchChatAdapter implements PlatformAdapter {
  private socket?: WebSocket;
  private handler?: (message: ChatMessage) => void | Promise<void>;
  private errorHandler?: (error: Error) => void;

  constructor(private readonly config: TwitchAdapterConfig) {}

  connect() {
    this.socket = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.socket.on('open', () => {
      this.send(`PASS oauth:${this.config.oauthToken.replace(/^oauth:/, '')}`);
      this.send(`NICK ${this.config.botUserName}`);
      this.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      this.send(`JOIN #${this.config.channel}`);
    });

    this.socket.on('message', (rawMessage) => {
      const raw = String(rawMessage);
      for (const line of raw.split('\r\n')) {
        if (!line) continue;
        if (line.startsWith('PING')) {
          this.send(line.replace('PING', 'PONG'));
          continue;
        }

        const normalized = normalizeTwitchMessage(line, this.config.streamId);
        if (normalized && this.handler) void this.handler(normalized);
      }
    });

    this.socket.on('error', () => {
      this.errorHandler?.(new Error('Twitch WebSocket error'));
    });

    this.socket.on('close', () => {
      this.errorHandler?.(new Error('Twitch socket closed. Reconnect is required.'));
    });
  }

  disconnect() {
    this.socket?.close();
    this.socket = undefined;
  }

  onMessage(handler: (message: ChatMessage) => void | Promise<void>) {
    this.handler = handler;
  }

  onError(handler: (error: Error) => void) {
    this.errorHandler = handler;
  }

  private send(message: string) {
    this.socket?.send(`${message}\r\n`);
  }
}
