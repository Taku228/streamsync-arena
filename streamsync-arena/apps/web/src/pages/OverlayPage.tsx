import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';
import { useDashboardStore } from '../store/useDashboardStore';

export function OverlayPage() {
  useRealtimeDashboard();
  const state = useDashboardStore((s) => s.state);
  const lastEvent = useDashboardStore((s) => s.lastOverlayEvent);

  return (
    <div className="overlay-root">
      <div className="overlay-top">
        <div className="overlay-panel">
          <h3>参加者</h3>
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
            {state.voteSession.options.map((option) => (
              <div key={option.id} className="participant-item">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{option.label}</span>
                  <strong>{option.votes}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lastEvent?.type === 'effect.triggered' && (
        <div className="effect-banner">
          {lastEvent.payload.userName}: {lastEvent.payload.text} / {lastEvent.payload.effect}
        </div>
      )}
    </div>
  );
}
