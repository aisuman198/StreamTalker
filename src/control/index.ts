/**
 * src/control/index.ts
 *
 * コントロールUIのエントリーポイント。
 * IPC を通じて設定を読み込み、各コンポーネントに初期値を渡す。
 * ユーザーが保存ボタンを押したとき、変更された設定を IPC 経由でメインプロセスへ送る。
 */

import { ipcClient } from '../renderer/ipcClient';
import type { AppConfig, ImageConfig } from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/constants';
import { AudioDeviceSelector } from './AudioDeviceSelector';
import { ImagePicker } from './ImagePicker';
import { SettingsPanel } from './SettingsPanel';

// ---------- 現在の設定を保持する作業用オブジェクト ----------
let currentConfig: Partial<AppConfig> = {};

// ---------- コンポーネントインスタンス ----------
let audioDeviceSelector: AudioDeviceSelector;
let imagePicker: ImagePicker;
let settingsPanel: SettingsPanel;

// ---------- ステータス表示 ----------
function showStatus(message: string, isError = false): void {
  const statusEl = document.getElementById('status-message');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = 'status-message ' + (isError ? 'status-error' : 'status-success');
  statusEl.style.display = 'block';
  // 3秒後に非表示
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

// ---------- コンポーネントを DOM に追加 ----------
function mountComponents(initialConfig: AppConfig): void {
  const formContainer = document.getElementById('form-container');
  if (!formContainer) {
    console.error('form-container が見つかりません');
    return;
  }

  // 1. マイクデバイス選択
  audioDeviceSelector = new AudioDeviceSelector({
    initialDeviceId: initialConfig.audioDeviceId,
    onChange: (deviceId) => {
      currentConfig.audioDeviceId = deviceId;
    },
  });
  formContainer.appendChild(audioDeviceSelector.getElement());

  // 2. 画像ピッカー
  imagePicker = new ImagePicker({
    initialImages: initialConfig.images,
    onChange: (images) => {
      currentConfig.images = { ...currentConfig.images, ...images } as ImageConfig;
    },
  });
  formContainer.appendChild(imagePicker.getElement());

  // 3. 感度・瞬き設定パネル
  settingsPanel = new SettingsPanel({
    initialValues: {
      threshold: initialConfig.threshold,
      smoothingTimeConstant: initialConfig.smoothingTimeConstant,
      lipSyncCycleMs: initialConfig.lipSyncCycleMs,
      blinkIntervalBase: initialConfig.blinkIntervalBase,
    },
    initialBackgroundColor: initialConfig.backgroundColor,
    onChange: (values) => {
      currentConfig.threshold = values.threshold;
      currentConfig.smoothingTimeConstant = values.smoothingTimeConstant;
      currentConfig.lipSyncCycleMs = values.lipSyncCycleMs;
      currentConfig.blinkIntervalBase = values.blinkIntervalBase;
    },
    onBackgroundColorChange: (color) => {
      currentConfig.backgroundColor = color;
    },
  });
  formContainer.appendChild(settingsPanel.getElement());
}

// ---------- 保存処理 ----------
async function saveConfig(): Promise<void> {
  const saveButton = document.getElementById('save-button') as HTMLButtonElement | null;
  if (saveButton) saveButton.disabled = true;

  try {
    const result = await ipcClient.setConfig(currentConfig);
    if (result.success) {
      showStatus('設定を保存しました');
    } else {
      showStatus('保存に失敗しました', true);
    }
  } catch (err) {
    console.error('設定保存エラー:', err);
    showStatus('保存中にエラーが発生しました', true);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

// ---------- メイン処理 ----------
async function main(): Promise<void> {
  // メインプロセスから現在の設定を取得
  let config = await ipcClient.getConfig();

  if (!config) {
    // 設定が未作成の場合はデフォルト値でフォールバック
    console.warn('設定が取得できませんでした。デフォルト値を使用します。');
    config = { images: { closed_open: '', open_open: '' }, ...DEFAULT_CONFIG };
  }

  // 作業用コピーを初期化
  currentConfig = { ...config };

  // コンポーネントをマウント
  mountComponents(config);

  // 保存ボタンのイベントリスナー
  const saveButton = document.getElementById('save-button');
  if (saveButton) {
    saveButton.addEventListener('click', () => {
      void saveConfig();
    });
  }

  // メインプロセスから設定更新通知を受け取ったとき（別ウィンドウ等から変更された場合）
  ipcClient.onConfigUpdated((updatedConfig: AppConfig) => {
    currentConfig = { ...updatedConfig };
    // 各コンポーネントの表示値を更新
    if (audioDeviceSelector) {
      audioDeviceSelector.setValue(updatedConfig.audioDeviceId);
    }
    if (imagePicker) {
      imagePicker.setValues(updatedConfig.images);
    }
    if (settingsPanel) {
      settingsPanel.setValues({
        threshold: updatedConfig.threshold,
        smoothingTimeConstant: updatedConfig.smoothingTimeConstant,
        lipSyncCycleMs: updatedConfig.lipSyncCycleMs,
        blinkIntervalBase: updatedConfig.blinkIntervalBase,
        backgroundColor: updatedConfig.backgroundColor,
      });
    }
  });
}

// DOMContentLoaded 後に起動
document.addEventListener('DOMContentLoaded', () => {
  void main();
});
