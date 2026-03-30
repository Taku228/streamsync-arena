import { useMemo } from 'react';
import { api } from '../lib/api';
import type { DashboardState } from '@streamsync/shared';

export function ControlsPanel({ state }: { state: DashboardState }) {
  const nextRotation = useMemo(() => {
    const rotateEvery = state.settings.rotation.rotateEveryMatches;
    return rotateEvery - (state.matchCounter % rotateEvery || rotateEvery);
  }, [state.matchCounter, state.settings.rotation.rotateEveryMatches]);

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
          <div className="row">
            <span className="badge">参加キーワード: {state.settings.entryKeyword}</span>
            <span className="badge">辞退キーワード: {state.settings.leaveKeyword}</span>
          </div>
        </div>
        {state.platformErrors.length > 0 && (
          <div>
            <h3>接続エラー</h3>
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
