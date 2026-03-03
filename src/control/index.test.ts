import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioDeviceSelector } from './AudioDeviceSelector';
import { SettingsPanel } from './SettingsPanel';
import { DEFAULT_CONFIG } from '../shared/constants';

describe('AudioDeviceSelector', () => {
  it('getElement() が HTMLDivElement を返すこと', () => {
    const selector = new AudioDeviceSelector({ onChange: vi.fn() });
    expect(selector.getElement()).toBeInstanceOf(HTMLDivElement);
  });

  it('setValue() で指定した deviceId が getValue() で返ること', () => {
    const selector = new AudioDeviceSelector({ onChange: vi.fn() });
    // select に手動で option を追加してから setValue をテスト
    const el = selector.getElement().querySelector('select') as HTMLSelectElement;
    const opt = document.createElement('option');
    opt.value = 'mic-123';
    el.appendChild(opt);
    selector.setValue('mic-123');
    expect(selector.getValue()).toBe('mic-123');
  });

  it('setValue(null) でデフォルト選択（空文字）になること', () => {
    const selector = new AudioDeviceSelector({ onChange: vi.fn() });
    selector.setValue(null);
    expect(selector.getValue()).toBeNull();
  });
});

describe('SettingsPanel', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it('getElement() が HTMLDivElement を返すこと', () => {
    const panel = new SettingsPanel({ onChange });
    expect(panel.getElement()).toBeInstanceOf(HTMLDivElement);
  });

  it('DEFAULT_CONFIG の値で初期化されること', () => {
    const panel = new SettingsPanel({
      onChange,
      initialValues: {
        threshold: DEFAULT_CONFIG.threshold,
        smoothingTimeConstant: DEFAULT_CONFIG.smoothingTimeConstant,
        lipSyncCycleMs: DEFAULT_CONFIG.lipSyncCycleMs,
        blinkIntervalBase: DEFAULT_CONFIG.blinkIntervalBase,
      },
    });
    const values = panel.getValues();
    expect(values.threshold).toBe(DEFAULT_CONFIG.threshold);
    expect(values.lipSyncCycleMs).toBe(DEFAULT_CONFIG.lipSyncCycleMs);
  });

  it('setValues() で値が更新されること', () => {
    const panel = new SettingsPanel({ onChange });
    panel.setValues({ threshold: 0.3 });
    expect(panel.getValues().threshold).toBe(0.3);
  });
});
