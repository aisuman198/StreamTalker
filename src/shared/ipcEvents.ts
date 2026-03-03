export const IPC_EVENTS = {
  // Config 関連
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_UPDATED: 'config:updated',

  // Audio デバイス関連
  AUDIO_DEVICES_GET: 'audio:devices:get',

  // 顔の状態（Electron renderer → main → /api/state 経由で OBS へ）
  FACE_STATE_UPDATED: 'face:state:updated',
} as const;

export type IpcEventKey = keyof typeof IPC_EVENTS;
export type IpcEventValue = typeof IPC_EVENTS[IpcEventKey];
