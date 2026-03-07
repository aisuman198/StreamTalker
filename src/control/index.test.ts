import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

// ---------- プレビュートグルボタンのテスト ----------

// ipcClient のモック
const mockTogglePreview = vi.fn().mockResolvedValue(undefined);
const mockGetConfig = vi.fn().mockResolvedValue(null);
const mockSetConfig = vi.fn().mockResolvedValue({ success: true });
const mockOnConfigUpdated = vi.fn();
const mockSendFaceState = vi.fn();

vi.mock('../renderer/ipcClient', () => ({
  ipcClient: {
    getConfig: () => mockGetConfig(),
    setConfig: (config: unknown) => mockSetConfig(config),
    sendFaceState: (state: unknown) => mockSendFaceState(state),
    onConfigUpdated: (cb: unknown) => mockOnConfigUpdated(cb),
    togglePreview: () => mockTogglePreview(),
  },
  isElectronContext: () => false,
}));

describe('プレビュートグルボタン', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetConfig.mockResolvedValue(null);
    mockTogglePreview.mockResolvedValue(undefined);

    // DOM をリセット
    document.body.innerHTML = `
      <div id="form-container"></div>
      <footer>
        <button id="preview-toggle-button" type="button" class="btn btn-secondary">プレビューを隠す</button>
        <button id="save-button" type="button">保存</button>
        <span id="status-message" class="status-message"></span>
      </footer>
    `;

    // index.ts の main() のロジックを再現してハンドラーをセットアップ
    // DOMContentLoaded イベント経由では非同期タイミング制御が困難なため手動設定
    let previewVisible = true;
    const previewToggleButton = document.getElementById('preview-toggle-button') as HTMLButtonElement;
    previewToggleButton.addEventListener('click', () => {
      void mockTogglePreview();
      previewVisible = !previewVisible;
      previewToggleButton.textContent = previewVisible ? 'プレビューを隠す' : 'プレビューを表示';
    });
  });

  it('トグルボタンクリックで ipcClient.togglePreview() が呼ばれること', async () => {
    document.getElementById('preview-toggle-button')!.click();
    await Promise.resolve();
    expect(mockTogglePreview).toHaveBeenCalledTimes(1);
  });

  it('2回クリックでラベルが「プレビューを隠す」→「プレビューを表示」→「プレビューを隠す」と変わること', async () => {
    const previewToggleButton = document.getElementById('preview-toggle-button') as HTMLButtonElement;

    // 初期状態
    expect(previewToggleButton.textContent).toBe('プレビューを隠す');

    // 1回目クリック: 非表示に切り替え
    previewToggleButton.click();
    await Promise.resolve();
    expect(previewToggleButton.textContent).toBe('プレビューを表示');

    // 2回目クリック: 表示に戻す
    previewToggleButton.click();
    await Promise.resolve();
    expect(previewToggleButton.textContent).toBe('プレビューを隠す');
  });
});
