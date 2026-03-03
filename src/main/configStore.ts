import ElectronStore from 'electron-store';
import { DEFAULT_CONFIG } from '../shared/constants.js';
import type { AppConfig, ImageConfig } from '../shared/types.js';

const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  'closed_open': '',
  'open_open': '',
};

function createStore() {
  return new ElectronStore<AppConfig>({
    name: 'stream-talker-config',
    defaults: {
      ...DEFAULT_CONFIG,
      images: DEFAULT_IMAGE_CONFIG,
    },
  });
}

export class ConfigStore {
  private store: ReturnType<typeof createStore> | null = null;

  init(): void {
    this.store = createStore();
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    if (!this.store) throw new Error('ConfigStore not initialized');
    return this.store.get(key);
  }

  set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    if (!this.store) throw new Error('ConfigStore not initialized');
    this.store.set(key, value);
  }

  getAll(): AppConfig {
    if (!this.store) throw new Error('ConfigStore not initialized');
    return this.store.store;
  }

  setAll(config: Partial<AppConfig>): void {
    if (!this.store) throw new Error('ConfigStore not initialized');
    for (const [key, value] of Object.entries(config)) {
      this.store.set(key as keyof AppConfig, value as AppConfig[keyof AppConfig]);
    }
  }
}
