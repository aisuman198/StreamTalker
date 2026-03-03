import { FaceRenderer } from './FaceRenderer';
import { StateManager } from './StateManager';
import { ipcClient, isElectronContext } from './ipcClient';
import type { AppConfig, FaceState } from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/constants';

// マイクエラーを日本語メッセージに変換（Canvas表示用）
function toMicErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'マイクの許可が必要です (NotAllowedError)';
    if (err.name === 'NotFoundError') return 'マイクが見つかりません (NotFoundError)';
    if (err.name === 'NotReadableError') return 'マイクが使用中です (NotReadableError)';
    return `マイクエラー: ${err.name}`;
  }
  if (err instanceof Error) return `エラー: ${err.message}`;
  return 'マイク起動エラー';
}

// Canvas をウィンドウサイズに合わせるユーティリティ
function resizeCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

// 設定変更をレンダラーに適用する共通処理（Electron / OBS 両モードで使用）
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

async function main(): Promise<void> {
  // 1. Canvas 要素を取得
  const canvas = document.getElementById('face-canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    console.error('[StreamTalker] canvas#face-canvas が見つかりません');
    return;
  }

  // 2. Canvas サイズをウィンドウサイズに合わせる（初期化）
  resizeCanvas(canvas);

  // 3. FaceRenderer を初期化
  const renderer = new FaceRenderer(canvas);

  // 4. 設定を取得（IPC or HTTP）
  let config: AppConfig | null = null;
  try {
    config = await ipcClient.getConfig();
  } catch (err) {
    console.warn('[StreamTalker] 設定取得に失敗しました。デフォルト設定で起動します。', err);
  }

  // 5. 画像設定・背景色をレンダラーに適用
  if (config) {
    await applyRendererConfig(renderer, config);
  }

  // 6. アニメーションループを開始
  renderer.startLoop();

  if (isElectronContext()) {
    // ── Electron モード: マイク音声を処理して FaceState を生成 ──────────────

    const stateManager = new StateManager();

    stateManager.onFaceStateChange((state) => {
      renderer.updateState(state);
      // main プロセス経由で OBS BrowserSource にも状態を共有
      ipcClient.sendFaceState(state);
    });

    let currentDeviceId = config?.audioDeviceId ?? null;
    try {
      await stateManager.start(currentDeviceId);
    } catch (err) {
      console.error('[StreamTalker] StateManager の起動に失敗しました。', err);
      renderer.showError(toMicErrorMessage(err));
    }

    // 設定変更を購読
    ipcClient.onConfigUpdated(async (newConfig: AppConfig) => {
      await applyRendererConfig(renderer, newConfig);

      if (newConfig.audioDeviceId !== currentDeviceId) {
        currentDeviceId = newConfig.audioDeviceId ?? null;
        try {
          await stateManager.restart(newConfig.audioDeviceId ?? null);
        } catch (err) {
          console.error('[StreamTalker] StateManager の再起動に失敗しました。', err);
          renderer.showError(toMicErrorMessage(err));
        }
      } else {
        stateManager.updateConfig(newConfig);
      }
    });

    // ResizeObserver でウィンドウサイズ変更に追従
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas(canvas);
      renderer.updateState(stateManager.faceState);
    });
    resizeObserver.observe(document.body);
    window.addEventListener('beforeunload', () => {
      renderer.stopLoop();
      resizeObserver.disconnect();
      stateManager.stop().catch(() => {});
    });

    // デバッグオーバーレイ（?debug=1）
    if (new URLSearchParams(window.location.search).has('debug')) {
      const threshold = config?.threshold ?? DEFAULT_CONFIG.threshold;
      const debugTimer = setInterval(() => {
        renderer.setDebugInfo({
          volume: stateManager.volume,
          threshold,
          audioContextState: stateManager.audioContextState,
          mouthState: stateManager.faceState.mouth,
          eyeState: stateManager.faceState.eye,
          speaking: stateManager.speaking,
        });
      }, 100);
      window.addEventListener('beforeunload', () => clearInterval(debugTimer));
    }

  } else {
    // ── OBS BrowserSource モード: /api/state をポーリングして描画 ───────────

    // SSE でリアルタイムに FaceState を受信（タイマースロットル問題を回避）
    const eventSource = new EventSource('/api/state/events');
    eventSource.onmessage = (event) => {
      try {
        const state = JSON.parse(event.data as string) as FaceState;
        renderer.updateState(state);
      } catch {
        // 不正データは無視
      }
    };
    eventSource.onerror = () => {
      console.warn('[StreamTalker] SSE 接続エラー。EventSource が自動的に再接続します。');
    };

    // 設定変更（3秒ポーリング）
    ipcClient.onConfigUpdated(async (newConfig: AppConfig) => {
      await applyRendererConfig(renderer, newConfig);
    });

    // ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas(canvas);
    });
    resizeObserver.observe(document.body);
    window.addEventListener('beforeunload', () => {
      eventSource.close();
      resizeObserver.disconnect();
    });
  }
}

// DOM 読み込み完了後に起動
document.addEventListener('DOMContentLoaded', () => {
  main().catch((err) => {
    console.error('[StreamTalker] 初期化エラー:', err);
  });
});
