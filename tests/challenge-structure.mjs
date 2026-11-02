import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const practice = readFileSync('src/pages/Practice.tsx', 'utf8');
const settings = readFileSync('src/pages/Settings.tsx', 'utf8');
const scoring = readFileSync('src/features/challenge/scoring.ts', 'utf8');
const timing = readFileSync('src/features/challenge/timing.ts', 'utf8');
const backup = readFileSync('src/repositories/appBackup.ts', 'utf8');

test('challenge timing and scoring use separate modules and storage exports', () => {
  assert.ok(existsSync('src/repositories/challenge.ts'));
  assert.match(practice, /buildTimingRecord/);
  assert.match(practice, /scoreChallenge/);
  assert.match(timing, /expectedEvents/);
  assert.match(timing, /detectedSegments/);
  assert.doesNotMatch(timing, /gradeCounts\s*:/);
  assert.doesNotMatch(timing, /score\s*:/);
  assert.match(scoring, /SCORING_VERSION/);
});

test('challenge UI displays grades rather than numeric score', () => {
  assert.match(practice, /GRADE_LABELS/);
  assert.match(practice, /challenge-history-button/);
  assert.doesNotMatch(practice, /result\.score/);
  assert.doesNotMatch(practice, /event\.points/);
});

test('settings expose scoring export, timing export, full backup and reset', () => {
  assert.match(settings, /exportScoring/);
  assert.match(settings, /exportTiming/);
  assert.match(settings, /createFullAppBackup|saveFullBackup/);
  assert.match(settings, /restoreFullAppBackup/);
  assert.match(settings, /clearFullAppData/);
  assert.match(backup, /rechant-app-backup-2/);
});
