---
name: streamtalker-context
description: StreamTalker プロジェクト固有のドメイン知識（アーキテクチャ、ファイル構成、実装パターン、型定義の場所）を提供するスキル。typescript-electron-coder など汎用コーディングエージェントに context として渡す目的で使用する。Read this skill before implementing any feature in the StreamTalker project.
tools: Read
---

このドキュメントを読んだ後、内容をコーディングエージェントへの context として提供してください。実装自体はこのスキルでは行いません。

---

# StreamTalker プロジェクトコンテキスト

## プロジェクト基本情報

- **技術スタック**: TypeScript, Electron, Vite, Vitest
- **用途**: 配信でくちぱくをするアプリ（リップシンク）。OBS の BrowserSource で使用する。
- **テスト実行コマンド**: `npm test`（プロジェクトルートで実行）

---

## ファイル構成

```
src/
  main/               # Electron メインプロセス
    index.ts          # エントリーポイント（ウィンドウ生成）
    windowManager.ts  # BrowserWindow の生成・管理
    ipcHandlers.ts    # IPC ハンドラ（設定の読み書き）
    configStore.ts    # electron-store ラッパー（設定永続化）
    server.ts         # プレビュー用静的ファイルサーバー（port 3000）
    preload.ts        # contextBridge でレンダラーに IPC を公開
    configStore.test.ts
    server.test.ts
  renderer/           # プレビューウィンドウ（Canvas 描画）
    index.ts          # エントリーポイント（Electron / OBS 両モード）
    FaceRenderer.ts   # Canvas への顔画像描画クラス
    FaceRenderer.test.ts
    AudioAnalyser.ts  # Web Audio API でマイク音量を解析
    AudioAnalyser.test.ts
    BlinkStateMachine.ts  # 瞬きアニメーション状態機械
    BlinkStateMachine.test.ts
    StateManager.ts   # FaceState を管理（リップシンク + 瞬き）
    ipcClient.ts      # renderer から IPC を呼ぶクライアント（OBS では HTTP ポーリング）
  control/            # コントロールウィンドウ（設定 UI）
    index.ts          # エントリーポイント
    index.test.ts
    SettingsPanel.ts  # 感度・瞬き設定スライダーコンポーネント
    AudioDeviceSelector.ts  # マイクデバイス選択コンポーネント
    ImagePicker.ts    # 顔画像選択コンポーネント
    index.html        # コントロールウィンドウ HTML
  shared/             # 型定義・定数（main / renderer / control で共有）
    types.ts          # AppConfig, FaceState, ImageConfig, ImageStateKey
    constants.ts      # DEFAULT_CONFIG, FFT_SIZE, PREVIEW_SERVER_PORT
    ipcEvents.ts      # IPC チャンネル名定数
  test/
    setup.ts          # Vitest グローバルセットアップ
```

---

## 主要な型定義（`src/shared/types.ts`）

```typescript
// 口・目の状態
type MouthState = 'open' | 'half' | 'closed';
type EyeState   = 'open' | 'half' | 'closed';

// 画像キーの型（テンプレートリテラル型）
type ImageStateKey = `${MouthState}_${EyeState}`;

// 顔全体の状態
interface FaceState {
  mouth: MouthState;
  eye: EyeState;
}

// 画像設定（9 パターンのファイルパス、'closed_open' と 'open_open' のみ必須）
interface ImageConfig {
  'closed_open': string;   // 口閉・目開（ニュートラル）
  'open_open': string;     // 口開・目開（発話中）
  'half_open'?: string;
  'closed_half'?: string;
  'closed_closed'?: string;
  'open_half'?: string;
  'open_closed'?: string;
  'half_half'?: string;
  'half_closed'?: string;
}

// アプリ全体の設定
interface AppConfig {
  images: ImageConfig;
  audioDeviceId: string | null;   // null = デフォルトデバイス
  threshold: number;               // 口開閉の音量閾値 (0.0 ~ 1.0)
  smoothingTimeConstant: number;   // 音量平滑化係数
  pollingInterval: number;         // AnalyserNode読み取り間隔 (ms)
  lipSyncCycleMs: number;          // リップシンク1ステップの時間 (ms)
  backgroundColor: string;         // Canvas 背景色（OBS クロマキー用）
  blinkIntervalBase: number;       // 瞬き間隔の基準値 (ms)
  blinkIntervalVariance: number;   // 瞬き間隔のばらつき (ms)
  blinkTransitionDuration: number; // 瞬き遷移時間 (ms)
}
```

---

## デフォルト設定（`src/shared/constants.ts`）

```typescript
// DEFAULT_CONFIG の型は Omit<AppConfig, 'images'>
export const DEFAULT_CONFIG: Omit<AppConfig, 'images'> = {
  audioDeviceId: null,
  threshold: 0.15,
  smoothingTimeConstant: 0.3,
  pollingInterval: 50,
  lipSyncCycleMs: 150,
  backgroundColor: '#00FF00',
  blinkIntervalBase: 4000,
  blinkIntervalVariance: 2000,
  blinkTransitionDuration: 80,
};
```

**重要**: すべてのデフォルト値は `DEFAULT_CONFIG` から参照すること。ハードコードしない。

---

## 実装パターン

### AppConfig へのフィールド追加

新しい設定フィールドを追加するときの標準的な手順:

1. `src/shared/types.ts` の `AppConfig` インターフェースにフィールドを追加
2. `src/shared/constants.ts` の `DEFAULT_CONFIG` にデフォルト値を追加
   - `images` でないフィールドは `Omit<AppConfig, 'images'>` に含まれるので問題ない
