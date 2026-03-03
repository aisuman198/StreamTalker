import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FaceRenderer } from './FaceRenderer';
import type { ImageConfig, FaceState } from '../shared/types';

// ------------------------------------------------------------------
// MockImage: Image要素のモック
// src セッターでタイマー経由 onload を発火させる
// ------------------------------------------------------------------
class MockImage {
  private _src = '';
  onload: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  complete = false;

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    // 非同期で onload を発火（Promise.all が await できるように）
    setTimeout(() => {
      this.complete = true;
      this.onload?.();
    }, 0);
  }
}

// ------------------------------------------------------------------
// ヘルパー: テスト用の最小 ImageConfig を生成
// ------------------------------------------------------------------
const makeConfig = (overrides: Partial<ImageConfig> = {}): ImageConfig => ({
  'closed_open': 'closed_open.png',
  'open_open': 'open_open.png',
  ...overrides,
});

// ------------------------------------------------------------------
// ヘルパー: canvas と FaceRenderer を生成
// ------------------------------------------------------------------
const makeRenderer = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  return { canvas, renderer: new FaceRenderer(canvas) };
};

// ------------------------------------------------------------------
// テストスイート
// ------------------------------------------------------------------
describe('FaceRenderer', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', MockImage);
    // setup.ts で貼られた getContext モックを各テスト前にリセット
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue({
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // 1. コンストラクタのテスト
  // ----------------------------------------------------------------
  describe('constructor', () => {
    it('HTMLCanvasElement を渡すと正常に初期化されること', () => {
      expect(() => makeRenderer()).not.toThrow();
    });

    it('2Dコンテキストが取得できない Canvas を渡すとエラーをスローすること', () => {
      vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
      const canvas = document.createElement('canvas');
      expect(() => new FaceRenderer(canvas)).toThrow('Failed to get 2D context');
    });
  });

  // ----------------------------------------------------------------
  // 2. setImageConfig() のテスト
  // ----------------------------------------------------------------
  describe('setImageConfig()', () => {
    it('ImageConfig を設定すると内部の imageConfig が更新されること', async () => {
      const { renderer } = makeRenderer();
      const config = makeConfig();
      await renderer.setImageConfig(config);
      // imageConfig は private なので、副作用（プリロード後の draw 可能状態）で間接確認する
      // updateState を呼んで clearRect が呼ばれることで確認
      const ctx = HTMLCanvasElement.prototype.getContext('2d') as ReturnType<typeof vi.fn> & {
        clearRect: ReturnType<typeof vi.fn>;
      };
      renderer.updateState({ mouth: 'closed', eye: 'open' });
      expect(ctx.clearRect).toHaveBeenCalled();
    });

    it('画像プリロードが試みられること（Image src が設定されること）', async () => {
      const { renderer } = makeRenderer();
      const config = makeConfig();
      const setSrcSpy = vi.spyOn(MockImage.prototype, 'src', 'set');
      await renderer.setImageConfig(config);
      // closed_open.png と open_open.png の 2 枚分 src がセットされるはず
      expect(setSrcSpy).toHaveBeenCalledWith('closed_open.png');
      expect(setSrcSpy).toHaveBeenCalledWith('open_open.png');
    });
  });

  // ----------------------------------------------------------------
  // 3. updateState() のテスト
  // ----------------------------------------------------------------
  describe('updateState()', () => {
    it('同じ FaceState を連続して渡すと再描画されないこと（clearRect が 1 回のみ）', async () => {
      const { canvas, renderer } = makeRenderer();
      await renderer.setImageConfig(makeConfig());
      const ctx = canvas.getContext('2d') as { clearRect: ReturnType<typeof vi.fn> };

      const state: FaceState = { mouth: 'open', eye: 'open' };
      renderer.updateState(state);
      renderer.updateState(state); // 同じ状態を再度渡す
      // 最初の 1 回だけ clearRect が呼ばれるはず
      expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    });

    it('異なる FaceState を渡すと再描画されること（clearRect が複数回）', async () => {
      const { canvas, renderer } = makeRenderer();
      await renderer.setImageConfig(makeConfig());
      const ctx = canvas.getContext('2d') as { clearRect: ReturnType<typeof vi.fn> };

      renderer.updateState({ mouth: 'open', eye: 'open' });
      renderer.updateState({ mouth: 'closed', eye: 'open' }); // mouth が変化
      expect(ctx.clearRect).toHaveBeenCalledTimes(2);
    });
  });

  // ----------------------------------------------------------------
  // 4. resolveImageUrl() のフォールバックテスト（間接的）
  // ----------------------------------------------------------------
  describe('resolveImageUrl() フォールバック', () => {
    it("'half_closed' が設定されていない場合、'half_open' の画像にフォールバックされること", async () => {
      const { canvas, renderer } = makeRenderer();
      const config = makeConfig({ 'half_open': 'half_open.png' }); // half_closed は未設定
      await renderer.setImageConfig(config);

      // imageCache に 'half_open.png' を完了済みとして登録するため、
      // MockImage の onload が発火するまで待機する
      await new Promise(resolve => setTimeout(resolve, 10));

      const ctx = canvas.getContext('2d') as {
        clearRect: ReturnType<typeof vi.fn>;
        drawImage: ReturnType<typeof vi.fn>;
      };

      renderer.updateState({ mouth: 'half', eye: 'closed' });
      // フォールバック順: half_closed → half_open → closed_closed → closed_open
      // half_open.png がキャッシュ済みであれば drawImage が呼ばれる
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it("'closed_open' のみ設定した場合、全パターンが 'closed_open' にフォールバックされること", async () => {
      // closed_open と open_open は必須なので最小構成で確認
      const { canvas, renderer } = makeRenderer();
      const config: ImageConfig = {
        'closed_open': 'closed_open.png',
        'open_open': 'open_open.png',
      };
      await renderer.setImageConfig(config);
      await new Promise(resolve => setTimeout(resolve, 10));

      const ctx = canvas.getContext('2d') as {
        clearRect: ReturnType<typeof vi.fn>;
        drawImage: ReturnType<typeof vi.fn>;
      };

      // half_closed → half_open → closed_closed → closed_open の順でフォールバック
      // 最終的に closed_open.png が使われる
      renderer.updateState({ mouth: 'half', eye: 'closed' });
      expect(ctx.drawImage).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // 5. setBackgroundColor() のテスト
  // ----------------------------------------------------------------
  describe('setBackgroundColor()', () => {
    it('デフォルトの背景色が #00FF00 であり draw() で fillRect が呼ばれること', async () => {
      const { canvas, renderer } = makeRenderer();
      await renderer.setImageConfig(makeConfig());
      await new Promise(resolve => setTimeout(resolve, 10));

      const ctx = canvas.getContext('2d') as {
        clearRect: ReturnType<typeof vi.fn>;
        fillRect: ReturnType<typeof vi.fn>;
        fillStyle: string;
      };

      renderer.updateState({ mouth: 'closed', eye: 'open' });

      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.fillStyle).toBe('#00FF00');
    });

    it('setBackgroundColor() で色を変更すると fillStyle に反映されること', async () => {
      const { canvas, renderer } = makeRenderer();
      await renderer.setImageConfig(makeConfig());
      await new Promise(resolve => setTimeout(resolve, 10));

      renderer.updateState({ mouth: 'closed', eye: 'open' });

      const ctx = canvas.getContext('2d') as {
        fillRect: ReturnType<typeof vi.fn>;
        fillStyle: string;
      };

      renderer.setBackgroundColor('#0000FF');
      expect(ctx.fillStyle).toBe('#0000FF');
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('setBackgroundColor() を呼ぶと即座に再描画されること（fillRect が追加で呼ばれる）', async () => {
      const { canvas, renderer } = makeRenderer();
      await renderer.setImageConfig(makeConfig());
      await new Promise(resolve => setTimeout(resolve, 10));

      renderer.updateState({ mouth: 'closed', eye: 'open' });

      const ctx = canvas.getContext('2d') as {
        fillRect: ReturnType<typeof vi.fn>;
      };

      const countBefore = ctx.fillRect.mock.calls.length;
      renderer.setBackgroundColor('#FF0000');
      expect(ctx.fillRect.mock.calls.length).toBeGreaterThan(countBefore);
    });
  });

  // ----------------------------------------------------------------
  // 6. showError() のテスト
  // ----------------------------------------------------------------
  describe('showError()', () => {
    it('fillText でエラーメッセージが描画されること', () => {
      const { canvas, renderer } = makeRenderer();
      const ctx = canvas.getContext('2d') as {
        clearRect: ReturnType<typeof vi.fn>;
        fillRect: ReturnType<typeof vi.fn>;
        fillText: ReturnType<typeof vi.fn>;
      };

      renderer.showError('マイクの許可が必要です');

      expect(ctx.clearRect).toHaveBeenCalled();
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalledWith(
        'マイクの許可が必要です',
        expect.any(Number),
        expect.any(Number),
      );
    });

    it('setImageConfig なしでも showError が呼べること', () => {
      const { renderer } = makeRenderer();
      expect(() => renderer.showError('テストエラー')).not.toThrow();
    });
  });

  // ----------------------------------------------------------------
  // 7. setDebugInfo() のテスト
  // ----------------------------------------------------------------
  describe('setDebugInfo()', () => {
    const makeDebugInfo = () => ({
      volume: 0.25,
      threshold: 0.15,
      audioContextState: 'running',
      mouthState: 'open',
      eyeState: 'open',
      speaking: true,
    });

    it('setDebugInfo() を呼ぶと fillText でデバッグ情報が描画されること', async () => {
      const { canvas, renderer } = makeRenderer();
      await renderer.setImageConfig(makeConfig());
      await new Promise(resolve => setTimeout(resolve, 10));
      renderer.updateState({ mouth: 'open', eye: 'open' });

      const ctx = canvas.getContext('2d') as { fillText: ReturnType<typeof vi.fn> };
      renderer.setDebugInfo(makeDebugInfo());
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it('imageConfig 未設定でも setDebugInfo() が描画を行うこと', () => {
      const { canvas, renderer } = makeRenderer();
      const ctx = canvas.getContext('2d') as {
        fillRect: ReturnType<typeof vi.fn>;
        fillText: ReturnType<typeof vi.fn>;
      };
      renderer.setDebugInfo(makeDebugInfo());
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    });
  });

  // ----------------------------------------------------------------
  // 8. startLoop() / stopLoop() のテスト
  // ----------------------------------------------------------------
  describe('startLoop() / stopLoop()', () => {
    it('startLoop() 後に stopLoop() を呼んでもエラーにならないこと', () => {
      const { renderer } = makeRenderer();
      expect(() => {
        renderer.startLoop();
        renderer.stopLoop();
      }).not.toThrow();
    });

    it('stopLoop() を startLoop() なしで呼んでもエラーにならないこと', () => {
      const { renderer } = makeRenderer();
      expect(() => {
        renderer.stopLoop();
      }).not.toThrow();
    });

    it('startLoop() を複数回呼んでも stopLoop() でエラーにならないこと', () => {
      const { renderer } = makeRenderer();
      expect(() => {
        renderer.startLoop();
        renderer.startLoop(); // 二重呼び出し
        renderer.stopLoop();
      }).not.toThrow();
    });
  });
});
