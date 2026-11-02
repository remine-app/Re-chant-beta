import { APP_VERSION } from '../config';
import { clearInstalledAudio, listInstalledAudio } from '../services/audioLibrary';
import type { Song } from '../models/types';
import {
  backupData,
  getChallengeNickname,
  getSettings,
  restoreData,
  setChallengeNickname,
  setChallengeIntroSeen,
  validateBackup,
  clearLocalAppData,
} from './local';
import {
  clearChallengeData,
  exportChallengeData,
  replaceChallengeData,
  validateChallengeData,
  type ChallengeDataBackup,
} from './challenge';

export interface FullAppBackup {
  schemaVersion: 'rechant-app-backup-2';
  purpose: 'full-app-state';
  createdAt: string;
  appVersion: string;
  localData: ReturnType<typeof backupData>;
  profile: { nickname: string; challengeIntroSeen: boolean };
  challenge: ChallengeDataBackup;
  contentSnapshot: Array<{
    songId: string;
    title: string;
    packVersion: string;
    contentVersion: string;
    durationMs: number;
    audioVersion: string;
    contentReady: boolean;
  }>;
  installedAudioInventory: Awaited<ReturnType<typeof listInstalledAudio>>;
  note: string;
}

export async function createFullAppBackup(songs: Song[]): Promise<FullAppBackup> {
  const [challenge, installedAudioInventory] = await Promise.all([
    exportChallengeData(),
    listInstalledAudio(),
  ]);
  return {
    schemaVersion: 'rechant-app-backup-2',
    purpose: 'full-app-state',
    createdAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    localData: backupData(),
    profile: {
      nickname: getChallengeNickname(),
      challengeIntroSeen: localStorage.getItem('rechant.challenge.intro.v1') === 'seen',
    },
    challenge,
    contentSnapshot: songs.map((song) => ({
      songId: song.songId,
      title: song.title,
      packVersion: song.packVersion,
      contentVersion: song.version ?? song.packVersion,
      durationMs: song.durationMs,
      audioVersion: song.audioVersion ?? song.requiredAudio?.audioVersion ?? '',
      contentReady: song.contentReady,
    })),
    // Metadata only: MP3 blobs are deliberately excluded from the backup.
    installedAudioInventory,
    note: 'MP3 음원 파일은 백업에 포함되지 않습니다. 복원 후 필요한 경우 음원팩을 다시 설치하세요.',
  };
}

function validateFullBackup(value: unknown): FullAppBackup {
  if (!value || typeof value !== 'object') throw new Error('지원하지 않거나 손상된 백업 파일입니다.');
  const backup = value as Partial<FullAppBackup>;
  if (backup.schemaVersion !== 'rechant-app-backup-2' || backup.purpose !== 'full-app-state') {
    throw new Error('전체 앱 백업 파일이 아닙니다. 이전 버전의 백업은 설정 및 연습 기록만 복원할 수 있습니다.');
  }
  validateBackup(backup.localData);
  validateChallengeData(backup.challenge);
  if (!backup.profile || typeof backup.profile.nickname !== 'string' || typeof backup.profile.challengeIntroSeen !== 'boolean') {
    throw new Error('사용자 프로필 백업이 올바르지 않습니다.');
  }
  if (!Array.isArray(backup.contentSnapshot) || !Array.isArray(backup.installedAudioInventory)) {
    throw new Error('콘텐츠 또는 음원 정보가 올바르지 않습니다.');
  }
  return backup as FullAppBackup;
}

export async function restoreFullAppBackup(value: unknown): Promise<{ audioInventoryCount: number }> {
  // Keep compatibility with the original settings/practice-only backup format.
  if (value && typeof value === 'object' && (value as { schemaVersion?: string }).schemaVersion === 'rechant-user-backup-1') {
    restoreData(value);
    return { audioInventoryCount: 0 };
  }

  const backup = validateFullBackup(value);
  const previousLocal = backupData();
  const previousNickname = getChallengeNickname();
  const previousIntro = localStorage.getItem('rechant.challenge.intro.v1') === 'seen';
  const previousChallenge = await exportChallengeData();

  try {
    restoreData(backup.localData);
    setChallengeNickname(backup.profile.nickname);
    setChallengeIntroSeen(backup.profile.challengeIntroSeen);
    await replaceChallengeData(backup.challenge);
  } catch (error) {
    restoreData(previousLocal);
    setChallengeNickname(previousNickname);
    setChallengeIntroSeen(previousIntro);
    await replaceChallengeData(previousChallenge);
    throw error;
  }

  // Audio inventory is descriptive only; it cannot recreate excluded MP3 blobs.
  return { audioInventoryCount: backup.installedAudioInventory.length };
}

export async function clearFullAppData(): Promise<void> {
  await Promise.all([clearChallengeData(), clearInstalledAudio()]);
  clearLocalAppData();

  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => /rechant/i.test(name)).map((name) => caches.delete(name)));
  }

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const basePath = new URL('.', window.location.href).pathname;
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations
      .filter((registration) => new URL(registration.scope).pathname.startsWith(basePath))
      .map((registration) => registration.unregister()));
  }
}

export { getSettings };
