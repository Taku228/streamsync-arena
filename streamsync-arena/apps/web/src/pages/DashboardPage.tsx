import { useRealtimeDashboard } from '../hooks/useRealtimeDashboard';
import { useDashboardStore } from '../store/useDashboardStore';
import { ParticipantsPanel } from '../components/ParticipantsPanel';
import { ChatPanel } from '../components/ChatPanel';
import { VotePanel } from '../components/VotePanel';
import { ControlsPanel } from '../components/ControlsPanel';

export function DashboardPage() {
  useRealtimeDashboard();
  const state = useDashboardStore((s) => s.state);
  const connectionState = useDashboardStore((s) => s.connectionState);

  return (
    <div className="layout">
      <div className="stack">
        <ControlsPanel state={state} connectionState={connectionState} />
      </div>
      <div className="stack">
        <ParticipantsPanel participants={state.participants} active={state.activeParticipants} />
        <ChatPanel messages={state.recentMessages} connectionState={connectionState} />
      </div>
      <div className="stack vote-stack">
        <VotePanel vote={state.voteSession} />
      </div>
    </div>
  );
}
