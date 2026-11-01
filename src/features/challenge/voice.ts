import type { VoiceSegment } from './scoring';

/**
 * Local RMS-based speech/activity detector.
 * The microphone stream is analysed in memory only; no audio is recorded,
 * encoded, persisted, or transmitted.
 */
export class VoiceDetector {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private activeStart: number | null = null;
  private lastLoud: number | null = null;
  private segments: VoiceSegment[] = [];
  private baseline = 0.008;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('이 브라우저에서는 마이크를 사용할 수 없습니다. HTTPS 주소와 최신 브라우저를 확인해 주세요.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    try {
      this.context = new AudioContext();
      await this.context.resume();
      const source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);
      this.samples = new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  sample(positionMs: number): boolean {
    if (!this.analyser || !this.samples) return false;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const value of this.samples) sum += value * value;
    const rms = Math.sqrt(sum / this.samples.length);
    this.baseline = this.baseline * 0.995 + Math.min(rms, 0.025) * 0.005;
    const loud = rms > Math.max(0.018, this.baseline * 2.7);

    if (loud) {
      this.lastLoud = positionMs;
      if (this.activeStart === null) this.activeStart = positionMs;
    } else if (this.activeStart !== null && this.lastLoud !== null && positionMs - this.lastLoud >= 180) {
      if (this.lastLoud - this.activeStart >= 80) {
        this.segments.push({ startMs: this.activeStart, endMs: this.lastLoud });
      }
      this.activeStart = null;
      this.lastLoud = null;
    }
    return loud;
  }

  finish(positionMs: number): VoiceSegment[] {
    if (this.activeStart !== null && this.lastLoud !== null && this.lastLoud - this.activeStart >= 80) {
      this.segments.push({ startMs: this.activeStart, endMs: Math.min(positionMs, this.lastLoud) });
    }
    this.activeStart = null;
    this.lastLoud = null;
    return [...this.segments];
  }

  /** Clear the previous attempt while retaining the current permission stream. */
  reset(): void {
    this.activeStart = null;
    this.lastLoud = null;
    this.segments = [];
    this.baseline = 0.008;
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    this.samples = null;
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
    }
  }
}
