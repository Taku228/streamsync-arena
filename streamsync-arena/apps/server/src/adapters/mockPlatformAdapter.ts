import { nanoid } from 'nanoid';
import type { ChatMessage, Platform } from '@streamsync/shared';
import type { PlatformAdapter } from './platform.js';

const users = ['たくみ', 'ゆい', 'かな', 'Mika', 'Rin', 'Kaito', 'Sora'];
const samples = ['参加', 'GG', 'ドンマイ', '参加', 'ないす', '参加', 'ステージA', 'キャラB', '8888'];

export class MockPlatformAdapter implements PlatformAdapter {
  private timer?: NodeJS.Timeout;
  private handler?: (message: ChatMessage) => void | Promise<void>;
  private readonly platform: Platform = 'mock';

  connect() {
    this.timer = setInterval(() => {
      if (!this.handler) return;
      const userName = users[Math.floor(Math.random() * users.length)];
      const message = samples[Math.floor(Math.random() * samples.length)];
      void this.handler({
        id: nanoid(),
        platform: this.platform,
        streamId: 'mock-stream',
        userId: `mock-${userName}`,
        userName,
        displayName: userName,
        message,
        isMember: Math.random() > 0.8,
        isGifted: Math.random() > 0.9,
        timestamp: Date.now(),
        raw: { source: 'mock' }
      });
    }, 2200);
  }

  disconnect() {
    if (this.timer) clearInterval(this.timer);
  }

  onMessage(handler: (message: ChatMessage) => void | Promise<void>) {
    this.handler = handler;
  }
}
