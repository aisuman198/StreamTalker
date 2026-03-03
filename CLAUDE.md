# CLAUDE.md — StreamTalker 開発ガイド

このファイルは AI アシスタント（Claude Code など）向けの開発コンテキストです。

## プロジェクト概要

**StreamTalker** は Electron + TypeScript 製のリップシンクアプリです。
マイク音声を解析して顔画像を切り替え、OBS の BrowserSource でくちぱくアニメーションを表示します。

## 技術スタック

| 要素 | 内容 |
|------|------|
| フレームワーク | Electron |
| 言語 | TypeScript |
| バンドラー | Vite |
| テスト | Vitest + happy-dom |
| 設定永続化 | electron-store |

## よく使うコマンド

```bash
npm test        # テスト実行（98件）
npm run build   # ビルド
npm start       # アプリ起動
```

---

## アーキテクチャ

### 3ウィンドウ構成

```
main プロセス
├── コントロールウィンドウ (control/)   ← 設定UI
├── プレビューウィンドウ  (renderer/)  ← Canvas アニメーション
└── HTTP サーバー (server.ts, port 3000) ← OBS BrowserSource 向け
```

### データフロー

```
マイク入力
  → AudioAnalyser（音量解析）
    → StateManager（FaceState 生成）
      → FaceRenderer（Canvas 描画）
      → IPC → main プロセス → server.ts pushState()
                                → SSE → OBS BrowserSource
```

### IPC フロー（設定変更）

```
コントロールUI → ipcClient.setConfig()
  → ipcHandlers.ts（CONFIG_SET）
    → configStore.setAll()
    → BrowserWindow.getAllWindows().forEach → CONFIG_UPDATED ブロードキャスト
      → プレビューウィンドウ受信 → applyRendererConfig()
```

---

## ファイル構成

```
src/
  main/
    index.ts          # エントリーポイント（ウィンドウ生成）
    windowManager.ts  # BrowserWindow 生成・管理（backgroundThrottling: false）
    ipcHandlers.ts    # IPC ハンドラ（設定読み書き・FaceState 受信）
    configStore.ts    # electron-store ラッパー
    server.ts         # 静的ファイルサーバー（/api/config, /api/state, /api/image, SSE）
    preload.ts        # contextBridge で IPC を公開
  renderer/
    index.ts          # エントリーポイント（Electron / OBS 両モード）
    FaceRenderer.ts   # Canvas 描画クラス
    AudioAnalyser.ts  # Web Audio API でマイク音量解析
    BlinkStateMachine.ts  # 瞬きアニメーション状態機械
    StateManager.ts   # FaceState 統括（AudioAnalyser + BlinkStateMachine）
    ipcClient.ts      # renderer → IPC クライアント（OBS モードでは HTTP ポーリング）
  control/
    index.ts          # エントリーポイント
    SettingsPanel.ts  # スライダー設定 UI
    AudioDeviceSelector.ts  # マイクデバイス選択
    ImagePicker.ts    # 顔画像選択
  shared/
    types.ts          # AppConfig, FaceState, ImageConfig, ImageStateKey
    constants.ts      # DEFAULT_CONFIG, FFT_SIZE, PREVIEW_SERVER_PORT
    ipcEvents.ts      # IPC チャンネル名定数
  test/
    setup.ts          # Vitest グローバルセットアップ（Electron/Canvas/MediaDevices モック）
```

---

## 主要な型（`src/shared/types.ts`）

```typescript
type MouthState = 'open' | 'half' | 'closed';
type EyeState   = 'open' | 'half' | 'closed';
type ImageStateKey = `${MouthState}_${EyeState}`;

interface FaceState { mouth: MouthState; eye: EyeState; }

interface ImageConfig {
  'closed_open': string;   // 必須: 口閉・目開（ニュートラル）
  'open_open': string;     // 必須: 口開・目開（発話中）
  // その他7パターンは省略可能
}

interface AppConfig {
  images: ImageConfig;
  audioDeviceId: string | null;
  threshold: number;               // 口開閉の音量閾値 (0.0 ~ 1.0)
  smoothingTimeConstant: number;   // 音量平滑化係数
  pollingInterval: number;         // AnalyserNode 読み取り間隔 (ms)
  lipSyncCycleMs: number;          // リップシンク 1 ステップの時間 (ms)
  backgroundColor: string;         // Canvas 背景色（OBS クロマキー用）
  blinkIntervalBase: number;       // 瞬き間隔の基準値 (ms)
  blinkIntervalVariance: number;   // 瞬き間隔のばらつき (ms)
  blinkTransitionDuration: number; // 瞬き遷移時間 (ms)
}
```

## デフォルト設定（`src/shared/constants.ts`）

```typescript
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

---

## コード規約

### 定数はすべて DEFAULT_CONFIG から参照する

```typescript
// NG: マジック値をハードコード
const threshold = options.threshold ?? 0.15;

