import type { ChatMessage } from '@streamsync/shared';
import { reconnectSocket } from '../lib/socket';

export function ChatPanel({
  messages,
  connectionState
}: {
  messages: ChatMessage[];
  connectionState: 'connected' | 'disconnected';
}) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ marginBottom: 0 }}>ライブコメント</h2>
        <span className={`badge ${connectionState === 'connected' ? 'good' : 'danger'}`}>
          {connectionState === 'connected' ? '接続中' : '未接続'}
        </span>
      </div>
      {messages.length === 0 && (
        <div className="row" style={{ color: 'var(--muted)', marginTop: 8 }}>
          <span>{connectionState === 'connected' ? 'コメント待機中…' : 'サーバー接続待ちです。'}</span>
          {connectionState === 'disconnected' && (
            <button className="button secondary" onClick={reconnectSocket}>再接続</button>
          )}
        </div>
      )}
      {messages.map((message) => (
        <div className="chat-item" key={message.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{message.userName}</strong>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{message.platform}</span>
          </div>
          <div>{message.message}</div>
        </div>
      ))}
    </div>
  );
}
