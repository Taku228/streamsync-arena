import type { ChatMessage } from '@streamsync/shared';

export function ChatPanel({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="card">
      <h2>ライブコメント</h2>
      {messages.map((message) => (
        <div className="chat-item" key={message.id}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>{message.userName}</strong>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>{message.platform}</span>
          </div>
          <div>{message.text}</div>
        </div>
      ))}
    </div>
  );
}
