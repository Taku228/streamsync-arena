import { nanoid } from 'nanoid';
import db from '../db/database.js';
import {
  defaultEffectRules,
  defaultSettings,
  type ChatMessage,
  type DashboardState,
  type EffectRule,
  type OverlayEvent,
  type Participant,
  type StreamSettings,
  type VoteSession
} from '@streamsync/shared';
import type { Server as SocketIOServer } from 'socket.io';
import type { GameStatsAdapter } from '../adapters/gameStatsAdapter.js';
import type { SettingsRepository } from '../repositories/settingsRepository.js';
import type { ObsController } from '../integrations/obsController.js';

export class StreamService {
  private state: DashboardState = {
    participants: [],
    activeParticipants: [],
    recentMessages: [],
    voteSession: null,
    settings: defaultSettings,
    effectRules: defaultEffectRules,
    matchCounter: 0,
    platformErrors: []
  };

  constructor(
    private readonly io: SocketIOServer,
    private readonly gameStatsAdapter: GameStatsAdapter,
    private readonly settingsRepository: SettingsRepository,
    private readonly obsController: ObsController
  ) {}

  async initialize() {
    const saved = this.settingsRepository.getSettings();
    if (saved) {
      this.state.settings = { ...defaultSettings, ...saved };
    }
    await this.obsController.connect().catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS connect error'));
    });
  }

  getState() {
    return this.state;
  }

  async ingestMessage(message: ChatMessage) {
    this.state.recentMessages = [message, ...this.state.recentMessages].slice(0, 100);
    const normalized = message.message.trim();

    if (normalized === this.state.settings.entryKeyword) {
      this.enqueueParticipant(message);
    }

    if (normalized === this.state.settings.leaveKeyword) {
      this.removeParticipantByUser(message.userId, message.platform);
    }

    this.processEffectRules(message);
    this.processVote(message);
    await this.syncGameStats();
    this.broadcast();
  }

  private scoreParticipant(record: {
    timesParticipated: number;
    membership: boolean;
    gifted: boolean;
  }) {
    let score = 0;
    if (this.state.settings.prioritizeLowParticipation) {
      score += Math.max(0, 100 - record.timesParticipated * 10);
    }
    if (this.state.settings.prioritizeMembers && record.membership) score += 40;
    if (this.state.settings.prioritizeGifters && record.gifted) score += 30;
    return score;
  }

  private enqueueParticipant(message: ChatMessage) {
    const existing = this.state.participants.find(
      (item) => item.platformUserId === message.userId && item.platform === message.platform && item.status !== 'completed'
    );
    if (existing) return;

    const row = db
      .prepare(
        `SELECT id, times_participated as timesParticipated, membership, gifted
         FROM viewer_history WHERE platform_user_id = ? AND platform = ?`
      )
      .get(message.userId, message.platform) as
      | { id: string; timesParticipated: number; membership: number; gifted: number }
      | undefined;

    const timesParticipated = row?.timesParticipated ?? 0;
    const membership = Boolean(message.isMember || row?.membership);
    const gifted = Boolean(message.isGifted || row?.gifted);

    const participant: Participant = {
      id: row?.id ?? nanoid(),
      platformUserId: message.userId,
      displayName: message.userName,
      platform: message.platform,
      joinedAt: new Date().toISOString(),
      timesParticipated,
      isFirstTimer: timesParticipated === 0,
      membership,
      gifted,
      priorityScore: this.scoreParticipant({ timesParticipated, membership, gifted }),
      status: 'queued'
    };

    this.state.participants = [...this.state.participants, participant].sort((a, b) => b.priorityScore - a.priorityScore);
    this.activateFromQueue();
    this.upsertHistory(participant);
    this.emitOverlay({ type: 'participant.joined', payload: participant });
  }

  private upsertHistory(participant: Participant) {
    db.prepare(
      `INSERT INTO viewer_history (id, platform_user_id, platform, display_name, times_participated, last_joined_at, membership, gifted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(platform_user_id, platform) DO UPDATE SET
       display_name = excluded.display_name,
       times_participated = viewer_history.times_participated + 1,
       last_joined_at = excluded.last_joined_at,
       membership = excluded.membership,
       gifted = excluded.gifted`
    ).run(
      participant.id,
      participant.platformUserId,
      participant.platform,
      participant.displayName,
      participant.timesParticipated + 1,
      new Date().toISOString(),
      participant.membership ? 1 : 0,
      participant.gifted ? 1 : 0
    );
  }

  private activateFromQueue() {
    const needed = this.state.settings.maxActiveParticipants - this.state.activeParticipants.length;
    if (needed <= 0) return;
    const queued = this.state.participants.filter((p) => p.status === 'queued').slice(0, needed);
    queued.forEach((p) => (p.status = 'active'));
    this.state.activeParticipants = this.state.participants.filter((p) => p.status === 'active');
    if (queued.length) {
      this.emitOverlay({ type: 'participant.activated', payload: this.state.activeParticipants });
    }
  }

  rotateParticipants() {
    const active = this.state.participants.filter((p) => p.status === 'active');
    active.forEach((p) => (p.status = 'completed'));
    this.state.activeParticipants = [];
    this.activateFromQueue();
    this.broadcast();
  }

  incrementMatchCounter() {
    this.state.matchCounter += 1;
    const { rotation } = this.state.settings;
    if (rotation.enabled && rotation.mode === 'match-count' && this.state.matchCounter % rotation.rotateEveryMatches === 0) {
      this.rotateParticipants();
    }
    this.broadcast();
  }

  banParticipant(participantId: string) {
    this.state.participants = this.state.participants.map((p) =>
      p.id === participantId ? { ...p, status: 'banned' } : p
    );
    this.state.activeParticipants = this.state.participants.filter((p) => p.status === 'active');
    this.activateFromQueue();
    this.broadcast();
  }

  removeParticipantByUser(platformUserId: string, platform: string) {
    this.state.participants = this.state.participants.filter(
      (p) => !(p.platformUserId === platformUserId && p.platform === platform)
    );
    this.state.activeParticipants = this.state.participants.filter((p) => p.status === 'active');
  }

  updateSettings(next: Partial<StreamSettings>) {
    this.state.settings = { ...this.state.settings, ...next };
    this.settingsRepository.saveSettings(this.state.settings);
    this.broadcast();
  }

  updateEffectRules(next: EffectRule[]) {
    this.state.effectRules = next;
    this.broadcast();
  }

  createVote(title: string, options: string[]) {
    const vote: VoteSession = {
      id: nanoid(),
      title,
      active: true,
      createdAt: new Date().toISOString(),
      options: options.map((label) => ({ id: nanoid(), label, votes: 0 }))
    };
    this.state.voteSession = vote;
    void this.obsController.onVoteUpdated(true).catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS vote sync error'));
    });
    this.emitOverlay({ type: 'vote.updated', payload: vote });
    this.broadcast();
  }

  closeVote() {
    if (this.state.voteSession) this.state.voteSession.active = false;
    void this.obsController.onVoteUpdated(false).catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS vote sync error'));
    });
    this.emitOverlay({ type: 'vote.updated', payload: this.state.voteSession });
    this.broadcast();
  }

  private processVote(message: ChatMessage) {
    const vote = this.state.voteSession;
    if (!vote?.active) return;
    const matched = vote.options.find((option) => option.label.toLowerCase() === message.message.trim().toLowerCase());
    if (matched) {
      matched.votes += 1;
      this.emitOverlay({ type: 'vote.updated', payload: vote });
    }
  }

  private processEffectRules(message: ChatMessage) {
    const hit = this.state.effectRules.find(
      (rule) => rule.enabled && message.message.toLowerCase().includes(rule.keyword.toLowerCase())
    );
    if (!hit) return;

    void this.obsController.onEffectTriggered().catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS effect sync error'));
    });

    this.emitOverlay({
      type: 'effect.triggered',
      payload: { effect: hit.effect, userName: message.userName, text: message.message }
    });
  }

  private emitOverlay(event: OverlayEvent) {
    this.io.emit('overlay:event', event);
  }

  private async syncGameStats() {
    const activeIds = this.state.activeParticipants.map((p) => p.id);
    if (!activeIds.length) return;
    const stats = await this.gameStatsAdapter.syncActiveParticipants(activeIds);
    this.state.participants = this.state.participants.map((p) => ({ ...p, ...stats[p.id] }));
    this.state.activeParticipants = this.state.participants.filter((p) => p.status === 'active');
  }

  reportPlatformError(error: Error) {
    const next = `${new Date().toISOString()} - ${error.message}`;
    this.state.platformErrors = [next, ...this.state.platformErrors].slice(0, 10);
    this.broadcast();
  }

  broadcast() {
    this.io.emit('dashboard:state', this.state);
  }
}
