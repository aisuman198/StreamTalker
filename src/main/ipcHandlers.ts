import { ipcMain, BrowserWindow } from 'electron';
import { IPC_EVENTS } from '../shared/ipcEvents.js';
import type { AppConfig, FaceState } from '../shared/types.js';
import type { ConfigStore } from './configStore.js';

export function registerIpcHandlers(
  configStore?: ConfigStore,
  onFaceStateChange?: (state: FaceState) => void,
): void {
  // 設定読み込みハンドラー
  ipcMain.handle(IPC_EVENTS.CONFIG_GET, async (): Promise<AppConfig | null> => {
    if (configStore) {
      return configStore.getAll();
    }
    return null;
  });

  // 設定保存ハンドラー
  ipcMain.handle(IPC_EVENTS.CONFIG_SET, async (_event, config: Partial<AppConfig>): Promise<{ success: boolean }> => {
    if (configStore) {
      configStore.setAll(config);
      const updatedConfig = configStore.getAll();
      // 全ウィンドウに設定変更をブロードキャスト
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send(IPC_EVENTS.CONFIG_UPDATED, updatedConfig);
      });
    }
    return { success: true };
  });

  // オーディオデバイス一覧取得ハンドラー
  ipcMain.handle(IPC_EVENTS.AUDIO_DEVICES_GET, async (): Promise<unknown[]> => {
    // レンダラー側の navigator.mediaDevices.enumerateDevices() で取得するため、
    // メインプロセスでは空配列を返す
    return [];
  });

  // 顔状態受信ハンドラー（Electron renderer → main → /api/state 経由で OBS へ）
  ipcMain.on(IPC_EVENTS.FACE_STATE_UPDATED, (_event, state: FaceState) => {
    onFaceStateChange?.(state);
  });
}
