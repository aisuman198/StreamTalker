// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// BrowserWindow モックの返り値を制御するための変数
let mockIsVisible = true;
const mockHide = vi.fn();
const mockShow = vi.fn();
const mockLoadURL = vi.fn();
const mockLoadFile = vi.fn();
const mockIsDestroyed = vi.fn().mockReturnValue(false);

vi.mock('electron', () => {
  // BrowserWindow は class ベースのモック（vi.fn().mockImplementation はコンストラクタとして使えないため）
  class MockBrowserWindow {
    loadURL = mockLoadURL;
    loadFile = mockLoadFile;
    isDestroyed = mockIsDestroyed;
    isVisible = vi.fn(() => mockIsVisible);
    hide = mockHide;
    show = mockShow;
    on = vi.fn();
  }

  return {
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
      handle: vi.fn(),
      on: vi.fn(),
    },
    app: {
      whenReady: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn(),
      on: vi.fn(),
    },
  };
});

import { WindowManager } from './windowManager.js';

describe('WindowManager', () => {
  let manager: WindowManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsVisible = true;
    manager = new WindowManager();
  });

  describe('createWindows()', () => {
    it('createWindows() 後に getControlWindow() と getPreviewWindow() が非 null を返すこと', () => {
      manager.createWindows();
      expect(manager.getControlWindow()).not.toBeNull();
      expect(manager.getPreviewWindow()).not.toBeNull();
    });
  });

  describe('togglePreviewWindow()', () => {
    it('isVisible=true のとき hide() が呼ばれること', () => {
      mockIsVisible = true;
      manager.createWindows();
      manager.togglePreviewWindow();
      expect(mockHide).toHaveBeenCalledTimes(1);
      expect(mockShow).not.toHaveBeenCalled();
    });

    it('isVisible=false のとき show() が呼ばれること', () => {
      mockIsVisible = false;
      manager.createWindows();
      manager.togglePreviewWindow();
      expect(mockShow).toHaveBeenCalledTimes(1);
      expect(mockHide).not.toHaveBeenCalled();
    });

    it('プレビューウィンドウが存在しない場合は何もしないこと', () => {
      // createWindows() を呼ばずに togglePreviewWindow() を実行
      manager.togglePreviewWindow();
      expect(mockHide).not.toHaveBeenCalled();
      expect(mockShow).not.toHaveBeenCalled();
    });
  });
});
