import type { ChantEvent } from '../../models/types';
import type { VoiceSegment } from './scoring';

export const TIMING_SCHEMA_VERSION = '1.0.0-beta';
export const DETECTOR_VERSION = '1.1.0';

export interface TimingDiagnostics {
  sampleRate: number | null;
  fftSize: number;
  baselineRms: number;
  thresholdRms: number;
  sampleIntervalMs: number;
  minVoiceDurationMs: number;
  releaseMs: number;
}

export interface TimingAnalysisRecord {
  schemaVersion: string;
  recordId: string;
  attemptId: string;
  songId: string;
  nickname: string;
  createdAt: string;
  appVersion: string;
  contentVersion: string;
  audioVersion: string;
  detectorVersion: string;
  timebase: 'audio-element-current-time-ms';
  audioDurationMs: number;
  defaultOffsetMs: number;
  diagnostics: TimingDiagnostics;
  expectedEvents: Array<{
    eventId: string;
    text: string;
    sourceStartMs: number;
    expectedStartMs: number;
    type: string;
  }>;
  detectedSegments: Array<{
    segmentId: string;
    startMs: number;
    endMs: number;
    durationMs: number;
    peakRms: number | null;
    meanRms: number | null;
    sampleCount: number | null;
  }>;
  eventObservations: Array<{
    eventId: string;
    expectedStartMs: number;
    windowStartMs: number;
    windowEndMs: number;
    candidates: Array<{
      segmentId: string;
      deltaMs: number;
      durationMs: number;
    }>;
  }>;
}

export function buildTimingRecord(input: {
  recordId: string;
  attemptId: string;
  songId: string;
  nickname: string;
  createdAt: string;
  appVersion: string;
  contentVersion: string;
  audioVersion: string;
  audioDurationMs: number;
  defaultOffsetMs: number;
  events: readonly ChantEvent[];
  segments: readonly VoiceSegment[];
  diagnostics: TimingDiagnostics;
}): TimingAnalysisRecord {
  const expectedEvents = [...input.events]
    .sort((a, b) => a.startMs - b.startMs)
    .map((event) => ({
      eventId: event.id,
      text: event.text,
      sourceStartMs: event.startMs,
      expectedStartMs: event.startMs - input.defaultOffsetMs,
      type: event.type,
    }));

  const detectedSegments = input.segments
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs >= segment.startMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map((segment, index) => ({
      segmentId: `segment-${String(index + 1).padStart(4, '0')}`,
      startMs: Math.round(segment.startMs),
      endMs: Math.round(segment.endMs),
      durationMs: Math.max(0, Math.round(segment.endMs - segment.startMs)),
      peakRms: Number.isFinite(segment.peakRms) ? Number(segment.peakRms!.toFixed(6)) : null,
      meanRms: Number.isFinite(segment.meanRms) ? Number(segment.meanRms!.toFixed(6)) : null,
      sampleCount: Number.isInteger(segment.sampleCount) ? segment.sampleCount! : null,
    }));

  // Analysis windows are based only on the expected cue timeline (midpoints between cues),
  // never on SUCCESS/GOOD/BAD/MISS thresholds or the ranking score.
  const eventObservations = expectedEvents.map((event, index) => {
    const previous = expectedEvents[index - 1];
    const next = expectedEvents[index + 1];
    const windowStartMs = previous
      ? Math.max(0, (previous.expectedStartMs + event.expectedStartMs) / 2)
      : 0;
    const windowEndMs = next
      ? Math.min(input.audioDurationMs, (event.expectedStartMs + next.expectedStartMs) / 2)
      : input.audioDurationMs;
    const candidates = detectedSegments
      .filter((segment) => segment.startMs >= windowStartMs && segment.startMs < windowEndMs)
      .map((segment) => ({
        segmentId: segment.segmentId,
        deltaMs: Math.round(segment.startMs - event.expectedStartMs),
        durationMs: segment.durationMs,
      }));
    return {
      eventId: event.eventId,
      expectedStartMs: event.expectedStartMs,
      windowStartMs: Math.round(windowStartMs),
      windowEndMs: Math.round(windowEndMs),
      candidates,
    };
  });

  return {
    schemaVersion: TIMING_SCHEMA_VERSION,
    recordId: input.recordId,
    attemptId: input.attemptId,
    songId: input.songId,
    nickname: input.nickname,
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    contentVersion: input.contentVersion,
    audioVersion: input.audioVersion,
    detectorVersion: DETECTOR_VERSION,
    timebase: 'audio-element-current-time-ms',
    audioDurationMs: input.audioDurationMs,
    defaultOffsetMs: input.defaultOffsetMs,
    diagnostics: input.diagnostics,
    expectedEvents,
    detectedSegments,
    eventObservations,
  };
}
