import { BrowserWindow } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class WindowManager {
  private controlWindow: BrowserWindow | null = null;
  private previewWindow: BrowserWindow | null = null;

  createWindows(): void {
    this.createControlWindow();
    this.createPreviewWindow();
  }

  private createControlWindow(): void {
    if (this.controlWindow && !this.controlWindow.isDestroyed()) return;

    this.controlWindow = new BrowserWindow({
      width: 480,
      height: 640,
      title: 'StreamTalker - 設定',
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // 開発時はVite dev server、本番時はビルド済みHTML
    if (process.env.NODE_ENV === 'development') {
      this.controlWindow.loadURL('http://localhost:5173/src/control/index.html');
    } else {
      this.controlWindow.loadFile(path.join(__dirname, '../renderer/src/control/index.html'));
    }
  }

  private createPreviewWindow(): void {
    if (this.previewWindow && !this.previewWindow.isDestroyed()) return;

    this.previewWindow = new BrowserWindow({
      width: 512,
      height: 512,
      title: 'StreamTalker - Preview',
      transparent: true,
      frame: false,
      alwaysOnTop: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,  // バックグラウンド時のタイマースロットリングを無効化
      },
    });

    if (process.env.NODE_ENV === 'development') {
      this.previewWindow.loadURL('http://localhost:5173/index.html');
    } else {
      this.previewWindow.loadFile(path.join(__dirname, '../renderer/src/renderer/index.html'));
    }
  }

  getControlWindow(): BrowserWindow | null {
    return this.controlWindow;
  }

  getPreviewWindow(): BrowserWindow | null {
    return this.previewWindow;
  }
}
