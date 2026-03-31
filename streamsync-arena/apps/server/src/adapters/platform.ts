import type { ChatMessage } from '@streamsync/shared';

export interface PlatformAdapter {
  connect(): void | Promise<void>;
  disconnect(): void | Promise<void>;
  onMessage(handler: (message: ChatMessage) => void | Promise<void>): void;
  onError?(handler: (error: Error) => void): void;
}
