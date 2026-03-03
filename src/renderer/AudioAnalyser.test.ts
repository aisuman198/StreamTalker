import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AudioAnalyser } from './AudioAnalyser';
import { DEFAULT_CONFIG } from '../shared/constants';

// ---------------------------------------------------------------------------
// Helper: AudioContext のモックを差し替えてテスト内で analyserNode を制御する
// vi.fn() はESMでnewできないためclassで定義する
// ---------------------------------------------------------------------------

function createMockAudioContext(fillValue: number, initialState: AudioContextState = 'running') {
  const mockAnalyser = {
    fftSize: 256,
    frequencyBinCount: 128,
    smoothingTimeConstant: 0.3,
    connect: vi.fn(),
    getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(fillValue)),
  };

  class MockAudioCtx {
    state: AudioContextState = initialState;
    resume = vi.fn(async () => { this.state = 'running'; });
    createAnalyser() { return mockAnalyser; }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    async close() {}
  }

  return { MockAudioCtx, mockAnalyser };
}

// ---------------------------------------------------------------------------
// 音量計算メモ:
//   volume = Math.sqrt(sum / length) / 255
//   sum = fillValue^2 * length  →  volume = fillValue / 255
//   threshold = 0.15 (DEFAULT_CONFIG)
//   fillValue=200 → volume≈0.784 > threshold(0.15)  → 発話開始 → リップシンク
//   fillValue=20  → volume≈0.078 < threshold(0.15)  → 発話なし → 'closed'
//   fillValue=0   → volume=0    < threshold(0.15)   → 発話なし → 'closed'
//
// リップシンクシーケンス (lipSyncCycleMs ごとに進む):
//   step0: 'open' → step1: 'half' → step2: 'closed' → step3: 'half' → step0: 'open' ...
// ---------------------------------------------------------------------------