// OK: DEFAULT_CONFIG を参照
import { DEFAULT_CONFIG } from '../shared/constants';
const threshold = options.threshold ?? DEFAULT_CONFIG.threshold;
```

### Canvas 背景クリアは clearCanvas() を使う

`FaceRenderer` 内で背景クリアが必要な場合は `private clearCanvas()` を呼ぶ。
直接 `clearRect` + `fillStyle` + `fillRect` を書かない。

```typescript
// NG
this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
this.ctx.fillStyle = this.backgroundColor;
this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

// OK
this.clearCanvas();
```

### レンダラー設定適用は applyRendererConfig() を使う

初期化時・設定変更時の両方で `applyRendererConfig()` を使う。個別に `setImageConfig()` / `setBackgroundColor()` を直接呼ばない。

```typescript
// renderer/index.ts の applyRendererConfig を利用
if (config) {
  await applyRendererConfig(renderer, config);
}
```

### リソースクリーンアップのペア

`observe()` / `addEventListener()` には対応する `disconnect()` / `close()` を `beforeunload` でセットにする。

```typescript
resizeObserver.observe(document.body);
window.addEventListener('beforeunload', () => resizeObserver.disconnect());

// Electron モードでは StateManager も停止する
window.addEventListener('beforeunload', () => {
  renderer.stopLoop();
  resizeObserver.disconnect();
  stateManager.stop().catch(() => {});
});
```

### AppConfig にフィールドを追加する手順

1. `src/shared/types.ts` の `AppConfig` に追加
2. `src/shared/constants.ts` の `DEFAULT_CONFIG` にデフォルト値を追加
3. 対応する UI を `SettingsPanel` に追加（`SLIDER_CONFIGS` と constructor の `this.values` も更新）
4. `src/control/index.ts` で初期値の受け渡しと変更ハンドリングを追加
5. `src/renderer/index.ts` で設定受信と適用を確認

---

## モジュール解決ルール

`tsconfig.json` の `moduleResolution: "bundler"` に従い、相対 import には `.js` 拡張子を付ける。

```typescript
// main/ や shared/ からの import
import { DEFAULT_CONFIG } from '../shared/constants.js';
import type { AppConfig } from '../shared/types.js';

// renderer/ 内の import（.js あり）
import { FaceRenderer } from './FaceRenderer.js';
```

> **注意**: `renderer/index.ts` など Vite でバンドルされるファイルは拡張子なしでも動作するが、
> 一貫性のために `.js` を付けることを推奨する。

---

## テスト

### テスト実行

```bash
npm test
```

### テストモックの注意点

- `Canvas 2D Context` は `test/setup.ts` でグローバルモック済み
- 現在のモックには `clearRect`, `fillRect`, `drawImage`, `fillText`, `fillStyle`, `font`, `textAlign`, `textBaseline` が含まれる
- 新しい Canvas API を使う場合は `src/test/setup.ts` のモックに追加すること

```typescript
// src/test/setup.ts のモック現状
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

- `AudioContext` は class ベースのモックで実装済み（`vi.fn().mockImplementation()` は new できない）
- `navigator.mediaDevices` は `vi.stubGlobal` でモック済み

### パストラバーサルテスト

Node.js の `http.get()` はパスを正規化するため、SPA fallback で 200 が返ることがある。
期待値は `[200, 403, 404]` のように許容範囲を持たせること。

---

## 設計上の決定事項

### OBS BrowserSource 対応

OBS の BrowserSource はブラウザとして動作するため、Electron IPC が使えない。
`ipcClient.ts` は実行環境を検出して切り替える：

- **Electron**: IPC（`window.electronAPI`）経由で設定取得・FaceState 送信
- **OBS BrowserSource**: HTTP ポーリング（3秒）で設定取得、SSE で FaceState 受信

### backgroundThrottling の無効化

OBS 配信中はプレビューウィンドウがバックグラウンドになるため、
`windowManager.ts` で `backgroundThrottling: false` を設定している。
これにより rAF・setInterval がスロットリングされず、アニメーションが正常に動作する。

### rAF ループと差分描画の併用

`FaceRenderer.startLoop()` は毎フレーム `draw()` を呼ぶ。
`updateState()` でも変化時に `draw()` を呼ぶため二重描画になるが、
`draw()` は冪等（同じ状態では同じ結果）なので問題ない。
rAF ループはアニメーション継続と Canvas の維持を目的とする。

### 画像フォールバックロジック

`FaceRenderer.resolveImageUrl()` は以下の優先度で画像を解決する：

1. `${mouth}_${eye}` （完全一致）
2. `${mouth}_open` （目の状態を open にフォールバック）
3. `closed_${eye}` （口の状態を closed にフォールバック）
4. `closed_open` （最終フォールバック、必須）
