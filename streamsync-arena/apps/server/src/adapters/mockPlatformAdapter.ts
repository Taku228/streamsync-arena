import { nanoid } from 'nanoid';
import type { ChatMessage, Platform } from '@streamsync/shared';
import type { PlatformAdapter } from './platform.js';

const users = ['たくみ', 'ゆい', 'かな', 'Mika', 'Rin', 'Kaito', 'Sora'];
const samples = ['参加', 'GG', 'ドンマイ', '参加', 'ないす', '参加', 'ステージA', 'キャラB'];

export class MockPlatformAdapter implements PlatformAdapter {
  private timer?: NodeJS.Timeout;
  private handler?: (message: ChatMessage) => void;
  private readonly platform: Platform = 'mock';

  connect() {
    this.timer = setInterval(() => {
      if (!this.handler) return;
      const userName = users[Math.floor(Math.random() * users.length)];
      const text = samples[Math.floor(Math.random() * samples.length)];
      this.handler({
        id: nanoid(),
        platform: this.platform,
        userId: `mock-${userName}`,
        userName,
        text,
        membership: Math.random() > 0.8,
        gifted: Math.random() > 0.9,
        timestamp: new Date().toISOString()
      });
    }, 2200);
  }

  disconnect() {
    if (this.timer) clearInterval(this.timer);
  }

  onMessage(handler: (message: ChatMessage) => void) {
    this.handler = handler;
  }
}
