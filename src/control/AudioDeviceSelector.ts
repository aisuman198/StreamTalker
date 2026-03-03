/**
 * AudioDeviceSelector
 *
 * マイクデバイス選択コンポーネント。
 * navigator.mediaDevices.enumerateDevices() を使ってデバイス一覧を取得し、
 * selectボックスに表示する。
 */

export interface AudioDeviceSelectorOptions {
  /** 選択変更時のコールバック */
  onChange: (deviceId: string | null) => void;
  /** 初期選択デバイスID（null = デフォルト） */
  initialDeviceId?: string | null;
}

export class AudioDeviceSelector {
  private container: HTMLDivElement;
  private select: HTMLSelectElement;
  private onChange: (deviceId: string | null) => void;

  constructor(options: AudioDeviceSelectorOptions) {
    this.onChange = options.onChange;
    this.container = document.createElement('div');
    this.container.className = 'form-group';

    const label = document.createElement('label');
    label.htmlFor = 'audio-device-select';
    label.textContent = 'マイクデバイス';
    label.className = 'form-label';

    this.select = document.createElement('select');
    this.select.id = 'audio-device-select';
    this.select.className = 'form-select';
    this.select.addEventListener('change', () => this.handleChange());

    this.container.appendChild(label);
    this.container.appendChild(this.select);

    // 非同期でデバイス一覧を取得・表示
    this.loadDevices(options.initialDeviceId ?? null);
  }

  /** DOM要素を返す */
  getElement(): HTMLDivElement {
    return this.container;
  }

  /** 選択中のデバイスIDを取得（デフォルト選択時は null） */
  getValue(): string | null {
    const val = this.select.value;
    return val === '' ? null : val;
  }

  /** 選択デバイスIDを外部からセット */
  setValue(deviceId: string | null): void {
    const target = deviceId ?? '';
    // option が存在すれば選択、なければ先頭（デフォルト）
    const exists = Array.from(this.select.options).some(
      (opt) => opt.value === target
    );
    this.select.value = exists ? target : '';
  }

  // ---------- private ----------

  private async loadDevices(initialDeviceId: string | null): Promise<void> {
    // まず「デフォルト」オプションを追加
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- デフォルトデバイス --';
    this.select.appendChild(defaultOption);

    try {
      // マイクへのアクセス権を持っていない場合はラベルが取れないため
      // getUserMedia で権限を要求してからenumerateする
      await this.requestPermissionIfNeeded();

      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');

      for (const device of audioInputs) {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.textContent =
          device.label || `マイク (${device.deviceId.slice(0, 8)}...)`;
        this.select.appendChild(option);
      }

      // 初期値セット
      this.setValue(initialDeviceId);
    } catch (err) {
      console.warn('AudioDeviceSelector: デバイス一覧の取得に失敗しました', err);
      const errOption = document.createElement('option');
      errOption.value = '';
      errOption.textContent = '（取得失敗）';
      errOption.disabled = true;
      this.select.appendChild(errOption);
    }
  }

  private async requestPermissionIfNeeded(): Promise<void> {
    // デバイスラベルを取得するためにはマイク権限が必要
    // すでに取得済みであれば getUserMedia は不要だが、簡易実装として毎回試みる
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // ストリームはすぐ停止してよい（ラベル取得目的のみ）
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // 権限拒否されても enumerateDevices 自体は実行できる（ラベルが空になるだけ）
    }
  }

  private handleChange(): void {
    const value = this.getValue();
    this.onChange(value);
  }
}
