/**
 * ImagePicker
 *
 * 画像ファイルピッカーコンポーネント。
 * 9パターン（ImageStateKey）それぞれに対応したファイル入力フィールドとプレビューを提供する。
 * Electron 環境では file input の files[0].path でローカルパスを取得できる。
 */

import type { ImageConfig } from '../shared/types';

/** Electron 拡張: File オブジェクトに path プロパティが存在する */
interface ElectronFile extends File {
  path: string;
}

export interface ImagePickerPattern {
  /** ImageConfig のキー名 */
  key: keyof ImageConfig;
  /** UI に表示するラベル */
  label: string;
  /** 必須かどうか */
  required: boolean;
}

/** 全9パターンの定義 */
const IMAGE_PATTERNS: ImagePickerPattern[] = [
  { key: 'closed_open',   label: '口: 閉 / 目: 開（ニュートラル）', required: true  },
  { key: 'open_open',     label: '口: 開 / 目: 開（発話中）',       required: true  },
  { key: 'half_open',     label: '口: 半 / 目: 開',                 required: false },
  { key: 'closed_half',   label: '口: 閉 / 目: 半',                 required: false },
  { key: 'closed_closed', label: '口: 閉 / 目: 閉（瞬き完了）',   required: false },
  { key: 'open_half',     label: '口: 開 / 目: 半',                 required: false },
  { key: 'open_closed',   label: '口: 開 / 目: 閉',                 required: false },
  { key: 'half_half',     label: '口: 半 / 目: 半',                 required: false },
  { key: 'half_closed',   label: '口: 半 / 目: 閉',                 required: false },
];

export interface ImagePickerOptions {
  /** 画像変更時のコールバック */
  onChange: (images: Partial<ImageConfig>) => void;
  /** 初期値 */
  initialImages?: Partial<ImageConfig>;
}

export class ImagePicker {
  private container: HTMLDivElement;
  private onChange: (images: Partial<ImageConfig>) => void;
  /** key → { input, preview } のマップ */
  private fields: Map<
    keyof ImageConfig,
    { input: HTMLInputElement; preview: HTMLImageElement; pathValue: string }
  > = new Map();

  constructor(options: ImagePickerOptions) {
    this.onChange = options.onChange;
    this.container = document.createElement('div');
    this.container.className = 'image-picker';

    const title = document.createElement('h3');
    title.textContent = '画像ファイル設定';
    title.className = 'section-title';
    this.container.appendChild(title);

    for (const pattern of IMAGE_PATTERNS) {
      this.buildField(pattern, options.initialImages);
    }
  }

  getElement(): HTMLDivElement {
    return this.container;
  }

  /** 現在設定されているパスマップを返す */
  getValues(): Partial<ImageConfig> {
    const result: Partial<ImageConfig> = {};
    for (const [key, field] of this.fields.entries()) {
      if (field.pathValue) {
        (result as Record<string, string>)[key] = field.pathValue;
      }
    }
    return result;
  }

  /** 外部から値をセット（保存済み設定の反映など） */
  setValues(images: Partial<ImageConfig>): void {
    for (const [key, field] of this.fields.entries()) {
      const path = (images as Record<string, string | undefined>)[key];
      if (path) {
        field.pathValue = path;
        this.updatePreview(field.preview, path);
      }
    }
  }

  // ---------- private ----------

  private buildField(
    pattern: ImagePickerPattern,
    initialImages?: Partial<ImageConfig>
  ): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'image-field' + (pattern.required ? ' required' : '');

    // ラベル
    const label = document.createElement('label');
    label.htmlFor = `img-${pattern.key}`;
    label.textContent = pattern.label + (pattern.required ? ' *' : '');
    label.className = 'form-label';

    // ファイル入力
    const input = document.createElement('input');
    input.type = 'file';
    input.id = `img-${pattern.key}`;
    input.className = 'file-input';
    input.accept = 'image/*';

    // プレビュー
    const preview = document.createElement('img');
    preview.className = 'image-preview';
    preview.alt = pattern.label;
    preview.style.display = 'none';

    // 初期パス
    const initialPath =
      (initialImages as Record<string, string | undefined> | undefined)?.[
        pattern.key
      ] ?? '';

    const fieldEntry = { input, preview, pathValue: initialPath };
    this.fields.set(pattern.key, fieldEntry);

    if (initialPath) {
      this.updatePreview(preview, initialPath);
    }

    input.addEventListener('change', () => {
      const file = input.files?.[0] as ElectronFile | undefined;
      if (!file) return;

      // Electron 環境ではローカルパスが取得できる
      const localPath = file.path || '';
      fieldEntry.pathValue = localPath;

      // file:// プロトコルでプレビュー表示
      const previewUrl = localPath
        ? `file://${localPath}`
        : URL.createObjectURL(file);
      this.updatePreview(preview, previewUrl);

      this.notifyChange();
    });

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    wrapper.appendChild(preview);
    this.container.appendChild(wrapper);
  }

  private updatePreview(preview: HTMLImageElement, path: string): void {
    if (!path) {
      preview.style.display = 'none';
      preview.src = '';
      return;
    }
    // file://で始まらない場合は付加
    const src =
      path.startsWith('file://') || path.startsWith('blob:')
        ? path
        : `file://${path}`;
    preview.src = src;
    preview.style.display = 'block';
  }

  private notifyChange(): void {
    this.onChange(this.getValues());
  }
}
