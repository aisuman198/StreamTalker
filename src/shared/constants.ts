import type { AppConfig } from './types.js';

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

export const FFT_SIZE = 256;

export const PREVIEW_SERVER_PORT = 3000;
