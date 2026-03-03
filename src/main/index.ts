import * as path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { WindowManager } from './windowManager.js';
import { ConfigStore } from './configStore.js';
import { registerIpcHandlers } from './ipcHandlers.js';
import { startPreviewServer } from './server.js';
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

  // 本番時のみHTTPサーバーを起動（開発時はVite dev serverを使う）
  if (process.env.NODE_ENV !== 'development') {
    const distRendererDir = path.join(__dirname, '../renderer');
    const srv = startPreviewServer(
      distRendererDir,
      'src/renderer/index.html',
      () => configStore.getAll(),
      () => currentFaceState,
    );
    pushFaceState = (state) => srv.pushState(state);
  }
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
