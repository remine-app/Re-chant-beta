import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function loadScoring() {
  const source = readFileSync('src/features/challenge/scoring.ts', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
}
const scoring = await loadScoring();
const cues = [
  { id: 'a', text: 'A', startMs: 1000, leadMs: 0, type: 'original' },
  { id: 'b', text: 'B', startMs: 2000, leadMs: 0, type: 'original' },
  { id: 'c', text: 'C', startMs: 3000, leadMs: 0, type: 'original' },
  { id: 'd', text: 'D', startMs: 4000, leadMs: 0, type: 'original' },
];

test('four grade bands use inclusive thresholds and subtract from 100', () => {
  const result = scoring.scoreChallenge(cues, [
    { startMs: 1150, endMs: 1300 },
    { startMs: 2350, endMs: 2500 },
    { startMs: 3600, endMs: 3750 },
  ]);
  assert.deepEqual(result.events.map((event) => event.grade), ['success', 'good', 'miss', 'bad']);
  assert.deepEqual(result.gradeCounts, { success: 1, good: 1, bad: 1, miss: 1 });
  assert.equal(result.score, 97);
});

test('exact boundaries are classified as specified', () => {
  const boundaries = [150, 151, 350, 351, 700, 701];
  const results = boundaries.map((delta, index) => scoring.scoreChallenge(
    [{ id: `cue-${index}`, text: 'cue', startMs: 5000, leadMs: 0, type: 'original' }],
    [{ startMs: 5000 + delta, endMs: 5100 + delta }],
  ).events[0].grade);
  assert.deepEqual(results, ['success', 'good', 'good', 'bad', 'bad', 'miss']);
  assert.deepEqual(scoring.CHALLENGE_WINDOWS, { successMs: 150, goodMs: 350, badMs: 700 });
});

test('very short sound candidates do not count as a valid scored vocalization', () => {
  const result = scoring.scoreChallenge([
    { id: 'cue', text: 'cue', startMs: 1000, leadMs: 0, type: 'original' },
  ], [{ startMs: 1000, endMs: 1060 }]);
  assert.equal(result.events[0].grade, 'miss');
});

test('one detected segment cannot be used for two chant events', () => {
  const result = scoring.scoreChallenge([
    { id: 'a', text: 'A', startMs: 1000, leadMs: 0, type: 'original' },
    { id: 'b', text: 'B', startMs: 1100, leadMs: 0, type: 'original' },
  ], [{ startMs: 1050, endMs: 1200 }]);
  assert.equal(result.gradeCounts.success + result.gradeCounts.good + result.gradeCounts.bad, 1);
  assert.equal(result.gradeCounts.miss, 1);
});

test('equal-time cues keep the earliest event when two matches are otherwise equivalent', () => {
  const result = scoring.scoreChallenge([
    { id: 'first', text: 'first', startMs: 1000, leadMs: 0, type: 'original' },
    { id: 'second', text: 'second', startMs: 1000, leadMs: 0, type: 'original' },
  ], [{ startMs: 1000, endMs: 1150 }]);
  assert.deepEqual(result.events.map((event) => event.grade), ['success', 'miss']);
});

test('score is clamped to zero for a large number of misses', () => {
  const many = Array.from({ length: 60 }, (_, index) => ({ id: String(index), text: 'x', startMs: index * 1000, leadMs: 0, type: 'original' }));
  assert.equal(scoring.scoreChallenge(many, []).score, 0);
});

test('legacy Challenge page compatibility fields do not reintroduce timing metrics', () => {
  const result = scoring.scoreChallenge(cues, [
    { startMs: 1000, endMs: 1120 },
    { startMs: 2200, endMs: 2320 },
  ]);
  assert.equal(result.matched, 2);
  assert.equal(result.total, 4);
  assert.equal(result.averageErrorMs, null);
  assert.equal('averageErrorMs' in result, true);
  assert.equal(result.events.every((event) => event.points === undefined), true);
});
