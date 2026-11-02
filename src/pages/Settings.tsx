import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, HardDriveDownload, Download, Upload, FileJson, RefreshCw, ShieldAlert } from 'lucide-react';
import { getSettings } from '../repositories/local';
import { createFullAppBackup, restoreFullAppBackup, clearFullAppData } from '../repositories/appBackup';
import { listChallengeAttempts, listTimingRecords } from '../repositories/challenge';
import type { Settings, Song, InstalledAudioMeta } from '../models/types';
import { listInstalledAudio } from '../services/audioLibrary';
import AudioPackInstaller from '../components/AudioPackInstaller';
import { APP_VERSION } from '../config';

function downloadJson(value: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function SettingsPage({ settings, onChange, songs, onAudioChanged }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  songs: Song[];
  onAudioChanged: () => Promise<void> | void;
}) {
  const backupInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const [installed, setInstalled] = useState<InstalledAudioMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetConfirmed, setResetConfirmed] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [timingCount, setTimingCount] = useState(0);

  async function refresh(): Promise<void> { setInstalled(await listInstalledAudio()); }
  async function refreshCounts(): Promise<void> {
    const [attempts, timings] = await Promise.all([listChallengeAttempts(), listTimingRecords()]);
    setAttemptCount(attempts.length);
    setTimingCount(timings.length);
  }

  useEffect(() => {
    void refresh();
    void refreshCounts();
  }, []);

  const total = installed.reduce((sum, item) => sum + item.byteLength, 0);

  async function saveFullBackup(): Promise<void> {
    setBusy(true);
    setNotice('전체 앱 데이터를 백업하고 있습니다...');
    try {
      const backup = await createFullAppBackup(songs);
      downloadJson(backup, `Rechant-Full-Backup-${new Date().toISOString().slice(0, 10)}.json`);
      setNotice('전체 앱 백업 파일을 저장했습니다. MP3 음원 파일은 포함되지 않습니다.');
      setResetConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '전체 앱 백업에 실패했습니다.');
    } finally { setBusy(false); }
  }

  async function exportScoring(): Promise<void> {
    setBusy(true);
    try {
      const records = await listChallengeAttempts();
      downloadJson({ schemaVersion: 'rechant-challenge-scoring-export-1', exportedAt: new Date().toISOString(), records }, 'Rechant-Challenge-Scoring.json');
      setNotice(`채점 기록 ${records.length}건을 내보냈습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '채점 기록을 내보내지 못했습니다.');
    } finally { setBusy(false); }
  }

  async function exportTiming(): Promise<void> {
    setBusy(true);
    try {
      const records = await listTimingRecords();
      downloadJson({ schemaVersion: 'rechant-challenge-timing-export-1', exportedAt: new Date().toISOString(), records }, 'Rechant-Challenge-Timing-Analysis.json');
      setNotice(`베타 타이밍 분석 기록 ${records.length}건을 내보냈습니다.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '타이밍 분석 데이터를 내보내지 못했습니다.');
    } finally { setBusy(false); }
  }

  async function restoreBackup(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const value = JSON.parse(await file.text());
      if (!window.confirm('현재 앱 설정과 기록을 백업 파일의 내용으로 교체하시겠습니까?')) return;
      const result = await restoreFullAppBackup(value);
      onChange(getSettings());
      await Promise.all([refresh(), refreshCounts(), onAudioChanged()]);
      setNotice(result.audioInventoryCount
        ? `백업을 복원했습니다. MP3 파일은 백업에 포함되지 않아, 현재 기기에 음원이 없다면 음원팩을 다시 설치해야 합니다. 백업에 기록된 음원은 ${result.audioInventoryCount}곡입니다.`
        : '백업을 복원했습니다.');
      setResetConfirmed(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '백업을 복원하지 못했습니다.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function resetApp(): Promise<void> {
    if (!resetConfirmed) return;
    const accepted = window.confirm(
      '정말 앱 데이터를 초기화할까요?\n\n현재 브라우저의 닉네임, 설정, 연습 기록, 도전 기록, 타이밍 분석 데이터와 설치된 MP3가 삭제됩니다.\nGitHub에 배포된 콘텐츠는 삭제되지 않습니다.\n초기화 후 음원팩을 다시 설치하고, 필요하면 전체 앱 백업 JSON을 복원하세요.',
    );
    if (!accepted) return;
    setBusy(true);
    setNotice('앱 데이터를 초기화하고 있습니다...');
    try {
      await clearFullAppData();
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '앱 데이터를 초기화하지 못했습니다.');
      setBusy(false);
    }
  }

  return <>
    <div className="back-heading"><Link to="/" aria-label="뒤로"><ChevronLeft /></Link><h2>설정</h2></div>
    <section className="settings-card">
      <h3>가사 클릭 시 미리 재생</h3>
      <p>선택한 가사 시작 시점보다 조금 먼저 재생합니다.</p>
      <div className="spread"><span>0.0초</span><strong>{(settings.seekLeadMs / 1000).toFixed(1)}초 전</strong><span>3.0초</span></div>
      <input type="range" min="0" max="3000" step="100" value={settings.seekLeadMs} onChange={(event) => onChange({ ...settings, seekLeadMs: Number(event.target.value) })} />
      <button className="subtle-btn" onClick={() => onChange({ ...settings, seekLeadMs: 700 })}>기본값 0.7초로 복원</button>
    </section>

    <section className="settings-card">
      <div className="spread"><div><h3>음원 관리</h3><p>다운로드한 음원팩을 이 브라우저에 설치해 주세요.</p></div><HardDriveDownload /></div>
      <AudioPackInstaller songs={songs} compact onInstalled={async () => { await refresh(); await onAudioChanged(); }} />
      <div className="spread storage-summary"><span>저장된 음원 {installed.length}곡</span><strong>{(total / 1024 / 1024).toFixed(1)} MB</strong></div>
    </section>

    <section className="settings-card">
      <h3>도전 데이터 내보내기</h3>
      <p>채점 데이터는 향후 랭킹을 위해 보존하고, 타이밍 분석 데이터는 현재 베타 테스트에서만 사용합니다. 두 데이터는 별도 파일로 내보냅니다.</p>
      <div className="spread"><span>누적 도전 기록</span><strong>{attemptCount}건</strong></div>
      <div className="spread"><span>타이밍 분석 데이터</span><strong>{timingCount}건</strong></div>
      <div className="backup-actions">
        <button className="secondary-button" disabled={busy} onClick={() => void exportScoring()}><FileJson size={16} /> 채점 JSON</button>
        <button className="secondary-button" disabled={busy} onClick={() => void exportTiming()}><FileJson size={16} /> 타이밍 JSON</button>
      </div>
    </section>

    <section className="settings-card">
      <h3>전체 앱 백업 및 복원</h3>
      <p>닉네임, 설정, 일반 연습 기록, 도전 채점 기록, 개인 최고 기록에 필요한 원본 기록, 베타 타이밍 데이터와 콘텐츠 상태를 백업합니다.</p>
      <p className="data-note">MP3 음원 파일은 용량 때문에 포함하지 않습니다. 복원 후 음원이 설치되어 있지 않으면 음원팩을 다시 설치해 주세요. 타이밍 분석 데이터도 베타 종료 전까지 전체 백업에 포함됩니다.</p>
      <div className="backup-actions">
        <button className="secondary-button" disabled={busy} onClick={() => void saveFullBackup()}><Download size={16} /> 전체 백업 JSON 저장</button>
        <button className="primary-action" disabled={busy} onClick={() => backupInput.current?.click()}><Upload size={16} /> 백업 복원</button>
      </div>
      <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={(event) => void restoreBackup(event)} />
    </section>

    <section className="settings-card">
      <div className="spread"><div><h3>앱 데이터 초기화 및 재설치</h3><p>문제가 발생했을 때 브라우저에 저장된 앱 데이터를 초기화하고 처음부터 다시 설치합니다.</p></div><ShieldAlert color="#b4233c" /></div>
      <p className="data-note">초기화하면 닉네임, 설정, 연습 기록, 도전 기록, 타이밍 데이터와 설치된 MP3가 삭제됩니다. 먼저 전체 백업 JSON을 저장하고 안전한 곳에 보관하세요. 백업 파일은 초기화 후 직접 복원해야 합니다.</p>
      <label className="reset-confirm"><input type="checkbox" checked={resetConfirmed} onChange={(event) => setResetConfirmed(event.target.checked)} /> 전체 앱 백업 JSON을 저장했고, 초기화 후 복원할 수 있음을 확인했습니다.</label>
      <button className="danger-action" disabled={!resetConfirmed || busy} onClick={() => void resetApp()}><RefreshCw size={16} /> 앱 데이터 초기화</button>
    </section>

    <section className="settings-card">
      <h3>콘텐츠 상태</h3>
      <p>콘텐츠팩 {songs[0]?.packVersion ?? '없음'} · {songs.length}곡</p>
      {songs.map((song) => <p key={song.songId}>{song.title} · {song.contentError ?? (song.audioReady ? '연습 가능' : song.audioError)} · 표시 {song.displayGroups.length} / 응원 {song.chantEvents.length}</p>)}
    </section>
    <p className="muted app-version">Re:chant Web App v{APP_VERSION} · 설정과 음원은 이 브라우저에 저장됩니다.</p>
    <p role="status" aria-live="polite">{notice}</p>
  </>;
}
