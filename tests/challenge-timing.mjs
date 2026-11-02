import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadTiming() {
  const source = readFileSync('src/features/challenge/timing.ts', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const timing = await loadTiming();
const input = {
  recordId: 'record-1', attemptId: 'attempt-1', songId: 'love-attack', nickname: 'test',
  createdAt: '2026-11-02T10:00:00.000Z', appVersion: '1.1.0-beta.3',
  contentVersion: 'content-1', audioVersion: 'audio-1', audioDurationMs: 5000,
  defaultOffsetMs: 100,
  events: [
    { id: 'cue-1', text: '첫 응원', startMs: 1100, leadMs: 0, type: 'original' },
    { id: 'cue-2', text: '두 번째 응원', startMs: 3100, leadMs: 0, type: 'original' },
  ],
  segments: [
    { startMs: 1050, endMs: 1210, peakRms: 0.08, meanRms: 0.04, sampleCount: 4 },
    { startMs: 1120, endMs: 1280, peakRms: 0.06, meanRms: 0.03, sampleCount: 3 },
    { startMs: 3200, endMs: 3370, peakRms: 0.09, meanRms: 0.05, sampleCount: 5 },
    { startMs: 4500, endMs: 4540, peakRms: 0.03, meanRms: 0.02, sampleCount: 1 },
  ],
  diagnostics: { sampleRate: 48000, fftSize: 2048, baselineRms: 0.008, thresholdRms: 0.0216, sampleIntervalMs: 50, minVoiceDurationMs: 80, releaseMs: 180 },
};

test('timing export preserves expected cues and every raw detected segment', () => {
  const record = timing.buildTimingRecord(input);
  assert.equal(record.expectedEvents.length, 2);
  assert.equal(record.expectedEvents[0].expectedStartMs, 1000);
  assert.equal(record.detectedSegments.length, 4);
  assert.equal(record.detectedSegments[0].durationMs, 160);
  assert.equal(record.eventObservations.length, 2);
});

test('timing export is independent from score grades and ranking points', () => {
  const record = timing.buildTimingRecord(input);
  const json = JSON.stringify(record);
  assert.equal('score' in record, false);
  assert.equal('gradeCounts' in record, false);
  assert.equal(json.includes('SUCCESS'), false);
  assert.equal(json.includes('MISS'), false);
});

test('event candidate windows are based on cue midpoints, not scoring thresholds', () => {
  const record = timing.buildTimingRecord(input);
  assert.equal(record.eventObservations[0].windowEndMs, 2000);
  assert.equal(record.eventObservations[0].candidates.length, 2);
  assert.equal(record.eventObservations[1].candidates.length, 2);
});
