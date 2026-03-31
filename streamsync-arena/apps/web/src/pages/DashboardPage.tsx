import { useEffect, useState } from 'react';
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
  const [layoutPreset, setLayoutPreset] = useState<'standard' | 'chat-first' | 'ops-first'>('standard');

  useEffect(() => {
    const saved = window.localStorage.getItem('streamsync.layoutPreset');
    if (saved === 'standard' || saved === 'chat-first' || saved === 'ops-first') {
      setLayoutPreset(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('streamsync.layoutPreset', layoutPreset);
  }, [layoutPreset]);

  return (
    <>
      <div className="layout-toolbar">
        <span className="badge">レイアウト</span>
        <select value={layoutPreset} onChange={(event) => setLayoutPreset(event.target.value as typeof layoutPreset)}>
          <option value="standard">標準（指揮官→参加者/コメント→投票）</option>
          <option value="chat-first">コメント優先（コメント/参加者→指揮官→投票）</option>
          <option value="ops-first">運用優先（指揮官/投票→参加者/コメント）</option>
        </select>
      </div>
      <div className="layout">
        {layoutPreset === 'standard' && (
          <>
            <div className="stack">
              <ControlsPanel state={state} connectionState={connectionState} />
            </div>
            <div className="stack">
              <ParticipantsPanel participants={state.participants} active={state.activeParticipants} />
              <ChatPanel messages={state.recentMessages} connectionState={connectionState} />
            </div>
          </>
        )}
        {layoutPreset === 'chat-first' && (
          <>
            <div className="stack">
              <ChatPanel messages={state.recentMessages} connectionState={connectionState} />
              <ParticipantsPanel participants={state.participants} active={state.activeParticipants} />
            </div>
            <div className="stack">
              <ControlsPanel state={state} connectionState={connectionState} />
            </div>
          </>
        )}
        {layoutPreset === 'ops-first' && (
          <>
            <div className="stack">
              <ControlsPanel state={state} connectionState={connectionState} />
              <VotePanel vote={state.voteSession} />
            </div>
            <div className="stack">
              <ParticipantsPanel participants={state.participants} active={state.activeParticipants} />
              <ChatPanel messages={state.recentMessages} connectionState={connectionState} />
            </div>
          </>
        )}
        <div className="stack vote-stack">
          {layoutPreset !== 'ops-first' && <VotePanel vote={state.voteSession} />}
        </div>
      </div>
    </>
  );
}
