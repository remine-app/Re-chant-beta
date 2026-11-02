import type { VoiceSegment } from './scoring';
import type { TimingDiagnostics } from './timing';

/**
 * Local RMS-based sound-activity detector.
 * Audio samples are analysed in memory only; no audio is recorded, encoded,
 * persisted, or transmitted.
 */
export class VoiceDetector {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private activeStart: number | null = null;
  private lastLoud: number | null = null;
  private activePeakRms = 0;
  private activeRmsSum = 0;
  private activeSampleCount = 0;
  private segments: VoiceSegment[] = [];
  private baseline = 0.008;
  private readonly sampleIntervalMs = 50;
  private readonly minVoiceDurationMs = 80;
  private readonly releaseMs = 180;
  private readonly thresholdFloorRms = 0.018;
  private readonly thresholdMultiplier = 2.7;

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

  /** Measure ambient noise before the attempt without creating voice segments. */
  async calibrateAmbient(durationMs = 1500): Promise<number> {
    if (!this.analyser || !this.samples) throw new Error('마이크가 준비되지 않았습니다.');
    const values: number[] = [];
    const startedAt = performance.now();
    while (performance.now() - startedAt < durationMs) {
      if (!this.analyser || !this.samples) throw new Error('마이크 연결이 종료되었습니다.');
      this.analyser.getFloatTimeDomainData(this.samples);
      let sum = 0;
      for (const value of this.samples) sum += value * value;
      values.push(Math.sqrt(sum / this.samples.length));
      await new Promise<void>((resolve) => window.setTimeout(resolve, this.sampleIntervalMs));
    }
    values.sort((a, b) => a - b);
    const middle = values.length ? values[Math.floor(values.length / 2)] : this.baseline;
    this.baseline = Math.min(0.025, Math.max(0.002, middle));
    return this.baseline;
  }

  sample(positionMs: number): boolean {
    if (!this.analyser || !this.samples) return false;
    this.analyser.getFloatTimeDomainData(this.samples);
    let sum = 0;
    for (const value of this.samples) sum += value * value;
    const rms = Math.sqrt(sum / this.samples.length);
    this.baseline = this.baseline * 0.995 + Math.min(rms, 0.025) * 0.005;
    const loud = rms > Math.max(this.thresholdFloorRms, this.baseline * this.thresholdMultiplier);

    if (loud) {
      this.lastLoud = positionMs;
      if (this.activeStart === null) {
        this.activeStart = positionMs;
        this.activePeakRms = rms;
        this.activeRmsSum = rms;
        this.activeSampleCount = 1;
      } else {
        this.activePeakRms = Math.max(this.activePeakRms, rms);
        this.activeRmsSum += rms;
        this.activeSampleCount += 1;
      }
    } else if (this.activeStart !== null && this.lastLoud !== null && positionMs - this.lastLoud >= this.releaseMs) {
      this.closeActiveSegment();
    }
    return loud;
  }

  private closeActiveSegment(endOverride?: number): void {
    if (this.activeStart !== null && this.lastLoud !== null) {
      this.segments.push({
        startMs: this.activeStart,
        endMs: Math.min(endOverride ?? this.lastLoud, this.lastLoud),
        peakRms: this.activePeakRms,
        meanRms: this.activeSampleCount ? this.activeRmsSum / this.activeSampleCount : 0,
        sampleCount: this.activeSampleCount,
      });
    }
    this.activeStart = null;
    this.lastLoud = null;
    this.activePeakRms = 0;
    this.activeRmsSum = 0;
    this.activeSampleCount = 0;
  }

  finish(positionMs: number): VoiceSegment[] {
    if (this.activeStart !== null && this.lastLoud !== null) this.closeActiveSegment(positionMs);
    return this.segments.map((segment) => ({ ...segment }));
  }

  getDiagnostics(): TimingDiagnostics {
    return {
      sampleRate: this.context?.sampleRate ?? null,
      fftSize: this.analyser?.fftSize ?? 2048,
      baselineRms: Number(this.baseline.toFixed(6)),
      thresholdRms: Number(Math.max(this.thresholdFloorRms, this.baseline * this.thresholdMultiplier).toFixed(6)),
      sampleIntervalMs: this.sampleIntervalMs,
      minVoiceDurationMs: this.minVoiceDurationMs,
      releaseMs: this.releaseMs,
    };
  }

  /** Clear the previous attempt while retaining the current permission stream. */
  reset(): void {
    this.activeStart = null;
    this.lastLoud = null;
    this.activePeakRms = 0;
    this.activeRmsSum = 0;
    this.activeSampleCount = 0;
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
