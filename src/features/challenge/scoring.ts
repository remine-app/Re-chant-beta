import type { ChantEvent } from '../../models/types';

export interface VoiceSegment { startMs: number; endMs: number }
export interface ScoredEvent {
  id: string;
  text: string;
  expectedMs: number;
  actualMs: number | null;
  errorMs: number | null;
  points: number;
}
export interface ChallengeScore {
  score: number;
  matched: number;
  total: number;
  averageErrorMs: number | null;
  events: ScoredEvent[];
}

/** Timing-only beta score. One detected vocal onset can match only one cue. */
export function scoreChallenge(
  events: readonly ChantEvent[],
  segments: readonly VoiceSegment[],
  offsetMs = 0,
): ChallengeScore {
  const cues = [...events].sort((a, b) => a.startMs - b.startMs);
  const onsets = segments
    .filter((segment) => Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.endMs >= segment.startMs)
    .map((segment) => segment.startMs)
    .sort((a, b) => a - b);
  const used = new Set<number>();
  let matched = 0;
  let sumError = 0;
  let totalPoints = 0;

  const results = cues.map((cue) => {
    const expected = cue.startMs - offsetMs;
    let selected = -1;
    let distance = Infinity;
    for (let index = 0; index < onsets.length; index += 1) {
      if (used.has(index)) continue;
      const currentDistance = Math.abs(onsets[index] - expected);
      if (currentDistance <= 900 && currentDistance < distance) {
        selected = index;
        distance = currentDistance;
      }
    }
    const points = selected < 0 ? 0 : Math.max(0, Math.round(100 * (1 - distance / 900)));
    if (selected >= 0) {
      used.add(selected);
      matched += 1;
      sumError += distance;
    }
    totalPoints += points;
    return {
      id: cue.id,
      text: cue.text,
      expectedMs: expected,
      actualMs: selected < 0 ? null : onsets[selected],
      errorMs: selected < 0 ? null : Math.round(distance),
      points,
    };
  });

  return {
    score: cues.length ? Math.round(totalPoints / cues.length) : 0,
    matched,
    total: cues.length,
    averageErrorMs: matched ? Math.round(sumError / matched) : null,
    events: results,
  };
}
