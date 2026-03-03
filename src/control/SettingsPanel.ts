/**
 * SettingsPanel
 *
 * 感度・瞬き設定スライダーコンポーネント。
 * threshold / smoothingTimeConstant / blinkIntervalBase の3つのスライダーを提供する。
 */

import type { AppConfig } from '../shared/types';

export type SettingsValue = Pick<
  AppConfig,
  'threshold' | 'smoothingTimeConstant' | 'lipSyncCycleMs' | 'blinkIntervalBase'
>;

export interface SettingsPanelOptions {
  /** 値変更時のコールバック */
  onChange: (values: SettingsValue) => void;
  /** 初期値 */
  initialValues?: Partial<SettingsValue>;
  /** 背景色の初期値 */
  initialBackgroundColor?: string;
  /** 背景色変更時のコールバック */
  onBackgroundColorChange?: (color: string) => void;
}

interface SliderConfig {
  key: keyof SettingsValue;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  /** 表示用フォーマッター */
  format: (v: number) => string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'threshold',
    label: '音量閾値（Threshold）',
    min: 0.01,
    max: 0.5,
    step: 0.01,
    defaultValue: 0.15,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'smoothingTimeConstant',
    label: '平滑化係数（Smoothing）',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: 0.3,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'lipSyncCycleMs',
    label: '口パク速度（LipSync Cycle）',
    min: 50,
    max: 500,
    step: 25,
    defaultValue: 150,
    format: (v) => `${v} ms`,
  },
  {
    key: 'blinkIntervalBase',
    label: '瞬き間隔（基準値）',
    min: 1000,
    max: 10000,
    step: 500,
    defaultValue: 4000,
    format: (v) => `${v} ms`,
  },
];

export class SettingsPanel {
  private container: HTMLDivElement;
  private onChange: (values: SettingsValue) => void;
  private onBackgroundColorChange?: (color: string) => void;
  private values: SettingsValue;
  private colorInput: HTMLInputElement | null = null;
  /** key → { slider, valueDisplay } */
  private sliders: Map<
    keyof SettingsValue,
    { slider: HTMLInputElement; valueDisplay: HTMLSpanElement }
  > = new Map();

  constructor(options: SettingsPanelOptions) {
    this.onChange = options.onChange;
    this.onBackgroundColorChange = options.onBackgroundColorChange;

    // 初期値（デフォルト値をベースに上書き）
    this.values = {
      threshold: options.initialValues?.threshold ?? 0.15,
      smoothingTimeConstant: options.initialValues?.smoothingTimeConstant ?? 0.3,
      lipSyncCycleMs: options.initialValues?.lipSyncCycleMs ?? 150,
      blinkIntervalBase: options.initialValues?.blinkIntervalBase ?? 4000,
    };

    this.container = document.createElement('div');
    this.container.className = 'settings-panel';

    const title = document.createElement('h3');
    title.textContent = '感度・瞬き設定';
    title.className = 'section-title';
    this.container.appendChild(title);

    this.buildColorPicker(options.initialBackgroundColor ?? '#00FF00');

    for (const config of SLIDER_CONFIGS) {
      this.buildSlider(config);
    }
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  /** 現在の設定値を取得 */
  getValues(): SettingsValue {
    return { ...this.values };
  }

  /** 外部から値をセット */
  setValues(values: Partial<SettingsValue> & { backgroundColor?: string }): void {
    for (const config of SLIDER_CONFIGS) {
      const key = config.key;
      const newVal = values[key];
      if (newVal !== undefined) {
        this.values[key] = newVal;
        const entry = this.sliders.get(key);
        if (entry) {
          entry.slider.value = String(newVal);
          entry.valueDisplay.textContent = config.format(newVal);
        }
      }
    }
    if (values.backgroundColor !== undefined && this.colorInput) {
      this.colorInput.value = values.backgroundColor;
    }
  }

  // ---------- private ----------

  private buildColorPicker(initialColor: string): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label-row';

    const label = document.createElement('label');
    label.htmlFor = 'color-background';
    label.textContent = '背景色（OBS クロマキー用）';
    label.className = 'form-label';
    labelRow.appendChild(label);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.id = 'color-background';
    colorInput.value = initialColor;
    colorInput.className = 'color-picker';

    colorInput.addEventListener('input', () => {
      this.onBackgroundColorChange?.(colorInput.value);
    });

    this.colorInput = colorInput;

    wrapper.appendChild(labelRow);
    wrapper.appendChild(colorInput);
    this.container.appendChild(wrapper);
  }

  private buildSlider(config: SliderConfig): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-group';

    // ラベル行（ラベル + 現在値表示）
    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label-row';

    const label = document.createElement('label');
    label.htmlFor = `slider-${config.key}`;
    label.textContent = config.label;
    label.className = 'form-label';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'slider-value';
    valueDisplay.textContent = config.format(this.values[config.key]);

    labelRow.appendChild(label);
    labelRow.appendChild(valueDisplay);

    // スライダー
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.id = `slider-${config.key}`;
    slider.className = 'range-slider';
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(this.values[config.key]);

    this.sliders.set(config.key, { slider, valueDisplay });

    slider.addEventListener('input', () => {
      const newVal = parseFloat(slider.value);
      this.values[config.key] = newVal;
      valueDisplay.textContent = config.format(newVal);
      this.onChange(this.getValues());
    });

    // 最小・最大ラベル行
    const rangeLabels = document.createElement('div');
    rangeLabels.className = 'range-labels';
    const minLabel = document.createElement('span');
    minLabel.textContent = config.format(config.min);
    const maxLabel = document.createElement('span');
    maxLabel.textContent = config.format(config.max);
    rangeLabels.appendChild(minLabel);
    rangeLabels.appendChild(maxLabel);

    wrapper.appendChild(labelRow);
    wrapper.appendChild(slider);
    wrapper.appendChild(rangeLabels);

    this.container.appendChild(wrapper);
  }
}
