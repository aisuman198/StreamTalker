import { DEFAULT_CONFIG } from '../shared/constants';
import type { EyeState } from '../shared/types';

export interface BlinkStateMachineOptions {
  intervalBase?: number;      // 瞬き間隔の基準値 (ms)
  intervalVariance?: number;  // 瞬き間隔のばらつき (ms)
  transitionDuration?: number; // 各遷移ステップの時間 (ms)
}

export class BlinkStateMachine {
  private _eyeState: EyeState = 'open';
  private blinkTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private intervalBase: number;
  private intervalVariance: number;
  private transitionDuration: number;

  private onStateChange?: (state: EyeState) => void;

  constructor(options: BlinkStateMachineOptions = {}) {
    this.intervalBase = options.intervalBase ?? DEFAULT_CONFIG.blinkIntervalBase;
    this.intervalVariance = options.intervalVariance ?? DEFAULT_CONFIG.blinkIntervalVariance;
    this.transitionDuration = options.transitionDuration ?? DEFAULT_CONFIG.blinkTransitionDuration;
  }

  get eyeState(): EyeState {
    return this._eyeState;
  }

  onEyeStateChange(callback: (state: EyeState) => void): void {
    this.onStateChange = callback;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.setEyeState('open');
    this.scheduleNextBlink();
  }

  stop(): void {
    this.running = false;
    if (this.blinkTimer) {
      clearTimeout(this.blinkTimer);
      this.blinkTimer = null;
    }
    this.setEyeState('open');
  }

  private scheduleNextBlink(): void {
    if (!this.running) return;
    // 1〜3回のランダムな回数を決定して瞬きをスケジュール
    const count = 1 + Math.floor(Math.random() * 3);
    const interval = this.nextBlinkInterval();
    this.blinkTimer = setTimeout(() => this.executeBlink(count), interval);
  }

  private executeBlink(count: number): void {
    if (!this.running) return;
    // open → half → closed → half → open の1サイクル
    this.setEyeState('half');
    setTimeout(() => {
      if (!this.running) return;
      this.setEyeState('closed');
      setTimeout(() => {
        if (!this.running) return;
        this.setEyeState('half');
        setTimeout(() => {
          if (!this.running) return;
          this.setEyeState('open');
          if (count > 1) {
            // 連続瞬き: 少し間を置いて次の瞬きを実行
            this.blinkTimer = setTimeout(
              () => this.executeBlink(count - 1),
              this.transitionDuration * 2
            );
          } else {
            this.scheduleNextBlink();
          }
        }, this.transitionDuration);
      }, this.transitionDuration);
    }, this.transitionDuration);
  }

  private setEyeState(state: EyeState): void {
    this._eyeState = state;
    this.onStateChange?.(state);
  }

  private nextBlinkInterval(): number {
    return this.intervalBase + (Math.random() * this.intervalVariance * 2) - this.intervalVariance;
  }

  updateOptions(options: BlinkStateMachineOptions): void {
    if (options.intervalBase !== undefined) this.intervalBase = options.intervalBase;
    if (options.intervalVariance !== undefined) this.intervalVariance = options.intervalVariance;
    if (options.transitionDuration !== undefined) this.transitionDuration = options.transitionDuration;
  }
}
