import type { FaceState, ImageConfig, MouthState, EyeState } from '../shared/types';
import { DEFAULT_CONFIG, PREVIEW_SERVER_PORT } from '../shared/constants';

export interface DebugInfo {
  volume: number;
  threshold: number;
  audioContextState: string;
  mouthState: string;
  eyeState: string;
  speaking: boolean;
}

export class FaceRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageCache = new Map<string, HTMLImageElement>();
  private currentState: FaceState | null = null;
  private imageConfig: ImageConfig | null = null;
  private animFrameId: number | null = null;
  private backgroundColor: string = DEFAULT_CONFIG.backgroundColor;
  private debugInfo: DebugInfo | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;
  }

  // 画像設定を更新（設定変更時に呼ぶ）
  async setImageConfig(config: ImageConfig): Promise<void> {
    this.imageConfig = config;
    // 設定された画像をプリロード（一部失敗しても他の画像は継続してロード）
    const urls = Object.values(config).filter(Boolean) as string[];
    await Promise.allSettled(urls.map(url => this.loadImage(url)));
  }

  // FaceStateを更新（変化があった時のみ再描画）
  updateState(state: FaceState): void {
    const changed =
      !this.currentState ||
      this.currentState.mouth !== state.mouth ||
      this.currentState.eye !== state.eye;

    if (changed) {
      this.currentState = { ...state };
      this.draw();
    }
  }

  // アニメーションループ開始（外部から呼ぶ）
  startLoop(): void {
    const loop = () => {
      this.draw();
      this.animFrameId = requestAnimationFrame(loop);
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  stopLoop(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  // エラーメッセージをCanvasに表示（OBS上でも確認できるように）
  showError(message: string): void {
    this.clearCanvas();
    this.ctx.fillStyle = '#FF0000';
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(message, this.canvas.width / 2, this.canvas.height / 2);
  }

  // デバッグ情報を更新して再描画（?debug=1 モード用）
  setDebugInfo(info: DebugInfo): void {
    this.debugInfo = info;
    this.draw();
  }

  // 背景色を設定して即座に再描画
  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
    this.draw();
  }

  private clearCanvas(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private draw(): void {
    if (!this.currentState || !this.imageConfig) {
      // 設定未完了でもデバッグオーバーレイは表示する
      if (this.debugInfo) {
        this.clearCanvas();
        this.renderDebugOverlay(this.debugInfo);
      }
      return;
    }

    this.clearCanvas();

    // フォールバックロジックで画像URLを解決
    const url = this.resolveImageUrl(this.currentState.mouth, this.currentState.eye);
    if (url) {
      const img = this.imageCache.get(url);
      if (img?.complete) {
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
      }
    }

    if (this.debugInfo) {
      this.renderDebugOverlay(this.debugInfo);
    }
  }

  private renderDebugOverlay(info: DebugInfo): void {
    const W = this.canvas.width;
    const BAR_Y = 46;
    const BAR_H = 12;
    const BAR_X = 8;
    const BAR_W = W - 16;

    // 半透明背景
    this.ctx.fillStyle = 'rgba(0,0,0,0.65)';
    this.ctx.fillRect(0, 0, W, 70);

    // 音量バー（最大 = threshold × 2 でフルスケール）
    const maxVol = info.threshold * 2;
    const barFill = Math.min(1, info.volume / maxVol) * BAR_W;
    this.ctx.fillStyle = info.speaking ? '#00CC44' : '#FFAA00';
    this.ctx.fillRect(BAR_X, BAR_Y, barFill, BAR_H);

    // 閾値ライン
    const thresholdX = BAR_X + (info.threshold / maxVol) * BAR_W;
    this.ctx.fillStyle = '#FF4444';
    this.ctx.fillRect(thresholdX, BAR_Y - 2, 2, BAR_H + 4);

    // テキスト
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = '11px monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(
      `vol:${info.volume.toFixed(3)} thr:${info.threshold.toFixed(3)} ctx:${info.audioContextState}`,
      BAR_X, 8,
    );
    this.ctx.fillText(
      `mouth:${info.mouthState}  eye:${info.eyeState}  speaking:${info.speaking}`,
      BAR_X, 22,
    );
  }

  private resolveImageUrl(mouth: MouthState, eye: EyeState): string | null {
    if (!this.imageConfig) return null;
    const config = this.imageConfig as Record<string, string | undefined>;

    const raw =
      config[`${mouth}_${eye}`] ||
      config[`${mouth}_open`] ||
      config[`closed_${eye}`] ||
      config['closed_open'] ||
      null;
    return raw ? this.toSrc(raw) : null;
  }

  /**
   * 絶対ファイルパスをプレビューサーバーの画像 API URL に変換する。
   * HTTP/data URL はそのまま返す。
   * file:// を直接使うと Electron の HTTP コンテキスト（開発時）でブロックされるため、
   * 常に http://localhost:{PREVIEW_SERVER_PORT}/api/image 経由でロードする。
   */
  private toSrc(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) return path;
    if (path.startsWith('/')) {
      // UTF-8 バイト列を base64 に変換（Node.js の Buffer.from(path).toString('base64') と等価）
      const bytes = new TextEncoder().encode(path);
      let binStr = '';
      for (let i = 0; i < bytes.length; i++) {
        binStr += String.fromCharCode(bytes[i]);
      }
      const encoded = encodeURIComponent(btoa(binStr));
      return `http://localhost:${PREVIEW_SERVER_PORT}/api/image?src=${encoded}`;
    }
    return path;
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    const src = this.toSrc(url);
    if (this.imageCache.has(src)) {
      return Promise.resolve(this.imageCache.get(src)!);
    }
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }
}
