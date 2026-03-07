import { IPC_EVENTS } from '../shared/ipcEvents';
import type { AppConfig, FaceState } from '../shared/types';

// window.electronAPI の型定義
interface ElectronAPI {
  invoke: (channel: string, data?: unknown) => Promise<unknown>;
  on: (channel: string, callback: (...args: unknown[]) => void) => void;
  send: (channel: string, data?: unknown) => void;
  /** ローカルファイルの絶対パスを取得する（Electron 35+ で file.path の代替） */
  getPathForFile: (file: File) => string;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

/** Electron の IPC が利用可能かどうか（OBS BrowserSource では false） */
function hasElectronAPI(): boolean {
  return typeof window !== 'undefined' && window.electronAPI != null;
}

/** renderer/index.ts から参照できるよう公開 */
export function isElectronContext(): boolean {
  return hasElectronAPI();
}

export const ipcClient = {
  getConfig: async (): Promise<AppConfig | null> => {
    if (hasElectronAPI()) {
      return window.electronAPI.invoke(IPC_EVENTS.CONFIG_GET) as Promise<AppConfig | null>;
    }
    // フォールバック: HTTP経由で設定を取得（OBS BrowserSource 向け）
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return null;
      return res.json() as Promise<AppConfig>;
    } catch {
      return null;
    }
  },

  setConfig: (config: Partial<AppConfig>): Promise<{ success: boolean }> => {
    if (hasElectronAPI()) {
      return window.electronAPI.invoke(IPC_EVENTS.CONFIG_SET, config) as Promise<{ success: boolean }>;
    }
    // OBS BrowserSource では設定変更不可
    return Promise.resolve({ success: false });
  },

  sendFaceState: (state: FaceState): void => {
    if (hasElectronAPI()) {
      window.electronAPI.send(IPC_EVENTS.FACE_STATE_UPDATED, state);
    }
  },

  onConfigUpdated: (callback: (config: AppConfig) => void): void => {
    if (hasElectronAPI()) {
      window.electronAPI.on(IPC_EVENTS.CONFIG_UPDATED, callback as (...args: unknown[]) => void);
      return;
    }
    // フォールバック: 3秒ごとにポーリングして設定変更を検知（OBS BrowserSource 向け）
    let lastJson = '';
    // 初回ベースラインを設定して不要なコールバック呼び出しを防ぐ
    fetch('/api/config')
      .then(res => (res.ok ? res.json() : null))
      .then((config: AppConfig | null) => {
        if (config) lastJson = JSON.stringify(config);
      })
      .catch(() => {});

    setInterval(async () => {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) return;
        const config = await res.json() as AppConfig;
        const json = JSON.stringify(config);
        if (json !== lastJson) {
          lastJson = json;
          callback(config);
        }
      } catch {
        // ネットワークエラーは無視
      }
    }, 3000);
  },

  togglePreview: (): Promise<void> => {
    if (hasElectronAPI()) {
      return window.electronAPI.invoke(IPC_EVENTS.PREVIEW_TOGGLE) as Promise<void>;
    }
    // OBS BrowserSource ではプレビューウィンドウ操作不可
    return Promise.resolve();
  },
};
