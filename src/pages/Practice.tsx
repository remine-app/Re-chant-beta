import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import {
  ChevronLeft, Settings, Play, Pause, SkipBack, SkipForward,
  RotateCcw, RotateCw, LocateFixed, Music2, Mic, Square,
  ShieldCheck, Trophy, X, CheckCircle2, LoaderCircle,
} from 'lucide-react';
import type { Song, Settings as SettingsType, PracticeMode, HintMode, DisplayGroup } from '../models/types';
import { AudioEngine } from '../services/audio';
import { seekForLine } from '../services/activeLyric';
import { activeStarts } from '../services/runtime';
import DisplayGroupRenderer from '../components/DisplayGroupRenderer';
import { tickSession } from '../services/session';
import { getProgress, updateProgress } from '../repositories/local';
import { fmt } from '../components/Common';
import AudioPackInstaller from '../components/AudioPackInstaller';
import { VoiceDetector } from '../features/challenge/voice';
import { scoreChallenge, type ChallengeScore } from '../features/challenge/scoring';

type PracticeTab = PracticeMode | 'challenge';
type ChallengePhase = 'off' | 'intro' | 'requesting' | 'ready' | 'running' | 'done' | 'error';

const CHALLENGE_INTRO_KEY = 'rechant.challenge.intro.v1';
const CHALLENGE_NICKNAME_KEY = 'rechant.challenge.nickname.v1';

