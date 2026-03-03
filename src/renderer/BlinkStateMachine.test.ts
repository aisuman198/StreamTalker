// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BlinkStateMachine } from './BlinkStateMachine';

// intervalVariance を 0 にすることで nextBlinkInterval() の戻り値を intervalBase に固定する
const FIXED_INTERVAL = 2000; // ms
const TRANSITION = 80; // DEFAULT_CONFIG.blinkTransitionDuration

describe('BlinkStateMachine', () => {
  // ---- 初期状態のテスト ----
  describe('初期状態', () => {
    it('インスタンス生成直後は eyeState が open であること', () => {
      const bsm = new BlinkStateMachine();
      expect(bsm.eyeState).toBe('open');
    });

    it('start() 前はコールバックが呼ばれないこと', () => {
      vi.useFakeTimers();
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const callback = vi.fn();
      bsm.onEyeStateChange(callback);

      // タイマーを十分進めてもコールバックは呼ばれない
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 10);

      expect(callback).not.toHaveBeenCalled();
      vi.useRealTimers();
    });
  });

  // ---- start() / stop() のテスト ----
  describe('start() / stop()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0); // count=1 固定
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('start() 後に stop() を呼ぶと eyeState が open に戻ること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      bsm.start();

      // 瞬きを途中まで進める（half の状態にする）
      vi.advanceTimersByTime(FIXED_INTERVAL); // executeBlink 実行 -> half
      expect(bsm.eyeState).toBe('half');

      bsm.stop();
      expect(bsm.eyeState).toBe('open');
    });

    it('stop() 後はタイマーが止まること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const callback = vi.fn();
      bsm.onEyeStateChange(callback);

      bsm.start();
      // start() 内の setEyeState('open') でコールバックが1回呼ばれる
      const callsAfterStart = callback.mock.calls.length;

      bsm.stop();
      // stop() 内の setEyeState('open') でコールバックが1回呼ばれる
      const callsAfterStop = callback.mock.calls.length;

      // stop() 以降はタイマーが止まるのでコールバックが増えないこと
      vi.advanceTimersByTime(FIXED_INTERVAL * 10);
      expect(callback.mock.calls.length).toBe(callsAfterStop);
    });

    it('start() を複数回呼んでも二重起動しないこと', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const callback = vi.fn();
      bsm.onEyeStateChange(callback);

      bsm.start();
      bsm.start(); // 2回目は無視される
      bsm.start(); // 3回目も無視される

      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 4);
      // 1回の瞬きサイクルで open->half->closed->half->open の計5回変化
      // start() 時点の open(1) + 瞬きサイクル half(1)+closed(1)+half(1)+open(1) = 5
      expect(callback.mock.calls.length).toBe(5);
    });
  });

  // ---- 瞬きサイクルのテスト ----
  describe('瞬きサイクル (fake timers)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0); // count=1 固定
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('start() 後 intervalBase ms 経過後に瞬きが始まること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      bsm.start();

      // 1ms 手前ではまだ open
      vi.advanceTimersByTime(FIXED_INTERVAL - 1);
      expect(bsm.eyeState).toBe('open');

      // intervalBase ちょうどで half に遷移
      vi.advanceTimersByTime(1);
      expect(bsm.eyeState).toBe('half');
    });

    it('open -> half -> closed -> half -> open の遷移が正しい順序で起きること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const states: string[] = [];
      bsm.onEyeStateChange((state) => states.push(state));

      bsm.start();
      // start() 内の setEyeState('open') -> 'open'
      expect(states).toEqual(['open']);

      // intervalBase 経過で executeBlink 実行 -> 'half'
      vi.advanceTimersByTime(FIXED_INTERVAL);
      expect(states).toEqual(['open', 'half']);

      // +transitionDuration -> 'closed'
      vi.advanceTimersByTime(TRANSITION);
      expect(states).toEqual(['open', 'half', 'closed']);

      // +transitionDuration -> 'half'
      vi.advanceTimersByTime(TRANSITION);
      expect(states).toEqual(['open', 'half', 'closed', 'half']);

      // +transitionDuration -> 'open'
      vi.advanceTimersByTime(TRANSITION);
      expect(states).toEqual(['open', 'half', 'closed', 'half', 'open']);

      bsm.stop();
    });

    it('各遷移が transitionDuration(80ms) 間隔で起きること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      bsm.start();

      vi.advanceTimersByTime(FIXED_INTERVAL); // half
      expect(bsm.eyeState).toBe('half');

      vi.advanceTimersByTime(TRANSITION - 1); // 1ms 手前はまだ half
      expect(bsm.eyeState).toBe('half');

      vi.advanceTimersByTime(1); // ちょうど closed
      expect(bsm.eyeState).toBe('closed');

      vi.advanceTimersByTime(TRANSITION - 1); // 1ms 手前はまだ closed
      expect(bsm.eyeState).toBe('closed');

      vi.advanceTimersByTime(1); // ちょうど half
      expect(bsm.eyeState).toBe('half');

      vi.advanceTimersByTime(TRANSITION - 1); // 1ms 手前はまだ half
      expect(bsm.eyeState).toBe('half');

      vi.advanceTimersByTime(1); // ちょうど open
      expect(bsm.eyeState).toBe('open');

      bsm.stop();
    });

    it('1サイクル後に次の瞬きがスケジュールされること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const states: string[] = [];
      bsm.onEyeStateChange((state) => states.push(state));

      bsm.start();

      // 1サイクル完了
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);
      // start時の 'open' + 瞬きの half/closed/half/open = 5件
      expect(states.length).toBe(5);
      expect(states[states.length - 1]).toBe('open');

      // 次のサイクルの intervalBase 分進める
      vi.advanceTimersByTime(FIXED_INTERVAL);
      // 2回目の瞬きが始まり half になる
      expect(states[states.length - 1]).toBe('half');

      bsm.stop();
    });
  });

  // ---- コールバックのテスト ----
  describe('onEyeStateChange() コールバック', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0); // count=1 固定
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('登録したコールバックが状態変化時に呼ばれること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const callback = vi.fn();
      bsm.onEyeStateChange(callback);

      bsm.start();
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);

      // start時 open + 瞬き half/closed/half/open の合計5回
      expect(callback).toHaveBeenCalledTimes(5);

      bsm.stop();
    });

    it('コールバックに渡される EyeState が正しいこと', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const receivedStates: string[] = [];
      bsm.onEyeStateChange((state) => receivedStates.push(state));

      bsm.start();
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);

      expect(receivedStates).toEqual(['open', 'half', 'closed', 'half', 'open']);

      bsm.stop();
    });

    it('コールバックを登録しなくても動作すること（エラーなし）', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });

      expect(() => {
        bsm.start();
        vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);
        bsm.stop();
      }).not.toThrow();
    });

    it('後からコールバックを上書きできること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const firstCallback = vi.fn();
      const secondCallback = vi.fn();

      bsm.onEyeStateChange(firstCallback);
      bsm.onEyeStateChange(secondCallback); // 上書き

      bsm.start();
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);
      bsm.stop();

      expect(firstCallback).not.toHaveBeenCalled();
      expect(secondCallback).toHaveBeenCalled();
    });
  });

  // ---- updateOptions() のテスト ----
  describe('updateOptions()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0); // count=1 固定
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('blinkIntervalBase を変更すると次の瞬き間隔に反映されること', () => {
      const INITIAL_INTERVAL = 3000;
      const NEW_INTERVAL = 1000;

      const bsm = new BlinkStateMachine({
        intervalBase: INITIAL_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      bsm.start();

      // 1サイクル目の途中で intervalBase を変更する
      // （この時点ではまだ executeBlink は呼ばれていない）
      vi.advanceTimersByTime(INITIAL_INTERVAL / 2); // 1500ms 経過
      bsm.updateOptions({ intervalBase: NEW_INTERVAL, intervalVariance: 0 });

      // 残り 1500ms 進めると 1サイクル目の executeBlink が呼ばれ、瞬きが始まる
      vi.advanceTimersByTime(INITIAL_INTERVAL / 2); // 合計 3000ms
      expect(bsm.eyeState).toBe('half');

      // 瞬きサイクル（TRANSITION * 3）を完了させると scheduleNextBlink が NEW_INTERVAL でセット
      vi.advanceTimersByTime(TRANSITION * 3);
      expect(bsm.eyeState).toBe('open');

      // 新しい間隔(1000ms)の1ms手前ではまだ open
      vi.advanceTimersByTime(NEW_INTERVAL - 1);
      expect(bsm.eyeState).toBe('open');

      // 新しい間隔ちょうどで瞬きが始まる
      vi.advanceTimersByTime(1);
      expect(bsm.eyeState).toBe('half');

      bsm.stop();
    });

    it('transitionDuration を変更すると次の瞬きの遷移速度に反映されること', () => {
      const NEW_TRANSITION = 200;

      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION, // 80ms
      });
      bsm.start();

      // 1サイクル完了後にオプション更新
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);
      bsm.updateOptions({ transitionDuration: NEW_TRANSITION });

      // 次の瞬きを待つ
      vi.advanceTimersByTime(FIXED_INTERVAL); // half になる
      expect(bsm.eyeState).toBe('half');

      // 旧 transitionDuration(80ms) では closed になるが新しい値(200ms)ではまだ half
      vi.advanceTimersByTime(TRANSITION);
      expect(bsm.eyeState).toBe('half');

      // NEW_TRANSITION(200ms) ちょうどで closed に
      vi.advanceTimersByTime(NEW_TRANSITION - TRANSITION);
      expect(bsm.eyeState).toBe('closed');

      bsm.stop();
    });

    it('intervalVariance を変更できること', () => {
      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      // updateOptions が例外なく動作すること
      expect(() => {
        bsm.updateOptions({ intervalVariance: 500 });
      }).not.toThrow();
    });
  });

  // ---- 連続瞬きのテスト ----
  describe('連続瞬き (1〜3回ランダム)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('count=2 のとき2回連続して瞬きが起きること', () => {
      // Math.random() = 0.4 → floor(0.4 * 3) = 1 → count = 1 + 1 = 2
      vi.spyOn(Math, 'random').mockReturnValue(0.4);

      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const states: string[] = [];
      bsm.onEyeStateChange((state) => states.push(state));

      bsm.start();

      // 1回目の瞬き開始
      vi.advanceTimersByTime(FIXED_INTERVAL);
      expect(bsm.eyeState).toBe('half');

      // 1回目の瞬き完了 → open
      vi.advanceTimersByTime(TRANSITION * 3);
      expect(bsm.eyeState).toBe('open');

      // 連続瞬きの間隔 (transitionDuration * 2) を待つ → 2回目が始まり half に
      vi.advanceTimersByTime(TRANSITION * 2);
      expect(bsm.eyeState).toBe('half');

      // 2回目の瞬き完了 → open
      vi.advanceTimersByTime(TRANSITION * 3);
      expect(bsm.eyeState).toBe('open');

      // 2セッション分の状態シーケンスを確認
      // start時'open' + 瞬き1(half/closed/half/open) + 瞬き2(half/closed/half/open) = 9
      expect(states).toEqual([
        'open',
        'half', 'closed', 'half', 'open',
        'half', 'closed', 'half', 'open',
      ]);

      bsm.stop();
    });

    it('count=3 のとき3回連続して瞬きが起きること', () => {
      // Math.random() = 0.99 → floor(0.99 * 3) = 2 → count = 1 + 2 = 3
      vi.spyOn(Math, 'random').mockReturnValue(0.99);

      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const states: string[] = [];
      bsm.onEyeStateChange((state) => states.push(state));

      bsm.start();

      // 瞬き3回分 + 連続間隔2回分の合計時間を進める
      // FIXED_INTERVAL + (TRANSITION*3 + TRANSITION*2) * 2 + TRANSITION*3
      // = 2000 + 5*80*2 + 3*80 = 2000 + 800 + 240 = 3040ms
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 13);

      expect(bsm.eyeState).toBe('open');

      // start時'open' + 瞬き3回分(各4状態) = 1 + 12 = 13
      expect(states).toEqual([
        'open',
        'half', 'closed', 'half', 'open',
        'half', 'closed', 'half', 'open',
        'half', 'closed', 'half', 'open',
      ]);

      bsm.stop();
    });

    it('count=1 のときは1回だけ瞬きが起きて次のセッションに移ること', () => {
      // Math.random() = 0 → count=1
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const bsm = new BlinkStateMachine({
        intervalBase: FIXED_INTERVAL,
        intervalVariance: 0,
        transitionDuration: TRANSITION,
      });
      const states: string[] = [];
      bsm.onEyeStateChange((state) => states.push(state));

      bsm.start();

      // 1回の瞬き完了
      vi.advanceTimersByTime(FIXED_INTERVAL + TRANSITION * 3);
      expect(bsm.eyeState).toBe('open');
      expect(states.length).toBe(5); // open + half/closed/half/open

      // 連続瞬き間隔より長く待っても状態が変わらない（次のセッションはまだ先）
      vi.advanceTimersByTime(TRANSITION * 2);
      expect(bsm.eyeState).toBe('open');
      expect(states.length).toBe(5);

      bsm.stop();
    });
  });
});
