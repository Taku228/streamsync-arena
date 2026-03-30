import type { ChatMessage } from '@streamsync/shared';

export interface PlatformAdapter {
  connect(): void;
  disconnect(): void;
  onMessage(handler: (message: ChatMessage) => void): void;
}
