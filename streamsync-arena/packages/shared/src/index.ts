export type Platform = 'youtube' | 'twitch' | 'niconico' | 'mock';

export type NormalizedChatMessage = {
  id: string;
  platform: Platform;
  streamId: string;
  userId: string;
  userName: string;
  displayName: string;
  message: string;
  timestamp: number;
  badges?: string[];
  isMember?: boolean;
  isModerator?: boolean;
  isSubscriber?: boolean;
  isGifted?: boolean;
  avatarUrl?: string;
  raw?: unknown;
};

// Backward compatible alias for existing UI / service references.
export type ChatMessage = NormalizedChatMessage;

export type Participant = {
  id: string;
  platformUserId: string;
  displayName: string;
  platform: Platform;
  joinedAt: string;
  timesParticipated: number;
  isFirstTimer: boolean;
  membership: boolean;
  gifted: boolean;
  priorityScore: number;
  status: 'queued' | 'active' | 'completed' | 'banned';
  kills?: number;
  rank?: number;
};

export type VoteOption = {
  id: string;
  label: string;
  votes: number;
};

export type VoteSession = {
  id: string;
  title: string;
  active: boolean;
  createdAt: string;
  endsAt?: string;
  options: VoteOption[];
};

export type EffectRule = {
  id: string;
  keyword: string;
  effect: 'confetti' | 'shake' | 'flash' | 'gg-burst';
  enabled: boolean;
};

export type RotationPolicy = {
  enabled: boolean;
  mode: 'match-count' | 'timer';
  rotateEveryMatches: number;
  rotateEverySeconds: number;
};

export type StreamSettings = {
  entryKeyword: string;
  leaveKeyword: string;
  banKeyword: string;
  rotation: RotationPolicy;
  prioritizeLowParticipation: boolean;
  prioritizeMembers: boolean;
  prioritizeGifters: boolean;
  maxActiveParticipants: number;
  highlightFirstTimer: boolean;
};

export type OverlayEvent =
  | { type: 'effect.triggered'; payload: { effect: string; userName: string; text: string } }
  | { type: 'participant.joined'; payload: Participant }
  | { type: 'participant.activated'; payload: Participant[] }
  | { type: 'vote.updated'; payload: VoteSession | null };

export type DashboardState = {
  participants: Participant[];
  activeParticipants: Participant[];
  recentMessages: ChatMessage[];
  voteSession: VoteSession | null;
  settings: StreamSettings;
  effectRules: EffectRule[];
  matchCounter: number;
  platformErrors: string[];
};

export const defaultSettings: StreamSettings = {
  entryKeyword: '参加',
  leaveKeyword: '辞退',
  banKeyword: '追放',
  rotation: {
    enabled: true,
    mode: 'match-count',
    rotateEveryMatches: 3,
    rotateEverySeconds: 300
  },
  prioritizeLowParticipation: true,
  prioritizeMembers: true,
  prioritizeGifters: true,
  maxActiveParticipants: 3,
  highlightFirstTimer: true
};

export const defaultEffectRules: EffectRule[] = [
  { id: '1', keyword: 'GG', effect: 'gg-burst', enabled: true },
  { id: '2', keyword: 'ドンマイ', effect: 'shake', enabled: true },
  { id: '3', keyword: 'ないす', effect: 'confetti', enabled: true },
  { id: '4', keyword: '8888', effect: 'flash', enabled: true }
];