export default function Practice({ songs, settings, onSettings, onAudioInstalled }: {
  songs: Song[];
  settings: SettingsType;
  onSettings: (s: SettingsType) => void;
  onAudioInstalled: () => Promise<void> | void;
}) {
  const location = useLocation();
  const resume = new URLSearchParams(location.search).get('resume') === '1';
  const { songId } = useParams();
  const song = songs.find((s) => s.songId === songId);

  const [tab, setTab] = useState<PracticeTab>(settings.defaultPracticeMode);
  const [hint, setHint] = useState<HintMode>(settings.practiceHintMode);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tracking, setTracking] = useState(true);
  const [playError, setPlayError] = useState('');
  const [challengePhase, setChallengePhase] = useState<ChallengePhase>('off');
  const [challengeError, setChallengeError] = useState('');
  const [micActive, setMicActive] = useState(false);
  const [result, setResult] = useState<ChallengeScore | null>(null);
  const [nickname, setNickname] = useState(() => localStorage.getItem(CHALLENGE_NICKNAME_KEY) ?? '');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknamePromptDismissed, setNicknamePromptDismissed] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const player = useRef<AudioEngine | null>(null);
  const lineRefs = useRef(new Map<string, HTMLButtonElement>());
  const suppress = useRef(false);
  const activeRef = useRef(-1);
  const modeRef = useRef<PracticeMode>(tab === 'challenge' ? 'practice' : tab);
  const tabRef = useRef<PracticeTab>(tab);
  const phaseRef = useRef<ChallengePhase>(challengePhase);
  const detector = useRef<VoiceDetector | null>(null);
  const finished = useRef(false);
  const micRequestId = useRef(0);
  const previousTab = useRef<PracticeMode>(settings.defaultPracticeMode);

  const challengeMode = tab === 'challenge';
  const mode: PracticeMode = challengeMode ? 'practice' : tab;
  const original = challengeMode || (mode === 'practice' && hint === 'lyrics-only');
  const rows = useMemo(() => {
    if (!song) return [];
    return original ? song.lines.map((line) => ({ ...line, rows: [] })) : song.displayGroups;
  }, [song, original]);
  const actives = useMemo(
    () => activeStarts(rows, pos + (song?.defaultOffsetMs ?? 0)),
    [rows, pos, song],
  );
  const active = actives[0] ?? -1;

  tabRef.current = tab;
  phaseRef.current = challengePhase;
  modeRef.current = mode;

  useEffect(() => {
    if (!song?.contentReady || !song.audioReady || !song.audioUrl) return;
    const engine = new AudioEngine();
    player.current = engine;
    engine.load(song.audioUrl, song.durationMs, song.practiceDurationMs);
    const prev = resume ? getProgress()[song.songId] : undefined;
    setPos(Math.min(prev?.positionMs || 0, song.practiceDurationMs));
    activeRef.current = -1;
    setTracking(true);
    if (prev) {
      setTab(prev.mode);
      const restore = () => engine.seek(Math.min(prev.positionMs, song.practiceDurationMs));
      if (prev.positionMs >= song.durationMs) restore();
      else engine.element.addEventListener('loadedmetadata', restore, { once: true });
    }

    let session = { playedMs: 0, counted: false, last: performance.now() };
    let wasPlaying = false;
    let lastPersistAt = 0;
    const id = window.setInterval(() => {
      const t = engine.positionMs;
      const isPlaying = engine.isPlaying;
      setPos(t);
      setPlaying(isPlaying);
      const now = performance.now();
      const sessionResult = tickSession(session, now, isPlaying && wasPlaying);
      session = sessionResult.state;
      wasPlaying = isPlaying;
      if (sessionResult.delta > 0 && (now - lastPersistAt >= 250 || sessionResult.count)) {
        updateProgress(song.songId, t, modeRef.current, sessionResult.delta, sessionResult.count);
        lastPersistAt = now;
      }

      if (tabRef.current === 'challenge' && phaseRef.current === 'running') {
        const mic = detector.current;
        if (mic) setMicActive(mic.sample(t));
        if (t >= song.practiceDurationMs - 30 && !finished.current) {
          finished.current = true;
          const segments = mic?.finish(t) ?? [];
          setResult(scoreChallenge(song.chantEvents, segments, song.defaultOffsetMs));
          engine.pause();
          setPlaying(false);
          setMicActive(false);
          if (detector.current) {
            const activeDetector = detector.current;
            detector.current = null;
            void activeDetector.stop();
          }
          setChallengePhase('done');
        }
      }
    }, 50);

    return () => {
      window.clearInterval(id);
      updateProgress(song.songId, engine.positionMs, modeRef.current);
      engine.dispose();
      player.current = null;
    };
  }, [song?.songId, song?.audioUrl, song?.audioReady, resume]);

  useEffect(() => {
    if (song?.audioReady) updateProgress(song.songId, pos, mode);
  }, [mode]);

  useEffect(() => {
    if (active < 0 || !tracking || active === activeRef.current || !song) return;
    activeRef.current = active;
    const node = lineRefs.current.get(rows[active].id);
    if (node) {
      suppress.current = true;
      scrollToLine(node);
      window.setTimeout(() => { suppress.current = false; }, 700);
    }
  }, [active, tracking, song, original, rows]);

  useEffect(() => () => {
    micRequestId.current += 1;
    const mic = detector.current;
    detector.current = null;
    if (mic) void mic.stop();
  }, []);

  function scrollToLine(node: HTMLButtonElement) {
    const container = scrollRef.current;
    if (!container) return;
    const top = node.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    container.scrollTo({
      top: Math.max(0, top + node.offsetHeight / 2 - container.clientHeight * 0.43),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  async function requestMicrophone(markIntroSeen: boolean): Promise<VoiceDetector | null> {
    const requestId = ++micRequestId.current;
    setChallengePhase('requesting');
    setChallengeError('');
    const mic = new VoiceDetector();
    try {
      await mic.start();
      if (requestId !== micRequestId.current || tabRef.current !== 'challenge') {
        await mic.stop();
        return null;
      }
      detector.current = mic;
      if (markIntroSeen || localStorage.getItem(CHALLENGE_INTRO_KEY) !== 'seen') {
        localStorage.setItem(CHALLENGE_INTRO_KEY, 'seen');
      }
      setChallengePhase('ready');
      setMicActive(false);
      return mic;
    } catch (error) {
      await mic.stop();
      if (requestId === micRequestId.current && tabRef.current === 'challenge') {
        setChallengeError(error instanceof Error ? error.message : '마이크를 사용할 수 없습니다.');
        setChallengePhase('error');
      }
      return null;
    }
  }

  function enterChallenge() {
    if (!song || song.songId !== 'love-attack' || tab === 'challenge') return;
    previousTab.current = tab;
    player.current?.pause();
    player.current?.seek(0);
    setPos(0);
    setPlaying(false);
    setTracking(true);
    activeRef.current = -1;
    finished.current = false;
    setResult(null);
    setNicknamePromptDismissed(false);
    tabRef.current = 'challenge';
    setTab('challenge');
    if (localStorage.getItem(CHALLENGE_INTRO_KEY) === 'seen') {
      void requestMicrophone(false);
    } else {
      setChallengePhase('intro');
    }
  }

  function leaveChallenge(nextTab: PracticeMode) {
    micRequestId.current += 1;
    player.current?.pause();
    if (tab === 'challenge') player.current?.seek(0);
    const mic = detector.current;
    detector.current = null;
    if (mic) void mic.stop();
    setMicActive(false);
    setPos(0);
    setPlaying(false);
    setResult(null);
    setChallengeError('');
    setChallengePhase('off');
    finished.current = false;
    tabRef.current = nextTab;
    setTab(nextTab);
    onSettings({ ...settings, defaultPracticeMode: nextTab });
  }

  async function startChallenge() {
    const engine = player.current;
    if (!engine || !song || challengePhase === 'running' || challengePhase === 'requesting' || challengePhase === 'intro') return;
    let mic = detector.current;
    if (!mic) mic = await requestMicrophone(false);
    if (!mic) return;
    try {
      finished.current = false;
      mic.reset();
      engine.pause();
      engine.seek(0);
      setPos(0);
      setResult(null);
      setNicknamePromptDismissed(false);
      setTracking(true);
      activeRef.current = -1;
      await engine.play();
      setPlaying(true);
      setChallengePhase('running');
    } catch (error) {
      setChallengeError(error instanceof Error ? error.message : '음원을 재생하지 못했습니다.');
      setChallengePhase('ready');
    }
  }

  async function stopChallenge() {
    player.current?.pause();
    player.current?.seek(0);
    setPos(0);
    setPlaying(false);
    setMicActive(false);
    finished.current = false;
    setResult(null);
    setNicknamePromptDismissed(false);
    const mic = detector.current;
    if (mic) {
      mic.reset();
      setChallengePhase('ready');
    } else {
      // After a completed attempt the stream is stopped; permission is reused silently.
      await requestMicrophone(false);
    }
  }

  async function toggle() {
    const engine = player.current;
    if (!engine) return;
    if (!engine.isPlaying) {
      try {
        await engine.play();
        setPlaying(true);
      } catch (error) {
        setPlayError(error instanceof Error ? error.message : '재생하지 못했습니다.');
      }
    } else {
      engine.pause();
      setPlaying(false);
    }
  }

  function seek(t: number) {
    if (challengeMode || !song) return;
    const next = Math.min(song.practiceDurationMs, Math.max(0, t));
    player.current?.seek(next);
    setPos(next);
  }

  function goLine(index: number) {
    if (challengeMode || !song) return;
    const line = rows[index];
    if (!line) return;
    seek(seekForLine(line.startMs - song.defaultOffsetMs, settings.seekLeadMs));
    setTracking(true);
    activeRef.current = -1;
  }

  function changeMode(next: PracticeMode) {
    if (challengeMode) {
      leaveChallenge(next);
      return;
    }
    tabRef.current = next;
    setTab(next);
    onSettings({ ...settings, defaultPracticeMode: next });
  }

  function changeHint(next: HintMode) {
    setHint(next);
    onSettings({ ...settings, practiceHintMode: next });
  }

  function saveNickname() {
    const value = nicknameDraft.trim().slice(0, 16);
    if (!value) return;
    localStorage.setItem(CHALLENGE_NICKNAME_KEY, value);
    setNickname(value);
    setNicknameDraft('');
  }

  if (!song) return <div className="empty-text">곡을 불러오고 있습니다. <Link to="/songs">곡 목록</Link></div>;
  if (!song.contentReady) return <div className="empty-text" role="alert">{song.contentError ?? '콘텐츠 없음'} <Link to="/songs">곡 목록</Link></div>;
  if (!song.audioReady) return <div className="practice-layout install-layout"><div className="practice-appbar"><Link to="/songs" aria-label="곡 목록"><ChevronLeft /></Link><div className="practice-song-info"><h1 title={song.title}>{song.title}</h1><p>{song.artist}</p></div><Link to="/settings" aria-label="설정"><Settings size={21} /></Link></div><AudioPackInstaller songs={songs} onInstalled={onAudioInstalled} /><p className="privacy-note">다운로드한 ZIP은 설치 과정에서만 읽고, MP3는 이 기기의 브라우저 저장소에 보관됩니다.</p></div>;

  return (
    <div className="practice-layout">
      <div className="practice-appbar">
        <Link to="/songs" aria-label="곡 목록"><ChevronLeft /></Link>
        <div className="practice-song-info"><h1 title={song.title}>{song.title}</h1><p>{song.artist}</p></div>
        <Link to="/settings" aria-label="설정"><Settings size={21} /></Link>
      </div>

      <div className="mode-tabs main-modes" role="tablist" aria-label="연습 모드 선택">
        <button role="tab" aria-selected={tab === 'follow'} className={tab === 'follow' ? 'selected' : ''} onClick={() => changeMode('follow')}>응원법 전체</button>
        <button role="tab" aria-selected={tab === 'practice'} className={tab === 'practice' ? 'selected' : ''} onClick={() => changeMode('practice')}>연습모드</button>
        <button role="tab" aria-selected={challengeMode} className={challengeMode ? 'selected challenge-tab' : 'challenge-tab'} disabled={song.songId !== 'love-attack'} title={song.songId !== 'love-attack' ? '현재 LOVE ATTACK만 지원합니다.' : '응원 타이밍 도전'} onClick={enterChallenge}>도전모드</button>
      </div>

      {tab === 'practice' && <div className="hint-tabs"><button className={hint === 'hint' ? 'selected' : ''} onClick={() => changeHint('hint')}>힌트 표시</button><button className={hint === 'lyrics-only' ? 'selected' : ''} onClick={() => changeHint('lyrics-only')}>원본 가사만</button></div>}

      {challengeMode && <div className="challenge-inline-status" aria-live="polite">
        {challengePhase === 'requesting' && <><LoaderCircle className="spin" size={15} /> 마이크 연결 중...</>}
        {challengePhase === 'ready' && <><CheckCircle2 size={15} /> 마이크 준비 완료 · 처음부터 도전할 수 있습니다.</>}
        {challengePhase === 'running' && <><Mic size={15} /> {micActive ? '발성 감지 중' : '응원 타이밍 측정 중'}</>}
        {challengePhase === 'done' && <><Trophy size={15} /> 완주했습니다! 결과를 확인해 주세요.</>}
        {challengePhase === 'error' && <span role="alert">마이크 연결 실패: {challengeError}</span>}
      </div>}

      <div
        className={`lyrics-scroll ${challengeMode ? 'challenge-lyrics' : ''}`}
        ref={scrollRef}
        onTouchStart={() => { if (!suppress.current) setTracking(false); }}
        onWheel={() => { if (!suppress.current) setTracking(false); }}
        onPointerDown={(event) => { if (event.pointerType === 'mouse' && !suppress.current) setTracking(false); }}
      >
        {rows.length ? <div className="lyrics-content">{rows.map((line, index) => (
          <button
            key={line.id}
            ref={(element) => { if (element) lineRefs.current.set(line.id, element); else lineRefs.current.delete(line.id); }}
            className={`lyric-line ${actives.includes(index) ? 'is-current' : ''}`}
            disabled={challengeMode}
            aria-disabled={challengeMode}
            onClick={() => goLine(index)}
          >
            <span className="lyric-time">{fmt(line.startMs)}</span>
            <span className="lyric-words">{original ? ('lyric' in line ? line.lyric : '') : <DisplayGroupRenderer group={line as DisplayGroup} hint={mode === 'practice'} />}</span>
          </button>
        ))}</div> : <div className="missing-content"><Music2 size={35} /><h3>음원은 준비됐어요</h3><p>이 곡의 콘텐츠가 아직 준비되지 않았습니다.<br />콘텐츠가 준비되면 가사와 응원법이 표시됩니다.</p></div>}
      </div>

      <div className="follow-slot">{!tracking && rows.length > 0 && <button className="follow-button" onClick={() => { setTracking(true); activeRef.current = -1; const node = rows[active] && lineRefs.current.get(rows[active].id); if (node) scrollToLine(node); }}><LocateFixed size={16} /> 현재 가사</button>}</div>

      {playError && !challengeMode && <p role="alert" className="error">{playError}</p>}
      <div className={`player-controls ${challengeMode ? 'challenge-player-controls' : ''}`}>
        <input aria-label="재생 위치" type="range" min="0" max={song.practiceDurationMs} value={Math.min(song.practiceDurationMs, pos)} disabled={challengeMode} onChange={(event) => seek(Number(event.target.value))} />
        <div className="spread track-time"><span>{fmt(pos)}</span><span>{fmt(song.practiceDurationMs)}</span></div>
        {challengeMode ? (
          <div className="challenge-transport">
            <button className="challenge-play-button" onClick={() => void startChallenge()} disabled={challengePhase === 'intro' || challengePhase === 'requesting' || challengePhase === 'running'}>
              <Play size={21} fill="currentColor" /> {challengePhase === 'done' ? '다시 도전' : challengePhase === 'running' ? '도전 진행 중' : '재생'}
            </button>
            <button className="challenge-stop-button" onClick={() => void stopChallenge()} disabled={challengePhase === 'intro' || challengePhase === 'requesting' || challengePhase === 'off'}>
              <Square size={17} fill="currentColor" /> 정지
            </button>
          </div>
        ) : (
          <div className="transport">
            <button onClick={() => seek(pos - 10000)} aria-label="10초 뒤로"><RotateCcw /><small>-10s</small></button>
            <button onClick={() => rows.length && goLine(Math.max(0, active - 1))} aria-label="이전 가사"><SkipBack size={27} fill="currentColor" /></button>
            <button className="play-main" onClick={() => void toggle()} aria-label={playing ? '일시정지' : '재생'}>{playing ? <Pause fill="currentColor" size={29} /> : <Play fill="currentColor" size={29} />}</button>
            <button onClick={() => rows.length && goLine(Math.min(rows.length - 1, active + 1))} aria-label="다음 가사"><SkipForward size={27} fill="currentColor" /></button>
            <button onClick={() => seek(pos + 10000)} aria-label="10초 앞으로"><RotateCw /><small>+10s</small></button>
          </div>
        )}
        {challengeMode && challengePhase === 'done' && result && (
          <section className="challenge-result-card" aria-live="polite">
            <div className="challenge-result-heading"><Trophy size={19} /><strong>도전 완료!</strong></div>
            <div className="challenge-result-score">{result.score}<small>점 / 100점</small></div>
            <p>응원 감지 {result.matched} / {result.total}개 · 평균 타이밍 오차 {result.averageErrorMs === null ? '—' : `${result.averageErrorMs}ms`}</p>
            {nickname && <p className="challenge-nickname">닉네임: <strong>{nickname}</strong></p>}
            <p className="challenge-local-note">타이밍 점수이며, 현재 베타에서는 닉네임과 결과가 이 브라우저에만 저장됩니다. 서버 랭킹은 아직 연결되지 않았습니다.</p>
            <details><summary>응원별 결과 보기</summary><div className="challenge-results">{result.events.map((event) => <div key={event.id}><span>{event.text}</span><b>{event.points}점</b></div>)}</div></details>
          </section>
        )}
      </div>

      {challengeMode && challengePhase === 'intro' && (
        <div className="challenge-modal-backdrop">
          <section className="challenge-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-intro-title">
            <button className="challenge-modal-close" aria-label="닫기" onClick={() => leaveChallenge(previousTab.current)}><X size={19} /></button>
            <div className="challenge-modal-icon"><ShieldCheck size={29} /></div>
            <h2 id="challenge-intro-title">도전모드 안내</h2>
            <p>응원 타이밍을 측정하는 베타 모드입니다.<br />이어폰 또는 헤드셋 마이크 사용을 권장합니다.</p>
            <p className="challenge-privacy-copy">음성을 녹음하거나 저장하지 않습니다. 마이크 입력은 기기 안에서 실시간으로 분석됩니다. 현재 베타에서는 완주 점수와 닉네임도 이 브라우저에만 저장되며 서버로 전송되지 않습니다. 음성·영상 파일은 생성하거나 전송하지 않습니다.</p>
            <button className="challenge-modal-primary" onClick={() => void requestMicrophone(true)}><Mic size={18} /> 마이크 허용하고 준비</button>
            <button className="challenge-modal-secondary" onClick={() => leaveChallenge(previousTab.current)}>나중에</button>
          </section>
        </div>
      )}

      {challengeMode && challengePhase === 'requesting' && <div className="challenge-modal-backdrop"><section className="challenge-modal challenge-wait" role="status"><LoaderCircle className="spin" size={28} /><h2>마이크 연결 중</h2><p>브라우저의 마이크 권한 요청을 확인해 주세요.</p></section></div>}

      {challengeMode && challengePhase === 'error' && <div className="challenge-modal-backdrop"><section className="challenge-modal" role="alertdialog" aria-modal="true"><div className="challenge-modal-icon"><Mic size={27} /></div><h2>마이크를 연결하지 못했어요</h2><p>{challengeError}</p><p className="challenge-privacy-copy">브라우저 주소창의 사이트 권한에서 마이크가 허용되어 있는지 확인한 뒤 다시 시도해 주세요.</p><button className="challenge-modal-primary" onClick={() => void requestMicrophone(false)}>마이크 다시 연결</button><button className="challenge-modal-secondary" onClick={() => leaveChallenge(previousTab.current)}>연습모드로 돌아가기</button></section></div>}

      {challengeMode && challengePhase === 'done' && result && !nickname && !nicknamePromptDismissed && (
        <div className="challenge-modal-backdrop">
          <section className="challenge-modal" role="dialog" aria-modal="true" aria-labelledby="challenge-nickname-title">
            <button className="challenge-modal-close" aria-label="나중에" onClick={() => setNicknamePromptDismissed(true)}><X size={19} /></button>
            <div className="challenge-modal-icon"><Trophy size={28} /></div>
            <h2 id="challenge-nickname-title">첫 도전을 완료했어요!</h2>
            <p>결과 화면에 표시할 닉네임을 입력해 주세요.</p>
            <input className="challenge-nickname-input" value={nicknameDraft} maxLength={16} placeholder="닉네임 (최대 16자)" onChange={(event) => setNicknameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') saveNickname(); }} />
            <button className="challenge-modal-primary" onClick={saveNickname} disabled={!nicknameDraft.trim()}>닉네임 저장</button>
            <p className="challenge-privacy-copy">닉네임은 이 브라우저에 저장됩니다. 현재 베타에는 온라인 랭킹 기능이 포함되어 있지 않습니다.</p>
          </section>
        </div>
      )}
    </div>
  );
}
