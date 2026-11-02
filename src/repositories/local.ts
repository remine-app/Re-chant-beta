import type { Settings, SongProgress, PracticeMode } from '../models/types';

const SKEY = 'rechant.settings.v1';
const PKEY = 'rechant.progress.v1';
const WKEY = 'rechant.days.v1';
export const CHALLENGE_NICKNAME_KEY = 'rechant.challenge.nickname.v1';
export const CHALLENGE_INTRO_KEY = 'rechant.challenge.intro.v1';

export const defaults: Settings = {
  seekLeadMs: 700,
  defaultPracticeMode: 'follow',
  practiceHintMode: 'hint',
};

function read(key: string, fallback: any): any {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
  catch { return fallback; }
}

export function getSettings(): Settings {
  const value = read(SKEY, {});
  return {
    seekLeadMs: Number.isFinite(value.seekLeadMs) ? Math.max(0, Math.min(3000, value.seekLeadMs)) : 700,
    defaultPracticeMode: value.defaultPracticeMode === 'practice' ? 'practice' : 'follow',
    practiceHintMode: value.practiceHintMode === 'lyrics-only' ? 'lyrics-only' : 'hint',
  };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SKEY, JSON.stringify(settings));
}

export function getProgress(): Record<string, SongProgress> { return read(PKEY, {}); }
export function getDays(): Record<string, { ms: number; count: number; songs: string[] }> { return read(WKEY, {}); }

export function updateProgress(songId: string, positionMs: number, mode: PracticeMode, deltaMs = 0, count = false): void {
  const all = getProgress();
  const previous = all[songId];
  all[songId] = {
    songId,
    positionMs,
    mode,
    lastPracticedAt: new Date().toISOString(),
    practiceMs: (previous?.practiceMs || 0) + Math.max(0, deltaMs),
    sessions: (previous?.sessions || 0) + (count ? 1 : 0),
  };
  localStorage.setItem(PKEY, JSON.stringify(all));

  if (deltaMs || count) {
    const days = getDays();
    const now = new Date();
    const key = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const day = days[key] || { ms: 0, count: 0, songs: [] };
    day.ms += deltaMs;
    day.count += count ? 1 : 0;
    if (!day.songs.includes(songId)) day.songs.push(songId);
    days[key] = day;
    localStorage.setItem(WKEY, JSON.stringify(days));
  }
}

export function weeklyStats() {
  const days = getDays();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  let ms = 0;
  let count = 0;
  const songs = new Set<string>();
  for (const [key, day] of Object.entries(days)) {
    const date = new Date(`${key}T00:00:00`);
    if (date >= start) {
      ms += day.ms;
      count += day.count;
      day.songs.forEach((song) => songs.add(song));
    }
  }
  return { ms, count, songs: songs.size };
}

/** Legacy local-state payload retained for backward-compatible restore. */
export function backupData() {
  return {
    schemaVersion: 'rechant-user-backup-1',
    createdAt: new Date().toISOString(),
    settings: getSettings(),
    progress: getProgress(),
    days: getDays(),
  };
}

export function validateBackup(value: any) {
  if (!value || value.schemaVersion !== 'rechant-user-backup-1' || !value.settings ||
    !value.progress || typeof value.progress !== 'object' || Array.isArray(value.progress)) {
    throw new Error('지원하지 않거나 손상된 백업 파일입니다.');
  }
  if (!Number.isFinite(value.settings.seekLeadMs) || value.settings.seekLeadMs < 0 || value.settings.seekLeadMs > 3000) {
    throw new Error('백업 설정이 올바르지 않습니다.');
  }
  for (const [id, progress] of Object.entries(value.progress) as [string, any][]) {
    if (!progress || progress.songId !== id || !['follow', 'practice'].includes(progress.mode) ||
      !Number.isFinite(progress.positionMs) || progress.positionMs < 0 ||
      !Number.isFinite(progress.practiceMs) || progress.practiceMs < 0 ||
      !Number.isInteger(progress.sessions) || progress.sessions < 0 ||
      !Number.isFinite(Date.parse(progress.lastPracticedAt))) {
      throw new Error('연습 기록이 올바르지 않습니다.');
    }
  }
  if (value.days && (typeof value.days !== 'object' || Array.isArray(value.days))) throw new Error('주간 기록이 올바르지 않습니다.');
  for (const [key, day] of Object.entries(value.days || {}) as [string, any][]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !day || !Number.isFinite(day.ms) || day.ms < 0 ||
      !Number.isInteger(day.count) || day.count < 0 || !Array.isArray(day.songs) ||
      !day.songs.every((song: any) => typeof song === 'string')) {
      throw new Error('주간 기록이 올바르지 않습니다.');
    }
  }
  return value;
}

export function restoreData(value: unknown): void {
  const backup = validateBackup(value);
  const keys = [SKEY, PKEY, WKEY];
  const old = keys.map((key) => localStorage.getItem(key));
  try {
    localStorage.setItem(SKEY, JSON.stringify(backup.settings));
    localStorage.setItem(PKEY, JSON.stringify(backup.progress));
    localStorage.setItem(WKEY, JSON.stringify(backup.days || {}));
  } catch (error) {
    keys.forEach((key, index) => old[index] === null
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, old[index]!));
    throw error;
  }
}

export function getChallengeNickname(): string {
  return localStorage.getItem(CHALLENGE_NICKNAME_KEY) ?? '';
}

export function setChallengeNickname(value: string): void {
  const nickname = value.trim().slice(0, 16);
  if (nickname) localStorage.setItem(CHALLENGE_NICKNAME_KEY, nickname);
  else localStorage.removeItem(CHALLENGE_NICKNAME_KEY);
}

export function setChallengeIntroSeen(seen: boolean): void {
  if (seen) localStorage.setItem(CHALLENGE_INTRO_KEY, 'seen');
  else localStorage.removeItem(CHALLENGE_INTRO_KEY);
}

export function clearLocalAppData(): void {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('rechant.')) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
}
