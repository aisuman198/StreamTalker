import { vi } from 'vitest';

// Electron IPCのモック
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  ipcRenderer: {
    invoke: vi.fn(),
    on: vi.fn(),
    send: vi.fn(),
  },
  contextBridge: {
    exposeInMainWorld: vi.fn(),
  },
  app: {
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn(),
    on: vi.fn(),
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    isDestroyed: vi.fn().mockReturnValue(false),
    on: vi.fn(),
  })),
}));

// Web Audio APIのモック
class MockAudioContext {
  createAnalyser() {
    return {
      fftSize: 256,
      frequencyBinCount: 128,
      smoothingTimeConstant: 0.8,
      connect: vi.fn(),
      getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(0)),
    };
  }
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  async close() {}
}
vi.stubGlobal('AudioContext', MockAudioContext);

// MediaDevicesのモック
vi.stubGlobal('navigator', {
  mediaDevices: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    }),
    enumerateDevices: vi.fn().mockResolvedValue([
      { kind: 'audioinput', deviceId: 'default', label: 'Default Microphone' },
    ]),
  },
});

// Canvas 2D Contextのモック (node環境では HTMLCanvasElement が存在しないためガード)
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
