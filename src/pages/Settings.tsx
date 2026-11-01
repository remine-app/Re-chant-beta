import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, HardDriveDownload } from 'lucide-react';
import { backupData, restoreData, getSettings } from '../repositories/local';
import type { Settings, Song, InstalledAudioMeta } from '../models/types';
import { listInstalledAudio } from '../services/audioLibrary';
import AudioPackInstaller from '../components/AudioPackInstaller';
import { APP_VERSION } from '../config';

export default function SettingsPage({ settings, onChange, songs, onAudioChanged }: {
  settings: Settings;
  onChange: (s: Settings) => void;
  songs: Song[];
  onAudioChanged: () => Promise<void> | void;
}) {
  const backupInput = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState('');
  const [installed, setInstalled] = useState<InstalledAudioMeta[]>([]);

  async function refresh() { setInstalled(await listInstalledAudio()); }
  useEffect(() => { void refresh(); }, []);
  const total = installed.reduce((sum, item) => sum + item.byteLength, 0);

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
      <h3>기록 백업 및 복원</h3>
      <p>설정과 연습 기록을 파일로 보관합니다. 음원은 포함되지 않으며 필요할 때 다시 설치하실 수 있습니다.</p>
      <button className="secondary-button" onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(backupData(), null, 2)], { type: 'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'Rechant-Backup.json';
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>백업 파일 저장</button>
      <button className="primary-action" onClick={() => backupInput.current?.click()}>백업 불러오기</button>
      <input ref={backupInput} type="file" accept=".json" hidden onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          const value = JSON.parse(await file.text());
          if (!confirm('현재 설정과 기록을 백업 내용으로 교체하시겠습니까?')) return;
          restoreData(value);
          onChange(getSettings());
          setNotice('백업을 복원했습니다.');
        } catch (error) {
          setNotice(error instanceof Error ? error.message : '백업을 복원하지 못했습니다.');
        } finally { event.target.value = ''; }
      }} />
      <p role="status">{notice}</p>
    </section>

    <section className="settings-card">
      <h3>콘텐츠 상태</h3>
      <p>콘텐츠팩 {songs[0]?.packVersion ?? '없음'} · {songs.length}곡</p>
      {songs.map((song) => <p key={song.songId}>{song.title} · {song.contentError ?? (song.audioReady ? '연습 가능' : song.audioError)} · 표시 {song.displayGroups.length} / 응원 {song.chantEvents.length}</p>)}
    </section>
    <p className="muted app-version">Re:chant Web App v{APP_VERSION} · 설정과 음원은 이 브라우저에 저장됩니다.</p>
  </>;
}
