import type { ChallengeGrade, GradeCounts, ScoredEvent } from '../features/challenge/scoring';
import type { TimingAnalysisRecord } from '../features/challenge/timing';

export const CHALLENGE_DB_NAME = 'rechant.challenge.v1';
const DB_VERSION = 1;
const ATTEMPTS = 'attempts';
const TIMING = 'timing';

export interface ChallengeAttemptRecord {
  id: string;
  songId: string;
  nickname: string;
  createdAt: string;
  appVersion: string;
  scoringVersion: string;
  score: number;
  gradeCounts: GradeCounts;
  events: ScoredEvent[];
}

export interface ChallengeDataBackup {
  attempts: ChallengeAttemptRecord[];
  timingRecords: TimingAnalysisRecord[];
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('이 브라우저에서는 IndexedDB를 사용할 수 없습니다.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CHALLENGE_DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ATTEMPTS)) {
        const store = db.createObjectStore(ATTEMPTS, { keyPath: 'id' });
        store.createIndex('songId', 'songId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(TIMING)) {
        const store = db.createObjectStore(TIMING, { keyPath: 'recordId' });
        store.createIndex('songId', 'songId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('도전 기록 저장소를 열지 못했습니다.'));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const db = await openDb();
  try {
    return await new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as T[]);
      request.onerror = () => reject(request.error ?? new Error('기록을 읽지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('기록 조회가 중단되었습니다.'));
    });
  } finally {
    db.close();
  }
}

export function createAttemptId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listChallengeAttempts(songId?: string): Promise<ChallengeAttemptRecord[]> {
  const all = await readAll<ChallengeAttemptRecord>(ATTEMPTS);
  return all
    .filter((record) => !songId || record.songId === songId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listTimingRecords(songId?: string): Promise<TimingAnalysisRecord[]> {
  const all = await readAll<TimingAnalysisRecord>(TIMING);
  return all
    .filter((record) => !songId || record.songId === songId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveChallengeAttempt(record: ChallengeAttemptRecord): Promise<boolean> {
  const db = await openDb();
  try {
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(ATTEMPTS, 'readwrite');
      const store = tx.objectStore(ATTEMPTS);
      const allRequest = store.getAll();
      let isPersonalBest = false;
      allRequest.onsuccess = () => {
        const previous = (allRequest.result as ChallengeAttemptRecord[]).filter((item) => item.songId === record.songId);
        const best = previous.reduce((value, item) => Math.max(value, item.score), -1);
        isPersonalBest = record.score > best;
        store.put(record);
      };
      allRequest.onerror = () => tx.abort();
      tx.oncomplete = () => resolve(isPersonalBest);
      tx.onerror = () => reject(tx.error ?? new Error('도전 기록을 저장하지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('도전 기록 저장이 중단되었습니다.'));
    });
  } finally {
    db.close();
  }
}

export async function updateAttemptNickname(attemptId: string, nickname: string): Promise<void> {
  if (!attemptId) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(ATTEMPTS, 'readwrite');
      const store = tx.objectStore(ATTEMPTS);
      const request = store.get(attemptId);
      request.onsuccess = () => {
        if (request.result) store.put({ ...request.result, nickname });
      };
      request.onerror = () => tx.abort();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('닉네임을 기록에 반영하지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('닉네임 변경이 중단되었습니다.'));
    });
  } finally {
    db.close();
  }
}

export async function saveTimingRecord(record: TimingAnalysisRecord): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TIMING, 'readwrite');
      tx.objectStore(TIMING).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('타이밍 분석 데이터를 저장하지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('타이밍 분석 데이터 저장이 중단되었습니다.'));
    });
  } finally {
    db.close();
  }
}

export function validateChallengeData(value: unknown): ChallengeDataBackup {
  if (!value || typeof value !== 'object') throw new Error('도전 기록 백업 형식이 올바르지 않습니다.');
  const data = value as Partial<ChallengeDataBackup>;
  if (!Array.isArray(data.attempts) || !Array.isArray(data.timingRecords)) throw new Error('도전 기록 백업에 필수 목록이 없습니다.');
  for (const item of data.attempts) {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.songId !== 'string' || !item.songId ||
      typeof item.nickname !== 'string' || !Number.isFinite(item.score) || item.score < 0 || item.score > 100 ||
      !Number.isFinite(Date.parse(item.createdAt)) || !Array.isArray(item.events) || !item.gradeCounts) {
      throw new Error('채점 기록 중 손상된 항목이 있습니다.');
    }
    for (const grade of ['success', 'good', 'bad', 'miss'] as ChallengeGrade[]) {
      if (!Number.isInteger(item.gradeCounts[grade]) || item.gradeCounts[grade] < 0) throw new Error('채점 등급 집계가 올바르지 않습니다.');
    }
    for (const event of item.events) {
      if (!event || typeof event.id !== 'string' || typeof event.text !== 'string' ||
        !['success', 'good', 'bad', 'miss'].includes(event.grade) || ![0, 1, 2].includes(event.deduction)) {
        throw new Error('응원문구 채점 기록이 올바르지 않습니다.');
      }
    }
  }
  for (const item of data.timingRecords) {
    if (!item || typeof item.recordId !== 'string' || !item.recordId || typeof item.attemptId !== 'string' ||
      typeof item.songId !== 'string' || !item.songId || !Array.isArray(item.expectedEvents) ||
      !Array.isArray(item.detectedSegments) || !Array.isArray(item.eventObservations) ||
      !Number.isFinite(Date.parse(item.createdAt))) {
      throw new Error('타이밍 분석 기록 중 손상된 항목이 있습니다.');
    }
    // A timing record must never contain ranking grades or scores.
    if ('score' in item || 'gradeCounts' in item || item.eventObservations.some((event) => 'grade' in event || 'score' in event)) {
      throw new Error('타이밍 데이터에 채점 정보가 포함되어 있습니다.');
    }
  }
  return { attempts: data.attempts, timingRecords: data.timingRecords };
}

export async function replaceChallengeData(value: unknown): Promise<void> {
  const data = validateChallengeData(value);
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ATTEMPTS, TIMING], 'readwrite');
      const attempts = tx.objectStore(ATTEMPTS);
      const timing = tx.objectStore(TIMING);
      attempts.clear();
      timing.clear();
      data.attempts.forEach((record) => attempts.put(record));
      data.timingRecords.forEach((record) => timing.put(record));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('도전 기록을 복원하지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('도전 기록 복원이 중단되었습니다.'));
    });
  } finally {
    db.close();
  }
}

export async function clearChallengeData(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([ATTEMPTS, TIMING], 'readwrite');
      tx.objectStore(ATTEMPTS).clear();
      tx.objectStore(TIMING).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('도전 기록을 초기화하지 못했습니다.'));
      tx.onabort = () => reject(tx.error ?? new Error('도전 기록 초기화가 중단되었습니다.'));
    });
  } finally {
    db.close();
  }
}

export async function exportChallengeData(): Promise<ChallengeDataBackup> {
  const [attempts, timingRecords] = await Promise.all([listChallengeAttempts(), listTimingRecords()]);
  return { attempts, timingRecords };
}
