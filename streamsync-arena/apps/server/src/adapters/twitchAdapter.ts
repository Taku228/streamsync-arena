import WebSocket from 'ws';
import type { ChatMessage } from '@streamsync/shared';
import type { PlatformAdapter } from './platform.js';
import { normalizeTwitchMessage } from './normalizers.js';

type TwitchAdapterConfig = {
  channel: string;
  streamId: string;
  botUserName: string;
  oauthToken: string;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  socketFactory?: (url: string) => WebSocket;
};

export class TwitchChatAdapter implements PlatformAdapter {
  private socket?: WebSocket;
  private handler?: (message: ChatMessage) => void | Promise<void>;
  private errorHandler?: (error: Error) => void;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(private readonly config: TwitchAdapterConfig) {}

  connect() {
    this.stopped = false;
    this.openSocket();
  }

  disconnect() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.socket = undefined;
  }

  onMessage(handler: (message: ChatMessage) => void | Promise<void>) {
    this.handler = handler;
  }

  onError(handler: (error: Error) => void) {
    this.errorHandler = handler;
  }

  private openSocket() {
    this.socket = this.config.socketFactory
      ? this.config.socketFactory('wss://irc-ws.chat.twitch.tv:443')
      : new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    this.socket.on('open', () => {
      this.reconnectAttempts = 0;
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
        if (normalized && this.handler) {
          void Promise.resolve(this.handler(normalized)).catch((error: unknown) => {
            const resolved = error instanceof Error ? error : new Error(String(error));
            this.errorHandler?.(resolved);
          });
        }
      }
    });

    this.socket.on('error', (error) => {
      const resolved = error instanceof Error ? error : new Error('Twitch WebSocket error');
      this.errorHandler?.(resolved);
    });

    this.socket.on('close', () => {
      if (this.stopped) return;
      this.errorHandler?.(new Error('Twitch socket closed. reconnecting...'));
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const base = this.config.reconnectBaseMs ?? 1500;
    const max = this.config.reconnectMaxMs ?? 30000;
    const delay = Math.min(max, base * 2 ** this.reconnectAttempts);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      if (this.stopped) return;
      this.openSocket();
    }, delay);
  }

  private send(message: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(`${message}\r\n`);
  }
}
