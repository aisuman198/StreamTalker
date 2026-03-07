import * as path from 'path';
import { fileURLToPath } from 'url';
import { app, ipcMain } from 'electron';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { WindowManager } from './windowManager.js';
import { ConfigStore } from './configStore.js';
import { registerIpcHandlers } from './ipcHandlers.js';
import { startPreviewServer } from './server.js';
import { IPC_EVENTS } from '../shared/ipcEvents.js';
import type { FaceState } from '../shared/types.js';

let windowManager: WindowManager;
export const configStore = new ConfigStore();
let currentFaceState: FaceState = { mouth: 'closed', eye: 'open' };
let pushFaceState: ((state: FaceState) => void) | null = null;

app.whenReady().then(async () => {
  configStore.init();

  // IPCハンドラーを登録（FaceState 変化時は SSE クライアントにもプッシュ）
  registerIpcHandlers(configStore, (state) => {
    currentFaceState = state;
    pushFaceState?.(state);
  });

  windowManager = new WindowManager();
  windowManager.createWindows();

  // プレビューウィンドウ表示切り替えハンドラー
  ipcMain.handle(IPC_EVENTS.PREVIEW_TOGGLE, () => {
    windowManager.togglePreviewWindow();
  });

  // HTTPサーバーを起動（開発・本番両モード。/api/image で画像を配信し file:// CORS 問題を回避）
  const distRendererDir = path.join(__dirname, '../renderer');
  const srv = startPreviewServer(
    distRendererDir,
    'src/renderer/index.html',
    () => configStore.getAll(),
    () => currentFaceState,
  );
  pushFaceState = (state) => srv.pushState(state);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (windowManager) {
    windowManager.createWindows();
  }
});
