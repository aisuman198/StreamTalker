// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_CONFIG } from '../shared/constants';

let mockData: Record<string, unknown> = {};

// electron-storeをclassでモック（vi.fn()はESMでnewできないため）
vi.mock('electron-store', () => {
  class MockStore {
    get(key: string) { return mockData[key]; }
    set(key: string, value: unknown) { mockData[key] = value; }
    get store() { return mockData; }
  }
  return { default: MockStore };
});

import { ConfigStore } from './configStore';

describe('ConfigStore', () => {
  beforeEach(() => {
    mockData = {
      ...DEFAULT_CONFIG,
      images: { 'closed_open': '', 'open_open': '' },
    };
  });

  describe('init()のテスト', () => {
    it('init()を呼ばずにget()するとエラーをスローすること', () => {
      const store = new ConfigStore();
      expect(() => store.get('threshold')).toThrow('ConfigStore not initialized');
    });

    it('init()後は正常にget()できること', () => {
      const store = new ConfigStore();
      store.init();
      expect(() => store.get('threshold')).not.toThrow();
    });
  });

  describe('get() / set()のテスト', () => {
    it('set("threshold", 0.3)後にget("threshold")で0.3が返ること', () => {
      const store = new ConfigStore();
      store.init();
      store.set('threshold', 0.3);
      expect(store.get('threshold')).toBe(0.3);
    });

    it('デフォルト値が正しく取得できること', () => {
      const store = new ConfigStore();
      store.init();
      expect(store.get('threshold')).toBe(DEFAULT_CONFIG.threshold);
      expect(store.get('smoothingTimeConstant')).toBe(DEFAULT_CONFIG.smoothingTimeConstant);
      expect(store.get('pollingInterval')).toBe(DEFAULT_CONFIG.pollingInterval);
    });
  });

  describe('getAll()のテスト', () => {
    it('全設定がAppConfigとして返ること', () => {
      const store = new ConfigStore();
      store.init();
      const all = store.getAll();
      expect(all).toHaveProperty('threshold');
      expect(all).toHaveProperty('smoothingTimeConstant');
      expect(all).toHaveProperty('pollingInterval');
      expect(all).toHaveProperty('blinkIntervalBase');
      expect(all).toHaveProperty('blinkIntervalVariance');
      expect(all).toHaveProperty('blinkTransitionDuration');
      expect(all).toHaveProperty('audioDeviceId');
      expect(all).toHaveProperty('images');
    });

    it('init()を呼ばずにgetAll()するとエラーをスローすること', () => {
      const store = new ConfigStore();
      expect(() => store.getAll()).toThrow('ConfigStore not initialized');
    });
  });

  describe('setAll()のテスト', () => {
    it('部分的な設定更新が正しく動作すること', () => {
      const store = new ConfigStore();
      store.init();
      store.setAll({ threshold: 0.5, pollingInterval: 100 });
      expect(store.get('threshold')).toBe(0.5);
      expect(store.get('pollingInterval')).toBe(100);
    });

    it('setAll()で更新しない項目はそのまま残ること', () => {
      const store = new ConfigStore();
      store.init();
      const originalSmoothing = store.get('smoothingTimeConstant');
      store.setAll({ threshold: 0.5 });
      expect(store.get('smoothingTimeConstant')).toBe(originalSmoothing);
    });

    it('init()を呼ばずにsetAll()するとエラーをスローすること', () => {
      const store = new ConfigStore();
      expect(() => store.setAll({ threshold: 0.5 })).toThrow('ConfigStore not initialized');
    });
  });
});
