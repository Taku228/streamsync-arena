import type { ChatMessage } from '@streamsync/shared';
import type { PlatformAdapter } from './platform.js';
import { normalizeYouTubeMessage } from './normalizers.js';

type YoutubeAdapterConfig = {
  apiKey: string;
  liveChatId: string;
  streamId: string;
  pollIntervalMs?: number;
};

type YouTubeListResponse = {
  pollingIntervalMillis?: number;
  items?: Array<{
    id?: string;
    snippet?: {
      publishedAt?: string;
      displayMessage?: string;
      textMessageDetails?: { messageText?: string };
    };
    authorDetails?: {
      channelId?: string;
      displayName?: string;
      profileImageUrl?: string;
      isChatModerator?: boolean;
      isChatSponsor?: boolean;
    };
  }>;
};

export class YouTubeLiveAdapter implements PlatformAdapter {
  private readonly config: YoutubeAdapterConfig;
  private handler?: (message: ChatMessage) => void | Promise<void>;
  private errorHandler?: (error: Error) => void;
  private timer?: NodeJS.Timeout;
  private nextPageToken?: string;
  private stopped = false;

  constructor(config: YoutubeAdapterConfig) {
    this.config = config;
  }

  connect() {
    this.stopped = false;
    void this.poll();
  }

  disconnect() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  onMessage(handler: (message: ChatMessage) => void | Promise<void>) {
    this.handler = handler;
  }

  onError(handler: (error: Error) => void) {
    this.errorHandler = handler;
  }

  private async poll() {
    if (this.stopped) return;
    try {
      const params = new URLSearchParams({
        part: 'snippet,authorDetails',
        liveChatId: this.config.liveChatId,
        key: this.config.apiKey,
        maxResults: '200'
      });
      if (this.nextPageToken) params.set('pageToken', this.nextPageToken);

      const response = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${params.toString()}`);
      if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);
      const data = (await response.json()) as YouTubeListResponse & { nextPageToken?: string };
      this.nextPageToken = data.nextPageToken;

      const normalized = (data.items ?? [])
        .map((item) => normalizeYouTubeMessage(item, this.config.streamId))
        .filter((message): message is ChatMessage => Boolean(message));

      for (const message of normalized) {
        if (this.handler) await this.handler(message);
      }

      const nextDelay = data.pollingIntervalMillis ?? this.config.pollIntervalMs ?? 3000;
      this.timer = setTimeout(() => void this.poll(), nextDelay);
    } catch (error) {
      const resolved = error instanceof Error ? error : new Error(String(error));
      this.errorHandler?.(resolved);
      this.timer = setTimeout(() => void this.poll(), this.config.pollIntervalMs ?? 5000);
    }
  }
}
