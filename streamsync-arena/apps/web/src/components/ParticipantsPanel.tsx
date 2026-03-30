import type { Participant } from '@streamsync/shared';
import { api } from '../lib/api';

export function ParticipantsPanel({ participants, active }: { participants: Participant[]; active: Participant[] }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2>参加者管理</h2>
        <div className="row">
          <span className="badge good">アクティブ {active.length}</span>
          <span className="badge">待機 {participants.filter((p) => p.status === 'queued').length}</span>
        </div>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>名前</th>
            <th>状態</th>
            <th>優先</th>
            <th>戦績</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={participant.id}>
              <td>
                <div>{participant.displayName}</div>
                <div className="row">
                  {participant.isFirstTimer && <span className="badge good">初参加</span>}
                  {participant.membership && <span className="badge">メンバー</span>}
                  {participant.gifted && <span className="badge">ギフト</span>}
                </div>
              </td>
              <td>{participant.status}</td>
              <td>{participant.priorityScore}</td>
              <td>
                K {participant.kills ?? '-'} / #{participant.rank ?? '-'}
              </td>
              <td>
                <button
                  className="button danger"
                  onClick={() => api.post(`/participants/${participant.id}/ban`)}
                  disabled={participant.status === 'banned'}
                >
                  追放
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
