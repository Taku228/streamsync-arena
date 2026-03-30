import { useMemo } from 'react';
import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';
import { useDashboardStore } from '../store/useDashboardStore';

export function OverlayPage() {
  useRealtimeDashboard();
  const state = useDashboardStore((s) => s.state);
  const lastEvent = useDashboardStore((s) => s.lastOverlayEvent);

  const totalVotes = useMemo(
    () => state.voteSession?.options.reduce((total, option) => total + option.votes, 0) ?? 0,
    [state.voteSession]
  );

  return (
    <div className="overlay-root">
      <div className="overlay-top">
        <div className="overlay-panel">
          <h3>参加者</h3>
          {state.activeParticipants.length === 0 && <div className="overlay-empty">参加待機中…</div>}
          {state.activeParticipants.map((participant) => (
            <div className="participant-item" key={participant.id}>
              <strong>{participant.displayName}</strong>
              <div style={{ color: 'var(--muted)' }}>
                K {participant.kills ?? '-'} / Rank #{participant.rank ?? '-'}
              </div>
            </div>
          ))}
        </div>

        {state.voteSession && (
          <div className="overlay-panel">
            <h3>{state.voteSession.title}</h3>
            {state.voteSession.options.map((option) => {
              const percent = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
              return (
                <div key={option.id} className="participant-item">
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{option.label}</span>
                    <strong>{option.votes}</strong>
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
