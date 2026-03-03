import { contextBridge, ipcRenderer } from 'electron';
import { IPC_EVENTS } from '../shared/ipcEvents.js';

// 許可するIPCチャンネルのホワイトリスト
const ALLOWED_CHANNELS = Object.values(IPC_EVENTS);

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel: string, data?: unknown): Promise<unknown> => {
    if (ALLOWED_CHANNELS.includes(channel as typeof ALLOWED_CHANNELS[number])) {
      return ipcRenderer.invoke(channel, data);
    }
    return Promise.reject(new Error(`Unauthorized IPC channel: ${channel}`));
  },
  on: (channel: string, callback: (...args: unknown[]) => void): void => {
    if (ALLOWED_CHANNELS.includes(channel as typeof ALLOWED_CHANNELS[number])) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  send: (channel: string, data?: unknown): void => {
    if (ALLOWED_CHANNELS.includes(channel as typeof ALLOWED_CHANNELS[number])) {
      ipcRenderer.send(channel, data);
    }
  },
});