describe('AudioAnalyser', () => {
  // -----------------------------------------------------------------------
  // 1. 初期状態のテスト
  // -----------------------------------------------------------------------
  describe('初期状態', () => {
    it('mouthState の初期値が "closed" であること', () => {
      const analyser = new AudioAnalyser();
      expect(analyser.mouthState).toBe('closed');
    });
  });

  // -----------------------------------------------------------------------
  // 2. AudioContext.resume() のテスト（OBS autoplay policy 対策）
  // -----------------------------------------------------------------------
  describe('AudioContext.resume() 対策', () => {
    it('AudioContext が suspended 状態の場合、start() で resume() が呼ばれること', async () => {
      const { MockAudioCtx } = createMockAudioContext(0, 'suspended');
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const analyser = new AudioAnalyser();
      await analyser.start();

      // resume が呼ばれていることを確認
      const ctx = (analyser as unknown as { audioContext: InstanceType<typeof MockAudioCtx> }).audioContext;
      expect(ctx.resume).toHaveBeenCalledOnce();

      await analyser.stop();
    });

    it('AudioContext が running 状態の場合、resume() は呼ばれないこと', async () => {
      const { MockAudioCtx } = createMockAudioContext(0, 'running');
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const analyser = new AudioAnalyser();
      await analyser.start();

      const ctx = (analyser as unknown as { audioContext: InstanceType<typeof MockAudioCtx> }).audioContext;
      expect(ctx.resume).not.toHaveBeenCalled();

      await analyser.stop();
    });
  });

  // -----------------------------------------------------------------------
  // 3. volume / audioContextState / speaking ゲッターのテスト
  // -----------------------------------------------------------------------
  describe('デバッグ用ゲッター', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('音声あり時に volume が閾値を超える値になること', async () => {
      const { MockAudioCtx } = createMockAudioContext(200); // volume ≈ 0.784
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const analyser = new AudioAnalyser();
      await analyser.start();
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(analyser.volume).toBeGreaterThan(DEFAULT_CONFIG.threshold);
      await analyser.stop();
    });

    it('無音時に volume が 0 であること', async () => {
      const { MockAudioCtx } = createMockAudioContext(0);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const analyser = new AudioAnalyser();
      await analyser.start();
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(analyser.volume).toBe(0);
      await analyser.stop();
    });

    it('start() 前の audioContextState が "not_started" であること', () => {
      const analyser = new AudioAnalyser();
      expect(analyser.audioContextState).toBe('not_started');
    });

    it('発話中は speaking が true になること', async () => {
      const { MockAudioCtx } = createMockAudioContext(200);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const analyser = new AudioAnalyser();
      await analyser.start();
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(analyser.speaking).toBe(true);
      await analyser.stop();
    });
  });

  // -----------------------------------------------------------------------
  // 4. getAudioDevices() のテスト
  // -----------------------------------------------------------------------
  describe('getAudioDevices()', () => {
    it('setup.ts のモックを使ってデバイス一覧を返すこと', async () => {
      const devices = await AudioAnalyser.getAudioDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceId).toBe('default');
      expect(devices[0].label).toBe('Default Microphone');
    });

    it('audioinput デバイスのみを返すこと', async () => {
      // audioinput 以外も含むデバイスリストに差し替え
      vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValueOnce([
        { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone 1', groupId: '', toJSON: () => ({}) },
        { kind: 'videoinput', deviceId: 'cam1', label: 'Camera 1', groupId: '', toJSON: () => ({}) },
        { kind: 'audiooutput', deviceId: 'spk1', label: 'Speaker 1', groupId: '', toJSON: () => ({}) },
        { kind: 'audioinput', deviceId: 'mic2', label: 'Microphone 2', groupId: '', toJSON: () => ({}) },
      ]);

      const devices = await AudioAnalyser.getAudioDevices();
      expect(devices).toHaveLength(2);
      devices.forEach(d => expect(d.kind).toBe('audioinput'));
    });
  });

  // -----------------------------------------------------------------------
  // 3. 発話検出のテスト（start() + fake timers 経由）
  // -----------------------------------------------------------------------
  describe('発話検出', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('高音量データの場合、発話開始してリップシンクが始まること（最初のステップは "open"）', async () => {
      // fillValue=200 → volume≈0.784 > threshold(0.15)
      const { MockAudioCtx } = createMockAudioContext(200);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      await audioAnalyser.start();

      // pollingInterval (50ms) 分タイマーを進める → 発話開始 → step0: 'open'
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(audioAnalyser.mouthState).toBe('open');

      await audioAnalyser.stop();
    });

    it('無音（全0）の場合、mouthState が "closed" のままであること', async () => {
      // fillValue=0 → volume=0 < threshold(0.15)
      const { MockAudioCtx } = createMockAudioContext(0);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser();
      await audioAnalyser.start();

      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(audioAnalyser.mouthState).toBe('closed');

      await audioAnalyser.stop();
    });

    it('閾値未満の音量では発話とみなさず "closed" のままであること', async () => {
      // fillValue=20 → volume≈0.078 < threshold(0.15)
      const { MockAudioCtx } = createMockAudioContext(20);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser();
      await audioAnalyser.start();

      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(audioAnalyser.mouthState).toBe('closed');

      await audioAnalyser.stop();
    });
  });

  // -----------------------------------------------------------------------
  // 4. リップシンクアニメーションのテスト
  // -----------------------------------------------------------------------
  describe('リップシンクアニメーション', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('発話中にシーケンス open→half→closed→half→open が循環すること', async () => {
      const { MockAudioCtx } = createMockAudioContext(200);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      await audioAnalyser.start();

      // ポーリング発火 → 発話開始 → step0: 'open'
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('open');

      // 100ms → step1: 'half'
      vi.advanceTimersByTime(100);
      expect(audioAnalyser.mouthState).toBe('half');

      // 100ms → step2: 'closed'
      vi.advanceTimersByTime(100);
      expect(audioAnalyser.mouthState).toBe('closed');

      // 100ms → step3: 'half'
      vi.advanceTimersByTime(100);
      expect(audioAnalyser.mouthState).toBe('half');

      // 100ms → step0に戻る: 'open'
      vi.advanceTimersByTime(100);
      expect(audioAnalyser.mouthState).toBe('open');

      await audioAnalyser.stop();
    });

    it('音声が止まるとリップシンクが停止して "closed" になること', async () => {
      let fillValue = 200;
      const mockAnalyser = {
        fftSize: 256,
        frequencyBinCount: 128,
        smoothingTimeConstant: 0.3,
        connect: vi.fn(),
        getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(fillValue)),
      };

      class MockAudioCtx {
        createAnalyser() { return mockAnalyser; }
        createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
        async close() {}
      }
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      await audioAnalyser.start();

      // 発話開始 → 'open'
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('open');

      // 音声を止める
      fillValue = 0;

      // ポーリング発火 → 発話終了 → 'closed'
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('closed');

      // その後もリップシンクタイマーが動いていないことを確認
      vi.advanceTimersByTime(500);
      expect(audioAnalyser.mouthState).toBe('closed');

      await audioAnalyser.stop();
    });
  });

  // -----------------------------------------------------------------------
  // 5. onMouthStateChange() コールバックのテスト
  // -----------------------------------------------------------------------
  describe('onMouthStateChange()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('発話開始時にコールバックが呼ばれること', async () => {
      const { MockAudioCtx } = createMockAudioContext(200);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      const callback = vi.fn();
      audioAnalyser.onMouthStateChange(callback);

      await audioAnalyser.start();
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith('open');

      await audioAnalyser.stop();
    });

    it('無音では状態が変化しないのでコールバックが呼ばれないこと', async () => {
      const { MockAudioCtx } = createMockAudioContext(0);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser();
      const callback = vi.fn();
      audioAnalyser.onMouthStateChange(callback);

      await audioAnalyser.start();
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval * 5);

      expect(callback).not.toHaveBeenCalled();

      await audioAnalyser.stop();
    });

    it('発話開始・終了でコールバックが順に呼ばれること', async () => {
      let fillValue = 200;
      const mockAnalyser = {
        fftSize: 256,
        frequencyBinCount: 128,
        smoothingTimeConstant: 0.3,
        connect: vi.fn(),
        getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(fillValue)),
      };

      class MockAudioCtx {
        createAnalyser() { return mockAnalyser; }
        createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
        async close() {}
      }
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      const callback = vi.fn();
      audioAnalyser.onMouthStateChange(callback);

      await audioAnalyser.start();

      // 1回目ポーリング: 高音量 → 'open'
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('open');

      // 音量を無音に変更
      fillValue = 0;

      // 2回目ポーリング: 無音 → 'closed'
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('closed');

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenNthCalledWith(1, 'open');
      expect(callback).toHaveBeenNthCalledWith(2, 'closed');

      await audioAnalyser.stop();
    });
  });

  // -----------------------------------------------------------------------
  // 6. stop() のテスト
  // -----------------------------------------------------------------------
  describe('stop()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('stop() 後に mouthState が "closed" になること', async () => {
      const { MockAudioCtx } = createMockAudioContext(200);
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      await audioAnalyser.start();

      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('open');

      await audioAnalyser.stop();

      expect(audioAnalyser.mouthState).toBe('closed');
    });

    it('stop() 後はポーリングもリップシンクも停止すること', async () => {
      let fillValue = 200;
      const mockAnalyser = {
        fftSize: 256,
        frequencyBinCount: 128,
        smoothingTimeConstant: 0.3,
        connect: vi.fn(),
        getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(fillValue)),
      };

      class MockAudioCtx {
        createAnalyser() { return mockAnalyser; }
        createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
        async close() {}
      }
      vi.stubGlobal('AudioContext', MockAudioCtx);

      const audioAnalyser = new AudioAnalyser({ lipSyncCycleMs: 100 });
      await audioAnalyser.start();

      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval);
      expect(audioAnalyser.mouthState).toBe('open');

      await audioAnalyser.stop();
      expect(audioAnalyser.mouthState).toBe('closed');

      // stop後はタイマーを進めても状態が変わらない
      fillValue = 200;
      vi.advanceTimersByTime(DEFAULT_CONFIG.pollingInterval * 5 + 500);
      expect(audioAnalyser.mouthState).toBe('closed');
    });
  });
});
