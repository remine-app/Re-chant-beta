import type { ChantEvent } from '../../models/types';

export interface VoiceSegment {
  startMs: number;
  endMs: number;
  peakRms?: number;
  meanRms?: number;
  sampleCount?: number;
}

export type ChallengeGrade = 'success' | 'good' | 'bad' | 'miss';

export interface ScoredEvent {
  id: string;
  text: string;
  grade: ChallengeGrade;
  deduction: 0 | 1 | 2;
  /** @deprecated Legacy Challenge.tsx compatibility only. Intentionally not populated.
   * The current result UI displays grades, not per-event numeric points.
   */
  points?: number;
}

export interface GradeCounts {
  success: number;
  good: number;
  bad: number;
  miss: number;
}

export interface ChallengeScore {
  /** Internal ranking score. Do not show this number in the user-facing result UI. */
  score: number;
  gradeCounts: GradeCounts;
  events: ScoredEvent[];
  /** Number of cues assigned a detected vocal segment (including BAD). */
  matched: number;
  /** Total number of chant cues. */
  total: number;
  /** Legacy UI compatibility only. Timing metrics are deliberately not calculated by scoring. */
  averageErrorMs: null;
}

export const SCORING_VERSION = '1.0.0';
export const MIN_SCORE_VOICE_DURATION_MS = 80;
export const CHALLENGE_WINDOWS = {
  successMs: 150,
  goodMs: 350,
  badMs: 700,
} as const;

interface MatchPlan {
  matches: number;
  error: number;
  pairs: Array<[number, number]>;
}

function better(a: MatchPlan, b: MatchPlan): MatchPlan {
  if (a.matches !== b.matches) return a.matches > b.matches ? a : b;
  if (a.error !== b.error) return a.error < b.error ? a : b;
  // If two plans are equally good, preserve the earliest cue/segment pairing.
  const length = Math.min(a.pairs.length, b.pairs.length);
  for (let index = 0; index < length; index += 1) {
    if (a.pairs[index][0] !== b.pairs[index][0]) return a.pairs[index][0] < b.pairs[index][0] ? a : b;
    if (a.pairs[index][1] !== b.pairs[index][1]) return a.pairs[index][1] < b.pairs[index][1] ? a : b;
  }
  return a;
}

/**
 * Match cues and detected vocal segments one-to-one, in chronological order.
 * The dynamic program maximizes valid matches, then minimizes total timing error.
 */
function matchSegments(expected: number[], actual: number[]): Map<number, number> {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const dp: MatchPlan[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ matches: 0, error: 0, pairs: [] })),
  );

  for (let i = expected.length - 1; i >= 0; i -= 1) {
    for (let j = actual.length - 1; j >= 0; j -= 1) {
      let best = better(dp[i + 1][j], dp[i][j + 1]);
      const delta = Math.abs(actual[j] - expected[i]);
      if (delta <= CHALLENGE_WINDOWS.badMs) {
        const tail = dp[i + 1][j + 1];
        const matched: MatchPlan = {
          matches: tail.matches + 1,
          error: tail.error + delta,
          pairs: [[i, j], ...tail.pairs],
        };
        best = better(best, matched);
      }
      dp[i][j] = best;
    }
  }

  return new Map(dp[0][0].pairs);
}

/** Ranking/grade engine. It does not export or persist raw timing-analysis data. */
export function scoreChallenge(
  events: readonly ChantEvent[],
  segments: readonly VoiceSegment[],
  offsetMs = 0,
): ChallengeScore {
  const cues = [...events].sort((a, b) => a.startMs - b.startMs);
  const validSegments = segments
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs >= segment.startMs && segment.endMs - segment.startMs >= MIN_SCORE_VOICE_DURATION_MS)
    .map((segment) => ({ ...segment }))
    .sort((a, b) => a.startMs - b.startMs);
  const expected = cues.map((cue) => cue.startMs - offsetMs);
  const actual = validSegments.map((segment) => segment.startMs);
  const matches = matchSegments(expected, actual);

  const gradeCounts: GradeCounts = { success: 0, good: 0, bad: 0, miss: 0 };
  const results = cues.map((cue, index): ScoredEvent => {
    const segmentIndex = matches.get(index);
    if (segmentIndex === undefined) {
      gradeCounts.miss += 1;
      return { id: cue.id, text: cue.text, grade: 'miss', deduction: 2 };
    }

    const error = Math.abs(actual[segmentIndex] - expected[index]);
    if (error <= CHALLENGE_WINDOWS.successMs) {
      gradeCounts.success += 1;
      return { id: cue.id, text: cue.text, grade: 'success', deduction: 0 };
    }
    if (error <= CHALLENGE_WINDOWS.goodMs) {
      gradeCounts.good += 1;
      return { id: cue.id, text: cue.text, grade: 'good', deduction: 0 };
    }
    gradeCounts.bad += 1;
    return { id: cue.id, text: cue.text, grade: 'bad', deduction: 1 };
  });

  const deductions = gradeCounts.bad + gradeCounts.miss * 2;
  return {
    score: Math.max(0, 100 - deductions),
    gradeCounts,
    events: results,
    matched: gradeCounts.success + gradeCounts.good + gradeCounts.bad,
    total: cues.length,
    // Do not derive timing metrics here: the beta timing-analysis engine is independent.
    averageErrorMs: null,
  };
}
