import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { DashboardState, EffectRule } from '@streamsync/shared';

type EffectPreset = {
  name: string;
  keyword: string;
  effect: EffectRule['effect'];
  obsActionType: NonNullable<EffectRule['obsActionType']>;
};

export function ControlsPanel({ state }: { state: DashboardState }) {
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
    const id = String(Date.now());
    setEffectRules((prev) => [...prev, { id, keyword: '新ワード', effect: 'flash', enabled: true, obsSceneName: '', obsSourceName: '', obsSourceEnabled: true, obsActionType: 'both' }]);
  }

  function removeRule(index: number) {
    setEffectRules((prev) => prev.filter((_, idx) => idx !== index));
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

  async function clearPlatformErrors() {
    await api.post('/platform/errors/clear');
  }

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
    setEffectPresets((prev) => [...prev, ...deduped]);
    setSaveStatus('done');
    setSaveMessage(`テンプレを${deduped.length}件取り込みました。`);
  }


  return (
    <div className="card">
      <h2>指揮官画面</h2>
      <div className="stack">
        <div className="row">
          <span className="badge">マッチ数 {state.matchCounter}</span>
          <span className="badge">次回ローテまで {nextRotation}</span>
        </div>
        <div className="row">
          <button className="button" onClick={() => api.post('/rotation/next-match')}>マッチ終了</button>
          <button className="button secondary" onClick={() => api.post('/rotation/rotate')}>今すぐローテ</button>
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
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ marginBottom: 0 }}>エフェクトルール</h3>
            <button className="button secondary" onClick={addRule}>ルール追加</button>
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
                  style={{ display: "none" }}
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
          <button className="button" onClick={saveSettings} disabled={saveStatus === 'saving'}>設定保存</button>
          {saveStatus !== 'idle' && (
            <span className={`badge ${saveStatus === 'error' ? 'danger' : 'good'}`}>{saveMessage}</span>
          )}
        </div>

        {state.platformErrors.length > 0 && (
          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h3 style={{ marginBottom: 0 }}>接続エラー</h3>
              <button className="button secondary" onClick={clearPlatformErrors}>エラーをクリア</button>
            </div>
            {state.platformErrors.slice(0, 3).map((error) => (
              <div key={error} className="badge" style={{ display: 'block', marginBottom: 6 }}>
                {error}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
