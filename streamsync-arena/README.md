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

## 実コメント連携（YouTube / Twitch）

`apps/server/.env.example` をコピーし、`CHAT_PLATFORM` を切り替えるとコメント取得元を選べます。

```bash
cp apps/server/.env.example apps/server/.env
```

### YouTube Live

- `CHAT_PLATFORM=youtube`
- `YOUTUBE_API_KEY`
- `YOUTUBE_LIVE_CHAT_ID`

サーバーは YouTube Data API v3 の `liveChat/messages` をポーリングして、共通形式へ正規化してから既存ロジックへ流します。

### Twitch

- `CHAT_PLATFORM=twitch`
- `TWITCH_CHANNEL`
- `TWITCH_BOT_USERNAME`
- `TWITCH_OAUTH_TOKEN`

サーバーは `wss://irc-ws.chat.twitch.tv` に接続して IRC `PRIVMSG` を共通形式へ正規化して処理します。

### 共通イベントモデル

内部では `NormalizedChatMessage`（`platform / streamId / userId / message / badges ...`）に変換して、
参加・投票・エフェクトの既存ビジネスロジックをそのまま動かしています。



## 初心者向け: あなたがやること（手順）

以下だけ実施すれば、まずは動作確認できます。

1. 依存インストール
   ```bash
   npm install
   ```
2. 環境変数ファイル作成
   ```bash
   cp apps/server/.env.example apps/server/.env
   ```
3. 最初はモックで起動（おすすめ）
   - `.env` の `CHAT_PLATFORM=mock` のまま
   ```bash
   npm run dev
   ```
4. YouTube で試す場合
   - `.env` の `CHAT_PLATFORM=youtube`
   - `YOUTUBE_API_KEY` と `YOUTUBE_LIVE_CHAT_ID` を設定
5. Twitch で試す場合
   - `.env` の `CHAT_PLATFORM=twitch`
   - `TWITCH_CHANNEL` / `TWITCH_BOT_USERNAME` / `TWITCH_OAUTH_TOKEN` を設定
6. OBS 連携を使う場合（任意）
   - OBSで WebSocket Server を有効化
   - `.env` の `OBS_WS_URL` を設定（パスワード認証は現在未対応）

わからない値がある場合は、空欄のままで `mock` モードから始めて大丈夫です。


> 注: 現在のOBS連携は「基礎実装」です。シーン切替と投票ソース表示ON/OFFの最小機能を提供します。
