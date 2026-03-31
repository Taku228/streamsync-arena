import { useEffect, useMemo } from 'react';
import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';
import { useDashboardStore } from '../store/useDashboardStore';

export function OverlayPage() {
  useRealtimeDashboard();
  const state = useDashboardStore((s) => s.state);
  const lastEvent = useDashboardStore((s) => s.lastOverlayEvent);
  const connectionState = useDashboardStore((s) => s.connectionState);
  const voteSession = state.voteSession;

  const totalVotes = useMemo(
    () => voteSession?.options.reduce((total, option) => total + option.votes, 0) ?? 0,
    [voteSession]
  );

  useEffect(() => {
    document.body.classList.add('overlay-mode');
    return () => document.body.classList.remove('overlay-mode');
  }, []);

  return (
    <div className="overlay-root">
      <div className="overlay-top">
        <div className="overlay-panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3 style={{ marginBottom: 0 }}>参加者</h3>
            <span className={`badge ${connectionState === 'connected' ? 'good' : 'danger'}`}>
              {connectionState === 'connected' ? '接続中' : '未接続'}
            </span>
          </div>
          {connectionState === 'disconnected' && (
            <div className="overlay-empty">サーバー接続待ちです。起動状態を確認してください。</div>
          )}
          {state.activeParticipants.length === 0 && <div className="overlay-empty">参加待機中…</div>}
          {state.activeParticipants.map((participant) => (
            <div
              className={`participant-item ${participant.isFirstTimer ? 'first-timer' : ''}`}
              key={participant.id}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{participant.displayName}</strong>
                {participant.isFirstTimer && <span className="badge good">初参加</span>}
              </div>
              <div style={{ color: 'var(--muted)' }}>
                K {participant.kills ?? '-'} / Rank #{participant.rank ?? '-'}
              </div>
            </div>
          ))}
        </div>

        {voteSession && (
          <div className="overlay-panel">
            <h3>{voteSession.title}</h3>
            {voteSession.options.map((option) => {
              const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
              const isWinner = !voteSession.active
                && option.votes > 0
                && option.votes === Math.max(...voteSession.options.map((item) => item.votes));
              return (
                <div key={option.id} className={`participant-item vote-option ${isWinner ? 'winner' : ''}`}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{option.label}</span>
                    <strong>{option.votes}票 ({percent}%)</strong>
                  </div>
                  <div className="progress" style={{ marginTop: 6 }}>
                    <div style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {lastEvent?.type === 'effect.triggered' && (
        <div className="effect-banner">
          {lastEvent.payload.userName}: {lastEvent.payload.text}
        </div>
      )}
    </div>
  );
}
