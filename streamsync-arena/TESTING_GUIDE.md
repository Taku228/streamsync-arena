# StreamSync Arena テスト準備・項目・方法ガイド

このドキュメントは、ローカル環境で StreamSync Arena を検証するための
**準備方法 / テスト項目 / 実施方法 / OK・NG判定** をまとめたものです。

---

## 1. テスト前の準備

## 1-1. 必要ソフト
- Node.js 20 以上推奨
- npm
- （任意）OBS Studio + OBS WebSocket

## 1-2. 依存インストール
```bash
npm install
```

## 1-3. 環境変数ファイル作成
```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
```

### 最低限の推奨設定（最初の動作確認）
- `apps/server/.env`
  - `CHAT_PLATFORM=mock`
  - `OBS_WS_ENABLED=false`（OBS未使用時）
  - `APP_PLAN_TIER=free`
  - `BILLING_ACTIVE=true`
- `apps/web/.env`
  - `VITE_API_BASE_URL=http://localhost:3001`
  - `VITE_SOCKET_URL=http://localhost:3001`

## 1-4. 起動
```bash
npm run dev
```

---

## 2. 自動テスト（必須）

## 2-1. サーバーユニットテスト
```bash
npm run test -w @streamsync/server
```

### OK判定
- `pass` が全件
- `fail` が 0

### NG判定
- 1件でも `fail` がある
- テスト実行自体がエラーで停止する

## 2-2. 型チェック・ビルド
```bash
npm run lint -w @streamsync/server
npm run lint -w @streamsync/web
npm run build -w @streamsync/server
npm run build -w @streamsync/web
```

### OK判定
- すべて終了コード 0

### NG判定
- TypeScript エラー
- ビルド失敗

---

## 3. 手動テスト（推奨）

## 3-1. 基本接続
### 手順
1. Webを開く（`http://localhost:5173`）
2. 指揮官画面で接続バッジを確認

### OK判定
- 「サーバー接続中」表示
- エラー件数が異常増加しない

### NG判定
- 常に未接続
- エラー表示が継続

## 3-2. 参加・辞退フロー（mock）
### 手順
0. 必要なら `apps/server/.env` で速度調整
   - `MOCK_MESSAGE_INTERVAL_MS=3500`
   - `MOCK_MESSAGE_START_DELAY_MS=1200`
1. 指揮官画面の「参加コメントを送信」ボタンを押す
2. 参加者管理に対象ユーザーが追加されることを確認
3. 「辞退コメントを送信」ボタンを押す
4. 参加者管理から対象ユーザーが外れることを確認

### OK判定
- 参加でキュー追加
- 辞退で対象がキューから消える

### NG判定
- キーワード反応しない
- 別ユーザーが誤って削除される

## 3-3. エフェクトルール
### 手順
1. ルール追加・編集
2. 保存
3. 再読み込み後に内容保持を確認

### OK判定
- ルールが保存される
- バリデーション（必須OBS項目）が正しく動く

### NG判定
- 保存しても消える
- 不正ルールが保存できてしまう

## 3-4. RBAC（viewer/operator）
### 事前設定
- `OPERATOR_TOKEN`, `VIEWER_TOKEN` を `apps/server/.env` に設定
- `apps/web/.env` の `VITE_OPERATOR_TOKEN` を必要に応じて切替

#### 設定例（そのままコピペ可）
`apps/server/.env`
```env
OPERATOR_TOKEN=op_local_123
VIEWER_TOKEN=view_local_123
```

`apps/web/.env`（Viewerとして確認したい時は空にする）
```env
VITE_OPERATOR_TOKEN=op_local_123
```

### 手順
1. Viewerトークンでアクセス
2. 保存/ローテーションなど更新系操作を試行
3. Operatorトークンで同操作を試行

### OK判定
- Viewer: 更新系操作が無効 or APIで拒否
- Operator: 更新系操作が成功

### NG判定
- Viewerが更新可能
- Operatorでも拒否される

## 3-5. Billingステータスガード（Pro）
### 事前設定
- `APP_PLAN_TIER=pro`
- `BILLING_ACTIVE=false`

### 手順
1. 設定保存・ローテーションなど更新系操作
2. `BILLING_ACTIVE=true` に変更して再試行

### OK判定
- inactive時: 更新系が拒否（API 402 相当）
- active時: 更新系が通る

### NG判定
- inactiveでも更新できる
- activeでも更新できない

## 3-6. Billing Webhook
### 汎用Webhook
```bash
curl -X POST http://localhost:3001/billing/webhook \
  -H "content-type: application/json" \
  -H "x-billing-secret: $BILLING_WEBHOOK_SECRET" \
  -d '{"active":true,"trialEndsAt":"2028-01-01T00:00:00.000Z"}'
```

### Stripe形式Webhook（署名あり）
```bash
BODY='{"type":"customer.subscription.updated","data":{"object":{"status":"trialing","current_period_end":1893456000}}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$BILLING_WEBHOOK_SIGNING_SECRET" -hex | sed 's/^.* //')

curl -X POST http://localhost:3001/billing/webhook/stripe \
  -H "content-type: application/json" \
  -H "x-billing-secret: $BILLING_WEBHOOK_SECRET" \
  -H "x-billing-signature: $SIG" \
  -d "$BODY"
```

### OK判定
- 正しいシークレット/署名で `ok: true`
- Billing状態が更新される

### NG判定
- 正しい情報でも401
- 更新後の状態が反映されない

## 3-7. OBS連携（任意）
### 事前設定
- OBS WebSocket有効化
- `OBS_WS_URL`, `OBS_WS_PASSWORD` 設定

### OK判定
- エフェクト/投票連動でOBS操作が実行される

### NG判定
- 常時接続失敗
- 連携時にサーバー側エラー連発

---

## 4. 不具合報告テンプレ

不具合時は以下を共有してください。

- 実行日時
- 使った環境変数（秘匿値は伏せる）
- 実行コマンド
- 期待結果
- 実際結果
- エラーログ（サーバー/ブラウザ）

この情報があると再現と修正が速くなります。
