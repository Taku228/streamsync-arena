import { nanoid } from 'nanoid';
import type { NormalizedChatMessage } from '@streamsync/shared';

type YouTubeAuthorDetails = {
  channelId?: string;
  displayName?: string;
  profileImageUrl?: string;
  isChatModerator?: boolean;
  isChatSponsor?: boolean;
};

type YouTubeTextMessageDetails = { messageText?: string };

type YouTubeSnippet = {
  type?: string;
  liveChatId?: string;
  publishedAt?: string;
  displayMessage?: string;
  textMessageDetails?: YouTubeTextMessageDetails;
};

type YouTubeChatItem = {
  id?: string;
  snippet?: YouTubeSnippet;
  authorDetails?: YouTubeAuthorDetails;
};

export function normalizeYouTubeMessage(item: YouTubeChatItem, streamId: string): NormalizedChatMessage | null {
  const text = item.snippet?.displayMessage ?? item.snippet?.textMessageDetails?.messageText;
  if (!text) return null;

  const displayName = item.authorDetails?.displayName ?? 'unknown';
  const userId = item.authorDetails?.channelId ?? `youtube-${displayName}`;

  return {
    id: item.id ?? nanoid(),
    platform: 'youtube',
    streamId,
    userId,
    userName: displayName,
    displayName,
    message: text,
    timestamp: item.snippet?.publishedAt ? Date.parse(item.snippet.publishedAt) : Date.now(),
    isMember: item.authorDetails?.isChatSponsor,
    isModerator: item.authorDetails?.isChatModerator,
    avatarUrl: item.authorDetails?.profileImageUrl,
    raw: item
  };
}

type TwitchPrivmsg = {
  tags: Record<string, string>;
  userName: string;
  channel: string;
  text: string;
};

function decodeTwitchTagValue(value: string): string {
  return value
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n');
}

export function parseTwitchPrivmsg(line: string): TwitchPrivmsg | null {
  if (!line.includes(' PRIVMSG ')) return null;

  const match = line.match(/^(?:@([^ ]+) )?:([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.+)$/);
  if (!match) return null;

  const tagString = match[1] ?? '';
  const tags = Object.fromEntries(
    tagString
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const [key, value = ''] = entry.split('=');
        return [key, decodeTwitchTagValue(value)];
      })
  );

  return {
    tags,
    userName: match[2],
    channel: match[3],
    text: match[4]
  };
}

export function normalizeTwitchMessage(line: string, streamId: string): NormalizedChatMessage | null {
  const parsed = parseTwitchPrivmsg(line);
  if (!parsed) return null;

  const badges = parsed.tags.badges?.split(',').filter(Boolean) ?? [];
  const userId = parsed.tags['user-id'] || `twitch-${parsed.userName}`;
  const parsedTimestamp = Number(parsed.tags['tmi-sent-ts']);
  const timestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();

  return {
    id: parsed.tags.id ?? nanoid(),
    platform: 'twitch',
    streamId,
    userId,
    userName: parsed.userName,
    displayName: parsed.tags['display-name'] || parsed.userName,
    message: parsed.text,
    timestamp,
    badges,
    isModerator: badges.some((badge) => badge.startsWith('moderator/')),
    isSubscriber: badges.some((badge) => badge.startsWith('subscriber/')),
    isMember: badges.some((badge) => badge.startsWith('vip/')),
    isGifted: badges.some((badge) => badge.startsWith('sub-gifter/')),
    raw: { line }
  };
}