3. 対応する UI コンポーネントへの変更（`SettingsPanel`, `ImagePicker` 等）
   - `SLIDER_CONFIGS` の `defaultValue` は `DEFAULT_CONFIG` から参照する
   - constructor の `this.values` 初期値も `DEFAULT_CONFIG` から参照する
4. `src/control/index.ts` で初期値の受け渡しと変更ハンドリングを追加
5. `src/renderer/index.ts` で設定受信と適用を確認（`applyRendererConfig()` を使う）

### FaceRenderer の状態変更パターン

- 外部から状態を変更するメソッドは `setXxx()` という命名にする
- 状態変更後は `this.draw()` を呼んで即座に再描画する
- Canvas 背景クリアは `private clearCanvas()` を使う（直接 clearRect/fillRect を書かない）

```typescript
// FaceRenderer 内でのキャンバスクリアは必ずこのメソッドを使う
private clearCanvas(): void {
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  this.ctx.fillStyle = this.backgroundColor;
  this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
}
```

### レンダラー設定の適用

初期化時・設定変更時の両方で `applyRendererConfig()` を使う。

```typescript
// renderer/index.ts の共通関数
async function applyRendererConfig(renderer: FaceRenderer, newConfig: AppConfig): Promise<void> {
  if (newConfig.images) {
    try {
      await renderer.setImageConfig(newConfig.images);
    } catch (err) {
      console.warn('[StreamTalker] 画像の再プリロードに失敗しました。', err);
    }
  }
  renderer.setBackgroundColor(newConfig.backgroundColor ?? DEFAULT_CONFIG.backgroundColor);
}

// 初期化時
if (config) {
  await applyRendererConfig(renderer, config);
}

// 設定変更時（Electron モード）
ipcClient.onConfigUpdated(async (newConfig) => {
  await applyRendererConfig(renderer, newConfig);
  // ...
});
```

### SettingsPanel へのUI追加パターン

- `SettingsPanelOptions` に `initialXxx?: T` と `onXxxChange?: (value: T) => void` を追加
- `SLIDER_CONFIGS` に新スライダー定義を追加（`defaultValue` は `DEFAULT_CONFIG` から参照）
- `SettingsValue` 型への追加は変更範囲を最小化するため慎重に行う
- 既存スライダー群と同様に `slider-group` クラスの wrapper に UI を包む
- `setValues()` メソッドに新フィールドの反映処理を追加する

### IPC フロー

```
コントロールUI → ipcClient.setConfig() → メインプロセス → configStore.set()
                                       └→ ipcHandlers がブロードキャスト
プレビューUI ← ipcClient.onConfigUpdated() ←┘
```

### リソースクリーンアップのパターン

`observe()` / `addEventListener()` には対応するクリーンアップを `beforeunload` でペアにする。

```typescript
// Electron モード: stateManager の停止も必要
resizeObserver.observe(document.body);
window.addEventListener('beforeunload', () => {
  renderer.stopLoop();
  resizeObserver.disconnect();
  stateManager.stop().catch(() => {});
});

// OBS モード: EventSource も閉じる
resizeObserver.observe(document.body);
window.addEventListener('beforeunload', () => {
  eventSource.close();
  resizeObserver.disconnect();
});

// setInterval はIDを保存してクリーンアップ
const debugTimer = setInterval(() => { ... }, 100);
window.addEventListener('beforeunload', () => clearInterval(debugTimer));
```

---

## Canvas 描画における注意点

- Canvas 背景クリアは `FaceRenderer.clearCanvas()` を使う
- `clearRect` は透過クリア（alpha=0）のために残す
- その後 `fillRect` で背景色を塗る（透過させたい場合は `fillRect` をスキップ）
- `drawImage` は背景の上に顔画像を描く

---

## モジュール解決ルール

- tsconfig の `moduleResolution: "bundler"` に従い、相対 import には `.js` 拡張子を付ける
  - 例: `import { FaceRenderer } from './FaceRenderer.js';`
- `src/shared/` からの import も `.js` 拡張子が必要
  - 例: `import type { AppConfig } from '../shared/types.js';`

---

## テストモックの注意点

- Canvas コンテキスト (`CanvasRenderingContext2D`) は `test/setup.ts` でグローバルモック済み
- 現在のモック構成（`src/test/setup.ts`）:

```typescript
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  fillStyle: '',
  font: '',
  textAlign: '',
  textBaseline: '',
} as unknown as CanvasRenderingContext2D);
```

- `fillStyle` などプロパティ代入は `vi.fn()` ではなく文字列 `''` を初期値として設定する
- 新しい Canvas API を使う場合は `src/test/setup.ts` のモックに追加すること
- `AudioContext` は class ベースのモックで実装済み（`vi.fn().mockImplementation()` は new できない）

---

## 関連ファイル（実装時の参照先）

| 目的 | ファイル |
|------|---------|
| 型定義 | `src/shared/types.ts` |
| デフォルト値 | `src/shared/constants.ts` |
| IPC チャンネル名 | `src/shared/ipcEvents.ts` |
| Canvas 描画 | `src/renderer/FaceRenderer.ts` |
| 設定UI（スライダー） | `src/control/SettingsPanel.ts` |
| コントロールエントリー | `src/control/index.ts` |
| レンダラーエントリー | `src/renderer/index.ts` |
| テストセットアップ | `src/test/setup.ts` |
