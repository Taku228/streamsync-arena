import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { DashboardState, EffectRule } from '@streamsync/shared';

type EffectPreset = {
  name: string;
  keyword: string;
  effect: EffectRule['effect'];
  obsActionType: NonNullable<EffectRule['obsActionType']>;
};

type RuntimeHealth = {
  ok: boolean;
  participants: number;
  activeParticipants: number;
  hasActiveVote: boolean;
  platformErrorCount: number;
};

type OperationLog = {
  at: string;
  action: string;
  detail: string;
};

type BillingPlan = {
  tier: 'free' | 'pro';
  maxEffectRules: number;
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
};

type AuthMe = {
  role: 'admin' | 'operator' | 'viewer';
  rbacEnabled: boolean;
};

type StreamPreset = {
  id: string;
  label: string;
  description: string;
  settings: {
    entryKeyword: string;
    leaveKeyword: string;
    maxActiveParticipants: number;
  };
  rules: Array<Pick<EffectRule, 'keyword' | 'effect' | 'enabled' | 'obsActionType'>>;
};

const streamPresets: StreamPreset[] = [
  {
    id: 'casual',
    label: '雑談向け',
    description: '参加ハードルを下げ、反応が出やすい軽い演出中心。',
    settings: {
      entryKeyword: '参加',
      leaveKeyword: '辞退',
      maxActiveParticipants: 4
    },
    rules: [
      { keyword: 'こんにちは', effect: 'confetti', enabled: true, obsActionType: 'scene-switch' },
      { keyword: '8888', effect: 'flash', enabled: true, obsActionType: 'both' },
      { keyword: 'GG', effect: 'gg-burst', enabled: true, obsActionType: 'scene-switch' }
    ]
  },
  {
    id: 'ranked',
    label: '対戦/ランク向け',
    description: '少人数ローテ＋状況変化が分かりやすい演出。',
    settings: {
      entryKeyword: '参加',
      leaveKeyword: '抜け',
      maxActiveParticipants: 3
    },
    rules: [
      { keyword: 'ないす', effect: 'confetti', enabled: true, obsActionType: 'scene-switch' },
      { keyword: 'ドンマイ', effect: 'shake', enabled: true, obsActionType: 'source-toggle' },
      { keyword: '逆転', effect: 'flash', enabled: true, obsActionType: 'both' }
    ]
  },
  {
    id: 'event',
    label: '企画/大会向け',
    description: 'リアクション重視。見栄え優先の強めエフェクト設定。',
    settings: {
      entryKeyword: 'エントリー',
      leaveKeyword: 'キャンセル',
      maxActiveParticipants: 5
    },
    rules: [
      { keyword: '優勝', effect: 'gg-burst', enabled: true, obsActionType: 'both' },
      { keyword: 'ファイト', effect: 'flash', enabled: true, obsActionType: 'scene-switch' },
      { keyword: 'おめでとう', effect: 'confetti', enabled: true, obsActionType: 'both' }
    ]
  }
];

