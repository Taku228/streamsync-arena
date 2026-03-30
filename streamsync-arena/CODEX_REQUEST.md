# StreamSync Arena: Codex 実装依頼書

## 依頼の前提
このプロジェクトは、配信者向けの参加型配信支援ツール **StreamSync Arena** です。  
すでに雛形や既存コードがあります。  
**ゼロから作り直さず、既存コードを活かして段階的に改善してください。**

私は初心者です。  
そのため、実装や変更内容の説明はできるだけわかりやすくしてください。

---

## 今回の最重要目的
現在はモック実装中心の状態です。  
これを、**YouTube / Twitch の実コメント連携を中心に、本番運用に近い構成へ改善**してください。

---

## 優先順位
以下の順で進めてください。

1. YouTube Live コメント取得の本実装
2. Twitch コメント取得の本実装
3. コメントを共通形式に正規化する基盤整備
4. 参加管理（「参加」「辞退」など）を本番コメントで動作させる
5. 投票機能を本番コメントで動作させる
6. コメント連動エフェクトを本番コメントで動作させる
7. OBS Browser Source で安定表示できる overlay 品質改善
8. OBS WebSocket 連携
9. 設定保存とエラーハンドリング強化
10. テスト追加

---

## このアプリのコンセプト
- 配信者と視聴者がリアルタイムに連動する参加型配信ツール
- 視聴者コメントで参加管理、投票、演出が動く
- OBS 上に overlay として表示できる
- 将来的には Electron 化も視野に入れるが、今回はまだ不要
- 今回はまず Web アプリとして完成度を上げる

---

## 必須要件
以下は必ず守ってください。

- TypeScript strict mode 前提
- `any` は極力使わない
- Adapter パターンを維持する
- プラットフォーム差異は共通イベントモデルで吸収する
- Adapter 層にビジネスロジックを書かない
- ビジネスロジックは `services / domain / repositories` に分離する
- API 入出力はバリデーションする
- 外部 API エラーでサーバーが落ちないようにする
- エラー状態は UI に表示できるようにする
- 機密情報をログ出力しない
- 既存の mock adapter は壊さず残す
- 大きく壊さず、小さく安全に進める
- 一度に全部を書き換えない
- 破壊的変更をする場合は理由を書く
- 実装後はローカル起動手順も必ず書く

---

## 実装の最終ゴール
以下が動く状態にしてください。

- YouTube / Twitch の実コメントを取得できる
- コメント `参加` で参加キューに入る
- コメント `辞退` で離脱できる
- 初参加ユーザーを判定してハイライト表示できる
- コメント投票を集計できる
- 特定ワード（例: `GG`, `ドンマイ`, `8888`）で演出が発火する
- overlay が OBS Browser Source で実用可能
- OBS WebSocket によるシーン / ソース制御の基礎がある
- 主要ロジックに自動テストがある

---

## 共通イベントモデル
全プラットフォームのコメントは、以下の共通形式に正規化してください。

```ts
type ChatPlatform = 'youtube' | 'twitch' | 'mock';

type NormalizedChatMessage = {
  id: string;
  platform: ChatPlatform;
  streamId: string;
  userId: string;
  userName: string;
  displayName: string;
  message: string;
  timestamp: number;

  badges?: string[];
  isMember?: boolean;
  isModerator?: boolean;
  isSubscriber?: boolean;
  isGifted?: boolean;

  avatarUrl?: string;
  raw?: unknown;
};