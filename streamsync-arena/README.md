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

## 運用ドキュメント

- テスト手順（詳細）: `TESTING_GUIDE.md`
- 公開までの実行計画: `RELEASE_PLAN.md`

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


## 商品として公開するための最小チェックリスト

最短で公開したい場合は、以下の3系統に分けると運用しやすくなります。

1. Web（`apps/web`）を静的ホスティングへ配置
   - 例: Vercel / Netlify / Cloudflare Pages
   - `npm run build -w @streamsync/web` で `dist` を生成
2. API（`apps/server`）を Node 常駐環境へ配置
   - 例: Render / Fly.io / Railway / VPS
   - `CORS_ORIGIN` を Web 公開ドメインに合わせる
3. 配信PC（OBS）から公開済み `overlay` URL を読み込み

### 本番公開前の確認コマンド

```bash
npm run lint -w @streamsync/server
npm run lint -w @streamsync/web
npm run build -w @streamsync/server
npm run build -w @streamsync/web
npm run test -w @streamsync/server
```

### 本番運用で追加推奨

- SQLite から Postgres 等への移行（同時接続・バックアップ対策）
- OAuth ログイン
- audit log
- E2E テスト

### 課金ステータス連携（Webhook）

課金状態を外部システムから更新する場合は、サーバーの `.env` に以下を設定します。

- `BILLING_WEBHOOK_SECRET`（必須）
- `BILLING_WEBHOOK_SIGNING_SECRET`（任意 / 署名検証したい場合）

#### 汎用Webhook

- `POST /billing/webhook`
- Header: `x-billing-secret: <BILLING_WEBHOOK_SECRET>`
- Body:

```json
{
  "active": true,
  "trialEndsAt": "2028-01-01T00:00:00.000Z"
}
```

#### Stripe形式Webhook（簡易マッピング）

- `POST /billing/webhook/stripe`
- Header: `x-billing-secret: <BILLING_WEBHOOK_SECRET>`
- Header(任意): `x-billing-signature: <HMAC-SHA256(JSON body)>`
- 対応イベント:
  - `customer.subscription.created`
  - `customer.subscription.updated`

`status` が `active` / `trialing` のとき `active=true` にマッピングされます。

#### Stripe形式Webhookの検証用コマンド例

```bash
BODY='{"type":"customer.subscription.updated","data":{"object":{"status":"trialing","current_period_end":1893456000}}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$BILLING_WEBHOOK_SIGNING_SECRET" -hex | sed 's/^.* //')

curl -X POST http://localhost:3001/billing/webhook/stripe \
  -H "content-type: application/json" \
  -H "x-billing-secret: $BILLING_WEBHOOK_SECRET" \
  -H "x-billing-signature: $SIG" \
  -d "$BODY"
```

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
   cp apps/web/.env.example apps/web/.env
   ```
3. 最初はモックで起動（おすすめ）
   - `.env` の `CHAT_PLATFORM=mock` のまま
   - 手動確認をしやすくする場合は `MOCK_AUTO_MESSAGES=false`
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
   - `.env` の `OBS_WS_URL` / `OBS_WS_PASSWORD` を設定
7. OBSを別PCで使う場合（任意）
   - `apps/web/.env` の `VITE_API_BASE_URL` / `VITE_SOCKET_URL` を
     サーバーPCのアドレス（例: `http://192.168.1.10:3001`）に変更

わからない値がある場合は、空欄のままで `mock` モードから始めて大丈夫です。


## Windows で `npm ci` / `lint` が失敗するとき

### 症状1: `npm ci` で `EPERM: operation not permitted, unlink ... rollup.win32-x64-msvc.node`

`rollup.win32-x64-msvc.node` が他プロセスに掴まれているケースが多いです。

1. `npm run dev` や Vite/Node プロセスをすべて停止
2. VSCode のターミナルや拡張（TS Server）を再起動
3. 必要なら Windows Defender/アンチウイルスのリアルタイムスキャン対象からプロジェクトを除外
4. リポジトリ **ルート**（`streamsync-arena`）で再実行

```powershell
taskkill /F /IM node.exe
rd /s /q node_modules
del package-lock.json
npm install
```

> `npm ci` は lock と実体の不整合に厳密なため、開発中は `npm install` で復旧する方が安定することがあります。

### 症状2: `npm run lint -w @streamsync/web` で `'tsc' は ... 認識されていません`

これはほぼ「依存インストール未完了」が原因です（上記 `EPERM` で中断すると発生）。

1. 依存のインストール成功を確認
2. ルートで以下を実行

```powershell
npm run lint -w @streamsync/web
```

それでも失敗する場合は、暫定的に次でも確認できます。

```powershell
npm exec -w @streamsync/web tsc -- --noEmit -p tsconfig.json
```


> 注: 現在のOBS連携は「基礎実装」です。シーン切替と投票ソース表示ON/OFFを提供します。
