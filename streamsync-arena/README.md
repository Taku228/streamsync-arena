# StreamSync Arena

StreamSync Arena は、配信者と視聴者がリアルタイムに参加できる参加型配信ツールの MVP 兼そのまま拡張しやすい本番向けベース実装です。

## できること

- `参加` コメントで自動エントリー
- 参加者キューの自動ローテーション
- 初参加 / リピーター表示
- コメントトリガーでエフェクト発火
- コメント投票
- 配信者向け指揮官画面
- OBS ブラウザドック / ブラウザソース向けオーバーレイ
- WebSocket によるリアルタイム同期
- SQLite による配信者ごとの履歴管理
- 複数配信プラットフォームを追加しやすい Adapter 設計
- ゲーム連携を追加しやすい Game Adapter 設計

## 技術スタック

- Frontend: React + Vite + TypeScript + Zustand + TanStack Query
- Backend: Fastify + Socket.IO + Zod + better-sqlite3
- Shared types: TypeScript package
- DB: SQLite

## セットアップ

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3001
- Overlay: http://localhost:5173/overlay

## 環境変数

`apps/server/.env.example` を `.env` にコピーしてください。

## OBS 連携

- 指揮官画面: `http://localhost:5173`
- オーバーレイ: `http://localhost:5173/overlay`
- OBS のカスタムドックやブラウザソースに登録可能

## 実装上の注意

- YouTube / Twitch / ニコニコの本番コメント取得は認証情報が必要なため、この実装では `MockPlatformAdapter` を同梱し、実運用用の差し替えポイントを `adapters/` に用意しています。
- Fortnite / Apex / Valorant のリアルタイム戦績 API は利用条件や API 仕様が変わるため、`GameStatsAdapter` インターフェースで差し替え可能にしています。
- 「リリースできる品質」を意識して、責務分離・型安全・UI 分割・保守性を重視した構成にしています。

## 今後追加すると良いもの

- OAuth ログイン
- マルチ配信者対応
- Redis / Postgres 化
- RBAC
- audit log
- E2E テスト
- OBS WebSocket 連携
- 本番用コメント / ゲーム API adapter
