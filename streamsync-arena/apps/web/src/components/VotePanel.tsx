import { useMemo, useState } from 'react';
import type { VoteSession } from '@streamsync/shared';
import { api } from '../lib/api';

export function VotePanel({ vote }: { vote: VoteSession | null }) {
  const [title, setTitle] = useState('次のステージを決めよう');
  const [options, setOptions] = useState('ステージA,ステージB,ステージC');

  const total = useMemo(() => vote?.options.reduce((sum, item) => sum + item.votes, 0) ?? 0, [vote]);

  return (
    <div className="card">
      <h2>視聴者投票</h2>
      <div className="stack">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="投票タイトル" />
        <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="カンマ区切り" />
        <div className="row">
          <button
            className="button"
            onClick={() => api.post('/votes', { title, options: options.split(',').map((s) => s.trim()).filter(Boolean) })}
          >
            投票開始
          </button>
          <button className="button secondary" onClick={() => api.post('/votes/close')}>
            締切
          </button>
        </div>

        {vote && (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{vote.title}</strong>
              <span className={`badge ${vote.active ? 'good' : ''}`}>{vote.active ? '受付中' : '終了'}</span>
            </div>
            {vote.options.map((option) => {
              const ratio = total ? (option.votes / total) * 100 : 0;
              return (
                <div key={option.id}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span>{option.label}</span>
                    <strong>{option.votes}</strong>
                  </div>
                  <div className="progress"><div style={{ width: `${ratio}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
