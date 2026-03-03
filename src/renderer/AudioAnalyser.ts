import { FFT_SIZE, DEFAULT_CONFIG } from '../shared/constants';
import type { MouthState } from '../shared/types';

export interface AudioAnalyserOptions {
  threshold?: number;
  smoothingTimeConstant?: number;
  pollingInterval?: number;
  lipSyncCycleMs?: number;
  deviceId?: string | null;
}

// 発話中のリップシンクアニメーションシーケンス（open→half→closed→half→open→...）
const LIP_SYNC_SEQUENCE: MouthState[] = ['open', 'half', 'closed', 'half'];

export class AudioAnalyser {
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  private threshold: number;
  private smoothingTimeConstant: number;
  private pollingInterval: number;
  private lipSyncCycleMs: number;

  private _mouthState: MouthState = 'closed';
  private _volume = 0;
  private onStateChange?: (state: MouthState) => void;

  // リップシンクアニメーション
  private isSpeaking = false;
  private lipSyncStep = 0;
  private lipSyncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AudioAnalyserOptions = {}) {
    this.threshold = options.threshold ?? DEFAULT_CONFIG.threshold;
    this.smoothingTimeConstant = options.smoothingTimeConstant ?? DEFAULT_CONFIG.smoothingTimeConstant;
    this.pollingInterval = options.pollingInterval ?? DEFAULT_CONFIG.pollingInterval;
    this.lipSyncCycleMs = options.lipSyncCycleMs ?? DEFAULT_CONFIG.lipSyncCycleMs;
  }

  get mouthState(): MouthState {
    return this._mouthState;
  }

  get volume(): number {
    return this._volume;
  }

  get audioContextState(): string {
    return this.audioContext?.state ?? 'not_started';
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  // マイクデバイスの一覧を取得
  static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    // getUserMediaを先に呼んでパーミッションを得る
    await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  // 音声解析を開始
  async start(deviceId?: string | null): Promise<void> {
    await this.stop(); // 既存を停止

    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.audioContext = new AudioContext();
    // OBS BrowserSource の autoplay policy で suspended になる場合があるため明示的に resume
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = FFT_SIZE;
    this.analyserNode.smoothingTimeConstant = this.smoothingTimeConstant;

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.source.connect(this.analyserNode);

    // ポーリング開始
    this.pollingTimer = setInterval(() => this.poll(), this.pollingInterval);
  }

  // 音声解析を停止
  async stop(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.stopLipSync();
    this.source?.disconnect();
    this.stream?.getTracks().forEach(t => t.stop());
    await this.audioContext?.close();
    this.audioContext = null;
    this.analyserNode = null;
    this.source = null;
    this.stream = null;
    this._mouthState = 'closed';
  }

  // コールバック登録
  onMouthStateChange(callback: (state: MouthState) => void): void {
    this.onStateChange = callback;
  }

  // 設定更新
  updateOptions(options: AudioAnalyserOptions): void {
    if (options.threshold !== undefined) this.threshold = options.threshold;
    if (options.lipSyncCycleMs !== undefined) this.lipSyncCycleMs = options.lipSyncCycleMs;
    if (options.smoothingTimeConstant !== undefined && this.analyserNode) {
      this.smoothingTimeConstant = options.smoothingTimeConstant;
      this.analyserNode.smoothingTimeConstant = options.smoothingTimeConstant;
    }
  }

  private poll(): void {
    if (!this.analyserNode) return;
    const volume = this.calcVolume();
    this._volume = volume;

    // ヒステリシス: 発話中は低い閾値で継続、無音時は通常閾値で開始
    const voiceActive = this.isSpeaking
      ? volume >= this.threshold * 0.7
      : volume >= this.threshold;

    if (voiceActive && !this.isSpeaking) {
      this.isSpeaking = true;
      this.startLipSync();
    } else if (!voiceActive && this.isSpeaking) {
      this.isSpeaking = false;
      this.stopLipSync();
      this.setState('closed');
    }
  }

  private calcVolume(): number {
    if (!this.analyserNode) return 0;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.analyserNode.getByteFrequencyData(data);
    const sum = data.reduce((acc, v) => acc + v * v, 0);
    return Math.sqrt(sum / data.length) / 255;
  }

  private setState(state: MouthState): void {
    if (state !== this._mouthState) {
      this._mouthState = state;
      this.onStateChange?.(state);
    }
  }

  private startLipSync(): void {
    this.lipSyncStep = 0;
    this.advanceLipSync();
  }

  private advanceLipSync(): void {
    if (!this.isSpeaking) return;
    const state = LIP_SYNC_SEQUENCE[this.lipSyncStep % LIP_SYNC_SEQUENCE.length];
    this.setState(state);
    this.lipSyncStep = (this.lipSyncStep + 1) % LIP_SYNC_SEQUENCE.length;
    this.lipSyncTimer = setTimeout(() => this.advanceLipSync(), this.lipSyncCycleMs);
  }

  private stopLipSync(): void {
    if (this.lipSyncTimer !== null) {
      clearTimeout(this.lipSyncTimer);
      this.lipSyncTimer = null;
    }
    this.lipSyncStep = 0;
  }
}