export function ControlsPanel({
  state,
  connectionState
}: {
  state: DashboardState;
  connectionState: 'connected' | 'disconnected';
}) {
  const nextRotation = useMemo(() => {
    const rotateEvery = state.settings.rotation.rotateEveryMatches;
    return rotateEvery - (state.matchCounter % rotateEvery || rotateEvery);
  }, [state.matchCounter, state.settings.rotation.rotateEveryMatches]);

  const [entryKeyword, setEntryKeyword] = useState(state.settings.entryKeyword);
  const [leaveKeyword, setLeaveKeyword] = useState(state.settings.leaveKeyword);
  const [maxActiveParticipants, setMaxActiveParticipants] = useState(state.settings.maxActiveParticipants);
  const [effectRules, setEffectRules] = useState<EffectRule[]>(state.effectRules);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth | null>(null);
  const [healthStatus, setHealthStatus] = useState<'idle' | 'checking' | 'error'>('idle');
  const [healthCheckedAt, setHealthCheckedAt] = useState<number | null>(null);
  const [actionStatus, setActionStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [actionMessage, setActionMessage] = useState('');
  const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
  const [billingPlan, setBillingPlan] = useState<BillingPlan>({ tier: 'free', maxEffectRules: 5 });
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus>({ active: true, trialEndsAt: null });
  const [authMe, setAuthMe] = useState<AuthMe>({ role: 'admin', rbacEnabled: false });
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const builtInPresetNames = ['GG Burst', 'Cheer Flash', 'Console Shake'];

  const [effectPresets, setEffectPresets] = useState<EffectPreset[]>(() => {
    const builtin = [
      { name: 'GG Burst', keyword: 'GG', effect: 'gg-burst' as const, obsActionType: 'both' as const },
      { name: 'Cheer Flash', keyword: '8888', effect: 'flash' as const, obsActionType: 'scene-switch' as const },
      { name: 'Console Shake', keyword: 'ドンマイ', effect: 'shake' as const, obsActionType: 'source-toggle' as const }
    ];

    if (typeof window === 'undefined') return builtin;
    try {
      const raw = window.localStorage.getItem('streamsync.effectPresets');
      if (!raw) return builtin;
      const parsed = JSON.parse(raw) as EffectPreset[];
      return [...builtin, ...parsed];
    } catch {
      return builtin;
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const custom = effectPresets.filter((preset) => !builtInPresetNames.includes(preset.name));
    window.localStorage.setItem('streamsync.effectPresets', JSON.stringify(custom));
  }, [effectPresets]);

  const ruleWarnings = useMemo(() => {
    return effectRules
      .map((rule, index) => {
        const actionType = rule.obsActionType ?? 'both';
        if ((actionType === 'scene-switch' || actionType === 'both') && !rule.obsSceneName) {
          return `ルール${index + 1}: OBSシーンが未入力です`;
        }
        if ((actionType === 'source-toggle' || actionType === 'both') && !rule.obsSourceName) {
          return `ルール${index + 1}: OBSソースが未入力です`;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
  }, [effectRules]);

  const onboardingChecks = useMemo(() => {
    const hasKeywords = entryKeyword.trim().length > 0 && leaveKeyword.trim().length > 0;
    const hasValidRules = effectRules.length > 0 && ruleWarnings.length === 0;
    return [
      {
        id: 'connection',
        label: 'サーバー接続',
        done: connectionState === 'connected'
      },
      {
        id: 'keywords',
        label: '参加/辞退キーワード設定',
        done: hasKeywords
      },
      {
        id: 'rules',
        label: 'エフェクトルール設定',
        done: hasValidRules
      }
    ];
  }, [connectionState, effectRules.length, entryKeyword, leaveKeyword, ruleWarnings.length]);

  const onboardingProgress = useMemo(() => {
    const done = onboardingChecks.filter((check) => check.done).length;
    return Math.round((done / onboardingChecks.length) * 100);
  }, [onboardingChecks]);

  useEffect(() => {
    setEntryKeyword(state.settings.entryKeyword);
    setLeaveKeyword(state.settings.leaveKeyword);
    setMaxActiveParticipants(state.settings.maxActiveParticipants);
    setEffectRules(state.effectRules);
  }, [state.settings.entryKeyword, state.settings.leaveKeyword, state.settings.maxActiveParticipants, state.effectRules]);

  function normalizeRulesForSave(rules: EffectRule[]) {
    return rules.map((rule) => {
      const actionType = rule.obsActionType ?? 'both';
      if (actionType === 'scene-switch') {
        return { ...rule, obsSourceName: undefined, obsSourceEnabled: undefined };
      }
      return rule;
    });
  }

  async function saveSettings() {
    setSaveStatus('saving');
    setSaveMessage('保存中...');

    try {
      if (ruleWarnings.length > 0) {
        throw new Error(`OBS設定の不足があります: ${ruleWarnings[0]}`);
      }
      await api.post('/settings', {
        entryKeyword,
        leaveKeyword,
        maxActiveParticipants
      });
      await api.post('/effects', normalizeRulesForSave(effectRules));
      setSaveStatus('done');
      setSaveMessage('設定を保存しました。');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '設定保存に失敗しました。';
      setSaveStatus('error');
      setSaveMessage(message);
    }
  }

  function updateRule(index: number, patch: Partial<EffectRule>) {
    setEffectRules((prev) => prev.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule)));
  }

  function applyTemplate(index: number, presetName: string) {
    const preset = effectPresets.find((item) => item.name === presetName);
    if (!preset) return;
    updateRule(index, {
      keyword: preset.keyword,
      effect: preset.effect,
      obsActionType: preset.obsActionType
    });
  }

  function saveTemplateFromRule(index: number) {
    const rule = effectRules[index];
    if (!rule) return;

    const templateName = typeof window !== 'undefined'
      ? window.prompt('テンプレ名を入力してください', `Custom-${Date.now()}`)
      : `Custom-${Date.now()}`;
    if (!templateName) return;

    if (effectPresets.some((preset) => preset.name === templateName)) {
      setSaveStatus('error');
      setSaveMessage('同名テンプレが既にあります。別名を指定してください。');
      return;
    }

    const customTemplateCount = effectPresets.filter((preset) => !builtInPresetNames.includes(preset.name)).length;
    if (billingPlan.tier !== 'pro' && customTemplateCount >= 3) {
      setSaveStatus('error');
      setSaveMessage('Freeプランではカスタムテンプレは3件までです。');
      return;
    }

    setEffectPresets((prev) => [
      ...prev,
      { name: templateName, keyword: rule.keyword, effect: rule.effect, obsActionType: rule.obsActionType ?? 'both' }
    ]);
  }

  function removeTemplate(name: string) {
    if (builtInPresetNames.includes(name)) return;
    setEffectPresets((prev) => prev.filter((preset) => preset.name !== name));
  }

  function addRule() {
    if (effectRules.length >= billingPlan.maxEffectRules) {
      setSaveStatus('error');
      setSaveMessage(`${billingPlan.tier.toUpperCase()}プランの上限（${billingPlan.maxEffectRules}件）に達しています。`);
      return;
    }
    const id = String(Date.now());
    setEffectRules((prev) => [...prev, { id, keyword: '新ワード', effect: 'flash', enabled: true, obsSceneName: '', obsSourceName: '', obsSourceEnabled: true, obsActionType: 'both' }]);
  }

  function removeRule(index: number) {
    setEffectRules((prev) => prev.filter((_, idx) => idx !== index));
  }

  function applyStreamPreset(presetId: string) {
    const preset = streamPresets.find((item) => item.id === presetId);
    if (!preset) return;

    setEntryKeyword(preset.settings.entryKeyword);
    setLeaveKeyword(preset.settings.leaveKeyword);
    setMaxActiveParticipants(preset.settings.maxActiveParticipants);

    setEffectRules(
      preset.rules.map((rule, index) => ({
        id: `${preset.id}-${index}-${Date.now()}`,
        keyword: rule.keyword,
        effect: rule.effect,
        enabled: rule.enabled,
        obsActionType: rule.obsActionType ?? 'both',
        obsSceneName: 'Main',
        obsSourceName: 'EffectSource',
        obsSourceEnabled: true
      }))
    );

    setSaveStatus('done');
    setSaveMessage(`${preset.label}テンプレを適用しました。保存ボタンで確定してください。`);
  }

  function startSetupWizard() {
    setWizardStep(0);
    setShowSetupWizard(true);
  }

  function closeSetupWizard() {
    setShowSetupWizard(false);
  }

  function applyObsPreset(index: number, preset: NonNullable<EffectRule['obsActionType']>) {
    updateRule(index, { obsActionType: preset });
  }

  function moveRule(index: number, direction: -1 | 1) {
    setEffectRules((prev) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= prev.length) return prev;
      const cloned = [...prev];
      [cloned[index], cloned[nextIndex]] = [cloned[nextIndex], cloned[index]];
      return cloned;
    });
  }

  async function executeAction(label: string, runner: () => Promise<unknown>) {
    try {
      setActionStatus('running');
      setActionMessage(`${label}を実行中...`);
      await runner();
      setActionStatus('done');
      setActionMessage(`${label}を実行しました。`);
    } catch (error: unknown) {
      setActionStatus('error');
      setActionMessage(error instanceof Error ? error.message : `${label}に失敗しました。`);
    }
  }

  async function clearPlatformErrors() {
    await executeAction('エラークリア', async () => {
      await api.post('/platform/errors/clear');
    });
  }

  const refreshRuntimeHealth = useCallback(async () => {
    try {
      setHealthStatus('checking');
      const { data } = await api.get<RuntimeHealth>('/health/runtime');
      setRuntimeHealth(data);
      setHealthCheckedAt(Date.now());
      setHealthStatus('idle');
    } catch {
      setHealthStatus('error');
    }
  }, []);

  const refreshOperationLogs = useCallback(async () => {
    try {
      const { data } = await api.get<{ ok: boolean; logs: OperationLog[] }>('/operations');
      setOperationLogs(data.logs ?? []);
    } catch {
      // no-op: runtime state is still usable even if log fetch fails
    }
  }, []);

  const refreshBillingPlan = useCallback(async () => {
    try {
      const { data } = await api.get<{ ok: boolean; tier: 'free' | 'pro'; maxEffectRules: number }>('/billing/plan');
      setBillingPlan({ tier: data.tier, maxEffectRules: data.maxEffectRules });
    } catch {
      setBillingPlan({ tier: 'free', maxEffectRules: 5 });
    }
  }, []);

  const refreshAnalyticsSummary = useCallback(async () => {
    try {
      const { data } = await api.get<{ ok: boolean; summary: AnalyticsSummary }>('/analytics/summary');
      setAnalyticsSummary(data.summary);
    } catch {
      setAnalyticsSummary(null);
    }
  }, []);

  const refreshBillingStatus = useCallback(async () => {
    try {
      const { data } = await api.get<{ ok: boolean; active: boolean; trialEndsAt: string | null }>('/billing/status');
      setBillingStatus({ active: data.active, trialEndsAt: data.trialEndsAt });
    } catch {
      setBillingStatus({ active: true, trialEndsAt: null });
    }
  }, []);

  const refreshAuthMe = useCallback(async () => {
    try {
      const { data } = await api.get<{ ok: boolean; role: AuthMe['role']; rbacEnabled: boolean }>('/auth/me');
      setAuthMe({ role: data.role, rbacEnabled: data.rbacEnabled });
    } catch {
      setAuthMe({ role: 'admin', rbacEnabled: false });
    }
  }, []);

  useEffect(() => {
    if (connectionState !== 'connected') return;
    void refreshRuntimeHealth();
    void refreshOperationLogs();
    void refreshBillingPlan();
    void refreshBillingStatus();
    void refreshAnalyticsSummary();
    void refreshAuthMe();
    const timer = setInterval(() => void refreshRuntimeHealth(), 15000);
    return () => clearInterval(timer);
  }, [connectionState, refreshRuntimeHealth, refreshOperationLogs, refreshBillingPlan, refreshBillingStatus, refreshAnalyticsSummary, refreshAuthMe]);

  const canWrite = authMe.role !== 'viewer' && (billingPlan.tier !== 'pro' || billingStatus.active);

  function exportTemplates() {
    const custom = effectPresets.filter((preset) => !builtInPresetNames.includes(preset.name));
    const blob = new Blob([JSON.stringify(custom, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'streamsync-effect-templates.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importTemplates(file: File | null) {
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text) as EffectPreset[];
    const deduped = parsed.filter((item) => !effectPresets.some((preset) => preset.name === item.name));
    const customCount = effectPresets.filter((preset) => !builtInPresetNames.includes(preset.name)).length;
    const importable = billingPlan.tier === 'pro' ? deduped : deduped.slice(0, Math.max(0, 3 - customCount));
    if (billingPlan.tier !== 'pro' && importable.length < deduped.length) {
      setSaveStatus('error');
      setSaveMessage('Freeプラン上限のため、一部テンプレは取り込まれませんでした。');
    }
    setEffectPresets((prev) => [...prev, ...importable]);
    setSaveStatus('done');
    setSaveMessage(`テンプレを${importable.length}件取り込みました。`);
  }

  return (
    <div className="card">
      <h2>指揮官画面</h2>
      <div className="stack">
        <div className="row">
          <span className="badge">マッチ数 {state.matchCounter}</span>
          <span className="badge">次回ローテまで {nextRotation}</span>
          <span className={`badge ${billingPlan.tier === 'pro' ? 'good' : ''}`}>
            Plan: {billingPlan.tier.toUpperCase()}（上限 {billingPlan.maxEffectRules} ルール）
          </span>
          <span className={`badge ${authMe.role === 'viewer' ? 'danger' : 'good'}`}>
            Role: {authMe.role}
          </span>
          <span className={`badge ${connectionState === 'connected' ? 'good' : 'danger'}`}>
            {connectionState === 'connected' ? 'サーバー接続中' : 'サーバー未接続'}
          </span>
          <span className={`badge ${state.platformErrors.length > 0 ? 'danger' : 'good'}`}>
            エラー {state.platformErrors.length}件
          </span>
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginBottom: 0 }}>運用開始チェック</h3>
            <div className="row">
              <span className={`badge ${onboardingProgress === 100 ? 'good' : ''}`}>
                進捗 {onboardingProgress}%
              </span>
              <button className="button secondary" onClick={startSetupWizard}>クイックセットアップ</button>
            </div>
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 6 }}>
            {onboardingChecks.map((check) => (
              <div key={check.id} className={`badge ${check.done ? 'good' : ''}`} style={{ display: 'block' }}>
                {check.done ? '✅' : '⬜️'} {check.label}
              </div>
            ))}
          </div>
        </div>
        {showSetupWizard && (
          <div className="card" style={{ border: '1px solid var(--border)' }}>
            <h3>クイックセットアップ（{wizardStep + 1}/3）</h3>
            {wizardStep === 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div className={`badge ${connectionState === 'connected' ? 'good' : 'danger'}`} style={{ display: 'block' }}>
                  {connectionState === 'connected'
                    ? 'サーバーに接続されています。'
                    : 'サーバー未接続です。先に API/Socket 起動を確認してください。'}
                </div>
                <small style={{ color: 'var(--muted)' }}>まずは接続状態を安定させると、その後の保存/反映が確実になります。</small>
              </div>
            )}
            {wizardStep === 1 && (
              <div className="stack" style={{ gap: 8 }}>
                <label>
                  参加キーワード
                  <input value={entryKeyword} onChange={(event) => setEntryKeyword(event.target.value)} />
                </label>
                <label>
                  辞退キーワード
                  <input value={leaveKeyword} onChange={(event) => setLeaveKeyword(event.target.value)} />
                </label>
                <label>
                  同時アクティブ人数
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxActiveParticipants}
                    onChange={(event) => setMaxActiveParticipants(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
            {wizardStep === 2 && (
              <div className="stack" style={{ gap: 8 }}>
                <small style={{ color: 'var(--muted)' }}>
                  最後にテンプレを1つ適用して「設定保存」を押せば、配信開始前の初期設定が完了です。
                </small>
                <div className="row">
                  {streamPresets.map((preset) => (
                    <button
                      key={preset.id}
                      className="button secondary"
                      onClick={() => applyStreamPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="button secondary" onClick={closeSetupWizard}>閉じる</button>
              <button
                className="button secondary"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
              >
                戻る
              </button>
              <button
                className="button"
                disabled={wizardStep === 2}
                onClick={() => setWizardStep((step) => Math.min(2, step + 1))}
              >
                次へ
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <button className="button secondary" onClick={() => void refreshRuntimeHealth()} disabled={healthStatus === 'checking'}>
            ランタイム再確認
          </button>
          {runtimeHealth && (
            <span className="badge">
              参加 {runtimeHealth.participants} / アクティブ {runtimeHealth.activeParticipants} / 投票 {runtimeHealth.hasActiveVote ? 'ON' : 'OFF'}
            </span>
          )}
          {healthCheckedAt && <span className="badge">更新: {new Date(healthCheckedAt).toLocaleTimeString()}</span>}
          {healthStatus === 'error' && <span className="badge danger">ランタイム確認に失敗しました</span>}
        </div>
        <div>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ marginBottom: 0 }}>運用開始チェック</h3>
            <div className="row">
              <span className={`badge ${onboardingProgress === 100 ? 'good' : ''}`}>
                進捗 {onboardingProgress}%
              </span>
              <button className="button secondary" onClick={startSetupWizard}>クイックセットアップ</button>
            </div>
          </div>
          <div className="stack" style={{ gap: 6, marginTop: 6 }}>
            {onboardingChecks.map((check) => (
              <div key={check.id} className={`badge ${check.done ? 'good' : ''}`} style={{ display: 'block' }}>
                {check.done ? '✅' : '⬜️'} {check.label}
              </div>
            ))}
          </div>
        </div>
        {showSetupWizard && (
          <div className="card" style={{ border: '1px solid var(--border)' }}>
            <h3>クイックセットアップ（{wizardStep + 1}/3）</h3>
            {wizardStep === 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div className={`badge ${connectionState === 'connected' ? 'good' : 'danger'}`} style={{ display: 'block' }}>
                  {connectionState === 'connected'
                    ? 'サーバーに接続されています。'
                    : 'サーバー未接続です。先に API/Socket 起動を確認してください。'}
                </div>
                <small style={{ color: 'var(--muted)' }}>まずは接続状態を安定させると、その後の保存/反映が確実になります。</small>
              </div>
            )}
            {wizardStep === 1 && (
              <div className="stack" style={{ gap: 8 }}>
                <label>
                  参加キーワード
                  <input value={entryKeyword} onChange={(event) => setEntryKeyword(event.target.value)} />
                </label>
                <label>
                  辞退キーワード
                  <input value={leaveKeyword} onChange={(event) => setLeaveKeyword(event.target.value)} />
                </label>
                <label>
                  同時アクティブ人数
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxActiveParticipants}
                    onChange={(event) => setMaxActiveParticipants(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
            {wizardStep === 2 && (
              <div className="stack" style={{ gap: 8 }}>
                <small style={{ color: 'var(--muted)' }}>
                  最後にテンプレを1つ適用して「設定保存」を押せば、配信開始前の初期設定が完了です。
                </small>
                <div className="row">
                  {streamPresets.map((preset) => (
                    <button
                      key={preset.id}
                      className="button secondary"
                      onClick={() => applyStreamPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="button secondary" onClick={closeSetupWizard}>閉じる</button>
              <button
                className="button secondary"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
              >
                戻る
              </button>
              <button
                className="button"
                disabled={wizardStep === 2}
                onClick={() => setWizardStep((step) => Math.min(2, step + 1))}
              >
                次へ
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <button className="button secondary" onClick={() => void refreshRuntimeHealth()} disabled={healthStatus === 'checking'}>
            ランタイム再確認
          </button>
          {runtimeHealth && (
            <span className="badge">
              参加 {runtimeHealth.participants} / アクティブ {runtimeHealth.activeParticipants} / 投票 {runtimeHealth.hasActiveVote ? 'ON' : 'OFF'}
            </span>
          )}
          {healthCheckedAt && <span className="badge">更新: {new Date(healthCheckedAt).toLocaleTimeString()}</span>}
          {healthStatus === 'error' && <span className="badge danger">ランタイム確認に失敗しました</span>}
        </div>
        {showSetupWizard && (
          <div className="card" style={{ border: '1px solid var(--border)' }}>
            <h3>クイックセットアップ（{wizardStep + 1}/3）</h3>
            {wizardStep === 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <div className={`badge ${connectionState === 'connected' ? 'good' : 'danger'}`} style={{ display: 'block' }}>
                  {connectionState === 'connected'
                    ? 'サーバーに接続されています。'
                    : 'サーバー未接続です。先に API/Socket 起動を確認してください。'}
                </div>
                <small style={{ color: 'var(--muted)' }}>まずは接続状態を安定させると、その後の保存/反映が確実になります。</small>
              </div>
            )}
            {wizardStep === 1 && (
              <div className="stack" style={{ gap: 8 }}>
                <label>
                  参加キーワード
                  <input value={entryKeyword} onChange={(event) => setEntryKeyword(event.target.value)} />
                </label>
                <label>
                  辞退キーワード
                  <input value={leaveKeyword} onChange={(event) => setLeaveKeyword(event.target.value)} />
                </label>
                <label>
                  同時アクティブ人数
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxActiveParticipants}
                    onChange={(event) => setMaxActiveParticipants(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
            {wizardStep === 2 && (
              <div className="stack" style={{ gap: 8 }}>
                <small style={{ color: 'var(--muted)' }}>
                  最後にテンプレを1つ適用して「設定保存」を押せば、配信開始前の初期設定が完了です。
                </small>
                <div className="row">
                  {streamPresets.map((preset) => (
                    <button
                      key={preset.id}
                      className="button secondary"
                      onClick={() => applyStreamPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="button secondary" onClick={closeSetupWizard}>閉じる</button>
              <button
                className="button secondary"
                disabled={wizardStep === 0}
                onClick={() => setWizardStep((step) => Math.max(0, step - 1))}
              >
                戻る
              </button>
              <button
                className="button"
                disabled={wizardStep === 2}
                onClick={() => setWizardStep((step) => Math.min(2, step + 1))}
              >
                次へ
              </button>
            </div>
          </div>
        )}
        <div className="row">
          <button className="button" disabled={!canWrite} onClick={() => void executeAction('マッチ終了', async () => api.post('/rotation/next-match'))}>
            マッチ終了
          </button>
          <button className="button secondary" disabled={!canWrite} onClick={() => void executeAction('ローテーション', async () => api.post('/rotation/rotate'))}>
            今すぐローテ
          </button>
        </div>
        <div>
          <h3>参加ルール</h3>
          <div className="stack" style={{ gap: 8 }}>
            <label>
              参加キーワード
              <input value={entryKeyword} onChange={(event) => setEntryKeyword(event.target.value)} />
            </label>
            <label>
              辞退キーワード
              <input value={leaveKeyword} onChange={(event) => setLeaveKeyword(event.target.value)} />
            </label>
            <label>
              同時アクティブ人数
              <input
                type="number"
                min={1}
                max={20}
                value={maxActiveParticipants}
                onChange={(event) => setMaxActiveParticipants(Number(event.target.value))}
              />
            </label>
          </div>
        </div>

        <div>
          <h3>配信テンプレート（ワンクリック）</h3>
          <small style={{ color: 'var(--muted)' }}>
            最初の運用向けの推奨セットです。適用後に「設定保存」で反映されます。
          </small>
          <div className="stack" style={{ marginTop: 8, gap: 8 }}>
            {streamPresets.map((preset) => (
              <div key={preset.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{preset.label}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{preset.description}</div>
                </div>
                <button className="button secondary" onClick={() => applyStreamPreset(preset.id)}>
                  このテンプレを適用
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ marginBottom: 0 }}>エフェクトルール</h3>
            <button className="button secondary" onClick={addRule} disabled={!canWrite}>ルール追加</button>
          </div>
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <small style={{ color: 'var(--muted)' }}>登録済みテンプレ</small>
              <div className="row">
                <button className="button secondary" onClick={exportTemplates}>エクスポート</button>
                <button className="button secondary" onClick={() => importInputRef.current?.click()}>インポート</button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json"
                  style={{ display: 'none' }}
                  onChange={(event) => void importTemplates(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              {effectPresets.map((preset) => (
                <button
                  key={preset.name}
                  className="button secondary"
                  onClick={() => removeTemplate(preset.name)}
                  title={builtInPresetNames.includes(preset.name) ? '組み込みテンプレは削除不可' : 'クリックで削除'}
                  disabled={builtInPresetNames.includes(preset.name)}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            {effectRules.map((rule, index) => (
              <div key={rule.id} className="row" style={{ alignItems: 'flex-end' }}>
                <label>
                  テンプレ
                  <select onChange={(event) => applyTemplate(index, event.target.value)} defaultValue="">
                    <option value="" disabled>選択</option>
                    {effectPresets.map((preset) => (
                      <option key={preset.name} value={preset.name}>{preset.name}</option>
                    ))}
                  </select>
                </label>
                <button className="button secondary" onClick={() => saveTemplateFromRule(index)}>テンプレ保存</button>

                <label style={{ flex: 1 }}>
                  キーワード
                  <input value={rule.keyword} onChange={(event) => updateRule(index, { keyword: event.target.value })} />
                </label>
                <label>
                  効果
                  <select
                    value={rule.effect}
                    onChange={(event) =>
                      updateRule(index, { effect: event.target.value as EffectRule['effect'] })
                    }
                  >
                    <option value="confetti">confetti</option>
                    <option value="shake">shake</option>
                    <option value="flash">flash</option>
                    <option value="gg-burst">gg-burst</option>
                  </select>
                </label>
                <label style={{ minWidth: 180 }}>
                  OBSシーン(任意)
                  <input
                    value={rule.obsSceneName ?? ''}
                    onChange={(event) => updateRule(index, { obsSceneName: event.target.value })}
                    placeholder="例: EffectScene"
                    disabled={rule.obsActionType === 'source-toggle'}
                  />
                </label>
                <label style={{ minWidth: 180 }}>
                  OBSソース(任意)
                  <input
                    value={rule.obsSourceName ?? ''}
                    onChange={(event) => updateRule(index, { obsSourceName: event.target.value })}
                    placeholder="例: EffectSource"
                    disabled={rule.obsActionType === 'scene-switch'}
                  />
                </label>
                <label>
                  OBSアクション
                  <select
                    value={rule.obsActionType ?? 'both'}
                    onChange={(event) =>
                      updateRule(index, {
                        obsActionType: event.target.value as EffectRule['obsActionType']
                      })
                    }
                  >
                    <option value="both">both</option>
                    <option value="scene-switch">scene-switch</option>
                    <option value="source-toggle">source-toggle</option>
                  </select>
                </label>
                <div className="row" style={{ gap: 6 }}>
                  <button className="button secondary" onClick={() => applyObsPreset(index, 'scene-switch')}>Scene</button>
                  <button className="button secondary" onClick={() => applyObsPreset(index, 'source-toggle')}>Source</button>
                  <button className="button secondary" onClick={() => applyObsPreset(index, 'both')}>Both</button>
                </div>
                <label className="row" style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(event) => updateRule(index, { enabled: event.target.checked })}
                  />
                  有効
                </label>
                <label className="row" style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={rule.obsSourceEnabled ?? true}
                    onChange={(event) => updateRule(index, { obsSourceEnabled: event.target.checked })}
                    disabled={rule.obsActionType === 'scene-switch'}
                  />
                  ソースON
                </label>
                <button className="button secondary" onClick={() => moveRule(index, -1)} disabled={index === 0}>↑</button>
                <button className="button secondary" onClick={() => moveRule(index, 1)} disabled={index === effectRules.length - 1}>↓</button>
                <button className="button danger" onClick={() => removeRule(index)}>削除</button>
              </div>
            ))}
          </div>
        </div>

        {ruleWarnings.length > 0 && (
          <div>
            <h3>入力チェック</h3>
            {ruleWarnings.map((warning) => (
              <div key={warning} className="badge danger" style={{ display: 'block', marginBottom: 6 }}>
                {warning}
              </div>
            ))}
          </div>
        )}

        <div className="row">
          <button className="button" onClick={saveSettings} disabled={saveStatus === 'saving' || !canWrite}>設定保存</button>
          {saveStatus !== 'idle' && (
            <span className={`badge ${saveStatus === 'error' ? 'danger' : 'good'}`}>{saveMessage}</span>
          )}
          {actionStatus !== 'idle' && (
            <span className={`badge ${actionStatus === 'error' ? 'danger' : 'good'}`}>{actionMessage}</span>
          )}
        </div>

        {state.platformErrors.length > 0 && (
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ marginBottom: 0 }}>接続エラー</h3>
              <button className="button secondary" onClick={clearPlatformErrors} disabled={!canWrite}>エラーをクリア</button>
            </div>
            {state.platformErrors.slice(0, 3).map((error) => (
              <div key={error} className="badge" style={{ display: 'block', marginBottom: 6 }}>
                {error}
              </div>
            ))}
          </div>
        )}

        {operationLogs.length > 0 && (
          <div>
            <h3>操作履歴（最新10件）</h3>
            {operationLogs.slice(0, 10).map((log, index) => (
              <div key={`${log.at}-${index}`} className="badge" style={{ display: 'block', marginBottom: 6 }}>
                {new Date(log.at).toLocaleTimeString()} [{log.action}] {log.detail}
              </div>
            ))}
          </div>
        )}

        {analyticsSummary && (
          <div>
            <h3>配信レポート（簡易）</h3>
            <div className="row">
              <span className="badge">待機 {analyticsSummary.participantsQueued}</span>
              <span className="badge">アクティブ {analyticsSummary.participantsActive}</span>
              <span className="badge">メッセージ {analyticsSummary.messagesInMemory}</span>
              <span className="badge">ユニーク視聴者 {analyticsSummary.uniqueChattersInMemory}</span>
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              <span className="badge">投票総数 {analyticsSummary.votesCast}</span>
              <span className="badge">エフェクト発火 {analyticsSummary.effectsTriggered}</span>
              <span className="badge">更新 {new Date(analyticsSummary.lastUpdatedAt).toLocaleTimeString()}</span>
            </div>
          </div>
        )}

        {!billingStatus.active && billingPlan.tier === 'pro' && (
          <div className="badge danger" style={{ display: 'block' }}>
            Proプランの請求状態が inactive です。更新系操作は無効化されています。
            {billingStatus.trialEndsAt ? `（Trial end: ${new Date(billingStatus.trialEndsAt).toLocaleDateString()}）` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
