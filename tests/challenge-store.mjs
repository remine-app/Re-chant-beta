import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/repositories/challenge.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const store = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

function attempt(id, score, createdAt) {
  return {
    id, songId: 'love-attack', nickname: 'tester', createdAt,
    appVersion: '1.1.0-beta.3', scoringVersion: '1.0.0', score,
    gradeCounts: { success: 20, good: 10, bad: 1, miss: 1 },
    events: [{ id: 'e1', text: '응원', grade: 'success', deduction: 0 }],
  };
}

test('challenge attempts accumulate and personal best is calculated independently', async () => {
  await store.clearChallengeData();
  assert.equal(await store.saveChallengeAttempt(attempt('a1', 90, '2026-11-01T10:00:00.000Z')), true);
  assert.equal(await store.saveChallengeAttempt(attempt('a2', 95, '2026-11-02T10:00:00.000Z')), true);
  assert.equal(await store.saveChallengeAttempt(attempt('a3', 80, '2026-11-02T11:00:00.000Z')), false);
  const all = await store.listChallengeAttempts('love-attack');
  assert.deepEqual(all.map((item) => item.id), ['a3', 'a2', 'a1']);
  assert.equal(Math.max(...all.map((item) => item.score)), 95);
});

test('timing records use a separate store and reject ranking fields', async () => {
  await store.clearChallengeData();
  const record = {
    schemaVersion: '1.0.0-beta', recordId: 't1', attemptId: 'a1', songId: 'love-attack',
    nickname: 'tester', createdAt: '2026-11-02T10:00:00.000Z', appVersion: '1.1.0-beta.3',
    contentVersion: 'c1', audioVersion: 'a1', detectorVersion: '1.1.0',
    timebase: 'audio-element-current-time-ms', audioDurationMs: 10000, defaultOffsetMs: 0,
    diagnostics: { sampleRate: 48000, fftSize: 2048, baselineRms: 0.01, thresholdRms: 0.02, sampleIntervalMs: 50, minVoiceDurationMs: 80, releaseMs: 180 },
    expectedEvents: [], detectedSegments: [], eventObservations: [],
  };
  await store.saveTimingRecord(record);
  assert.equal((await store.listTimingRecords()).length, 1);
  assert.throws(() => store.validateChallengeData({ attempts: [], timingRecords: [{ ...record, score: 99 }] }));
});
