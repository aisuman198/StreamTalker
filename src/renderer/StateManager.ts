import { AudioAnalyser } from './AudioAnalyser';
import { BlinkStateMachine } from './BlinkStateMachine';
import type { FaceState, MouthState, EyeState, AppConfig } from '../shared/types';

export class StateManager {
  private analyser: AudioAnalyser;
  private blinkMachine: BlinkStateMachine;

  private _faceState: FaceState = { mouth: 'closed', eye: 'open' };
  private onStateChange?: (state: FaceState) => void;

  constructor() {
    this.analyser = new AudioAnalyser();
    this.blinkMachine = new BlinkStateMachine();

    // 口の状態変化を購読
    this.analyser.onMouthStateChange((mouth: MouthState) => {
      this.updateFaceState({ mouth, eye: this._faceState.eye });
    });

    // 目の状態変化を購読
    this.blinkMachine.onEyeStateChange((eye: EyeState) => {
      this.updateFaceState({ mouth: this._faceState.mouth, eye });
    });
  }

  get faceState(): FaceState {
    return { ...this._faceState };
  }

  get volume(): number {
    return this.analyser.volume;
  }

  get audioContextState(): string {
    return this.analyser.audioContextState;
  }

  get speaking(): boolean {
    return this.analyser.speaking;
  }

  onFaceStateChange(callback: (state: FaceState) => void): void {
    this.onStateChange = callback;
  }

  async start(deviceId?: string | null): Promise<void> {
    this.blinkMachine.start();
    await this.analyser.start(deviceId ?? undefined);
  }

  async stop(): Promise<void> {
    this.blinkMachine.stop();
    await this.analyser.stop();
  }

  async restart(deviceId?: string | null): Promise<void> {
    await this.stop();
    await this.start(deviceId);
  }

  updateConfig(config: Partial<AppConfig>): void {
    this.analyser.updateOptions({
      threshold: config.threshold,
      smoothingTimeConstant: config.smoothingTimeConstant,
      pollingInterval: config.pollingInterval,
      lipSyncCycleMs: config.lipSyncCycleMs,
    });
    this.blinkMachine.updateOptions({
      intervalBase: config.blinkIntervalBase,
      intervalVariance: config.blinkIntervalVariance,
      transitionDuration: config.blinkTransitionDuration,
    });
  }

  static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    return AudioAnalyser.getAudioDevices();
  }

  private updateFaceState(newState: FaceState): void {
    if (
      this._faceState.mouth !== newState.mouth ||
      this._faceState.eye !== newState.eye
    ) {
      this._faceState = newState;
      this.onStateChange?.(this.faceState);
    }
  }
}
