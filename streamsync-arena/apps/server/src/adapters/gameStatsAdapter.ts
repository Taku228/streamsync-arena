export interface GameStatsAdapter {
  syncActiveParticipants(ids: string[]): Promise<Record<string, { kills: number; rank: number }>>;
}

export class MockGameStatsAdapter implements GameStatsAdapter {
  async syncActiveParticipants(ids: string[]) {
    return Object.fromEntries(
      ids.map((id) => [id, { kills: Math.floor(Math.random() * 8), rank: Math.ceil(Math.random() * 20) }])
    );
  }
}
