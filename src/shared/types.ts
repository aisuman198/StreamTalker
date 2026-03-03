// 口の状態
export type MouthState = 'open' | 'half' | 'closed';

// 目の状態
export type EyeState = 'open' | 'half' | 'closed';

// 顔全体の状態
export interface FaceState {
  mouth: MouthState;
  eye: EyeState;
}

// 画像設定（可変パターン。未設定はフォールバックで解決）
export type ImageStateKey = `${MouthState}_${EyeState}`;

export interface ImageConfig {
  // 必須（最低限）
  'closed_open': string;   // 口閉・目開（ニュートラル）
  'open_open': string;     // 口開・目開（発話中）
  // 省略可能
  'half_open'?: string;
  'closed_half'?: string;
  'closed_closed'?: string;
  'open_half'?: string;
  'open_closed'?: string;
  'half_half'?: string;
  'half_closed'?: string;
}

// アプリ全体の設定
export interface AppConfig {
  images: ImageConfig;
  audioDeviceId: string | null;   // null = デフォルトデバイス
  threshold: number;               // 口開閉の音量閾値 (0.0 ~ 1.0)
  smoothingTimeConstant: number;   // 音量平滑化係数
  pollingInterval: number;         // AnalyserNode読み取り間隔 (ms)
  lipSyncCycleMs: number;          // リップシンク1ステップの時間 (ms)
  backgroundColor: string;         // Canvas 背景色（OBS クロマキー用）
  blinkIntervalBase: number;       // 瞬き間隔の基準値 (ms)
  blinkIntervalVariance: number;   // 瞬き間隔のばらつき (ms)
  blinkTransitionDuration: number; // 瞬き遷移時間 (ms)
}
