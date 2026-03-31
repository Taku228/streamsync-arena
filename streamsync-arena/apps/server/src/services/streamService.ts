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
import type { ObsController } from '../integrations/obsController.js';

type SettingsStore = {
  getSettings(): StreamSettings | null;
  saveSettings(settings: StreamSettings): void;
  getEffectRules(): EffectRule[] | null;
  saveEffectRules(rules: EffectRule[]): void;
  getBillingStatus?(): BillingStatus | null;
  saveBillingStatus?(status: BillingStatus): void;
};

type OperationLog = {
  at: string;
  action: string;
  detail: string;
};

type AnalyticsSummary = {
  participantsQueued: number;
  participantsActive: number;
  messagesInMemory: number;
  uniqueChattersInMemory: number;
  votesCast: number;
  effectsTriggered: number;
  lastUpdatedAt: string;
};

type BillingStatus = {
  active: boolean;
  trialEndsAt: string | null;
  updatedAt: string;
};

export class StreamService {
  private rotationTimer?: NodeJS.Timeout;
  private lastPlatformError?: { message: string; at: number; count: number };
  private voteParticipants = new Set<string>();
  private operationLogs: OperationLog[] = [];
  private analyticsCounters = {
    votesCast: 0,
    effectsTriggered: 0,
    lastUpdatedAt: new Date().toISOString()
  };
  private billingStatus: BillingStatus;

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
    private readonly settingsRepository: SettingsStore,
    private readonly obsController: ObsController,
    private readonly alertWebhookUrl?: string,
    initialBillingStatus?: { active: boolean; trialEndsAt: string | null }
  ) {
    this.billingStatus = {
      active: initialBillingStatus?.active ?? true,
      trialEndsAt: initialBillingStatus?.trialEndsAt ?? null,
      updatedAt: new Date().toISOString()
    };
  }

  async initialize() {
    const saved = this.settingsRepository.getSettings();
    if (saved) {
      this.state.settings = { ...defaultSettings, ...saved };
    }

    const savedRules = this.settingsRepository.getEffectRules();
    if (savedRules?.length) {
      this.state.effectRules = this.normalizeEffectRules(savedRules);
    }
    const savedBilling = this.settingsRepository.getBillingStatus?.();
    if (savedBilling) {
      this.billingStatus = savedBilling;
    }

    await this.obsController.connect().catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS connect error'));
    });
    this.configureRotationTimer();
  }

  getState() {
    return this.state;
  }

  getOperationLogs() {
    return this.operationLogs;
  }

  getAnalyticsSummary(): AnalyticsSummary {
    const uniqueChatters = new Set(
      this.state.recentMessages.map((message) => `${message.platform}:${message.userId}`)
    );
    return {
      participantsQueued: this.state.participants.filter((item) => item.status === 'queued').length,
      participantsActive: this.state.activeParticipants.length,
      messagesInMemory: this.state.recentMessages.length,
      uniqueChattersInMemory: uniqueChatters.size,
      votesCast: this.analyticsCounters.votesCast,
      effectsTriggered: this.analyticsCounters.effectsTriggered,
      lastUpdatedAt: this.analyticsCounters.lastUpdatedAt
    };
  }

  getBillingStatus() {
    return this.billingStatus;
  }

  updateBillingStatus(next: Partial<Pick<BillingStatus, 'active' | 'trialEndsAt'>>) {
    this.billingStatus = {
      ...this.billingStatus,
      ...next,
      updatedAt: new Date().toISOString()
    };
    this.settingsRepository.saveBillingStatus?.(this.billingStatus);
    this.recordOperation('billing', `請求状態を更新しました (active=${this.billingStatus.active})`);
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
    await this.syncGameStats().catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('Game stats sync error'));
    });
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
    this.recordOperation('rotation', 'アクティブ参加者をローテーションしました');
    this.broadcast();
  }

  incrementMatchCounter() {
    this.state.matchCounter += 1;
    this.recordOperation('match', `マッチカウンターを ${this.state.matchCounter} に更新しました`);
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
    this.recordOperation('settings', '参加設定を更新しました');
    this.configureRotationTimer();
    this.broadcast();
  }

  updateEffectRules(next: EffectRule[]) {
    const normalized = this.normalizeEffectRules(next);
    this.state.effectRules = normalized;
    this.settingsRepository.saveEffectRules(normalized);
    this.recordOperation('effects', `エフェクトルールを ${normalized.length} 件更新しました`);
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
    this.recordOperation('vote', `投票を開始しました: ${title} (${options.length}択)`);
    this.voteParticipants.clear();
    void this.obsController.onVoteUpdated(true).catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS vote sync error'));
    });
    this.emitOverlay({ type: 'vote.updated', payload: vote });
    this.broadcast();
  }

  closeVote() {
    if (this.state.voteSession) this.state.voteSession.active = false;
    this.recordOperation('vote', '投票を終了しました');
    this.voteParticipants.clear();
    void this.obsController.onVoteUpdated(false).catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS vote sync error'));
    });
    this.emitOverlay({ type: 'vote.updated', payload: this.state.voteSession });
    this.broadcast();
  }

  private processVote(message: ChatMessage) {
    const vote = this.state.voteSession;
    if (!vote?.active) return;
    const voterKey = `${message.platform}:${message.userId}`;
    if (this.voteParticipants.has(voterKey)) return;
    const matched = vote.options.find((option) => option.label.toLowerCase() === message.message.trim().toLowerCase());
    if (matched) {
      matched.votes += 1;
      this.voteParticipants.add(voterKey);
      this.analyticsCounters.votesCast += 1;
      this.analyticsCounters.lastUpdatedAt = new Date().toISOString();
      this.emitOverlay({ type: 'vote.updated', payload: vote });
    }
  }

  private processEffectRules(message: ChatMessage) {
    const hit = this.state.effectRules.find(
      (rule) => rule.enabled && message.message.toLowerCase().includes(rule.keyword.toLowerCase())
    );
    if (!hit) return;
    this.analyticsCounters.effectsTriggered += 1;
    this.analyticsCounters.lastUpdatedAt = new Date().toISOString();

    void this.obsController
      .onEffectTriggered({
        sceneName: hit.obsSceneName,
        sourceName: hit.obsSourceName,
        sourceEnabled: hit.obsSourceEnabled,
        actionType: hit.obsActionType
      })
      .catch((error: unknown) => {
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


  async stop() {
    if (this.rotationTimer) clearInterval(this.rotationTimer);
    await this.obsController.disconnect().catch((error: unknown) => {
      this.reportPlatformError(error instanceof Error ? error : new Error('OBS disconnect error'));
    });
  }

  private configureRotationTimer() {
    if (this.rotationTimer) clearInterval(this.rotationTimer);

    const { rotation } = this.state.settings;
    if (!rotation.enabled || rotation.mode !== 'timer') return;

    this.rotationTimer = setInterval(() => {
      this.rotateParticipants();
    }, Math.max(1, rotation.rotateEverySeconds) * 1000);
  }



  private normalizeEffectRules(rules: EffectRule[]) {
    return rules.map((rule) => ({
      ...rule,
      obsActionType: rule.obsActionType ?? 'both'
    }));
  }

  clearPlatformErrors() {
    this.state.platformErrors = [];
    this.lastPlatformError = undefined;
    this.recordOperation('platform', '接続エラー履歴をクリアしました');
    this.broadcast();
  }

  reportPlatformError(error: Error) {
    const now = Date.now();
    const withinWindow = this.lastPlatformError
      && this.lastPlatformError.message === error.message
      && now - this.lastPlatformError.at < 10_000;

    if (withinWindow && this.state.platformErrors[0] && this.lastPlatformError) {
      const updatedCount = this.lastPlatformError.count + 1;
      this.lastPlatformError = { ...this.lastPlatformError, at: now, count: updatedCount };
      const next = `${new Date(now).toISOString()} - ${error.message} (x${updatedCount})`;
      this.state.platformErrors = [next, ...this.state.platformErrors.slice(1)].slice(0, 10);
      this.broadcast();
      return;
    }

    this.lastPlatformError = { message: error.message, at: now, count: 1 };
    const next = `${new Date(now).toISOString()} - ${error.message}`;
    this.state.platformErrors = [next, ...this.state.platformErrors].slice(0, 10);
    this.recordOperation('platform', `接続エラー: ${error.message}`);
    this.notifyPlatformAlert(error.message);
    this.broadcast();
  }

  private recordOperation(action: string, detail: string) {
    this.operationLogs = [{ at: new Date().toISOString(), action, detail }, ...this.operationLogs].slice(0, 30);
  }

  private notifyPlatformAlert(message: string) {
    if (!this.alertWebhookUrl) return;
    const payload = {
      text: `[StreamSync Arena] Platform error detected: ${message}`
    };
    void fetch(this.alertWebhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Ignore notification failures to avoid recursive error noise.
    });
  }

  broadcast() {
    this.io.emit('dashboard:state', this.state);
  }
}
