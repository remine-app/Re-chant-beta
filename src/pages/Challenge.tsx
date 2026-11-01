import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useParams} from 'react-router-dom';
import {ArrowLeft,Mic,Play,Pause,ShieldCheck} from 'lucide-react';
import type {Song} from '../models/types';
import {AudioEngine} from '../services/audio';
import {activeStarts} from '../services/runtime';
import DisplayGroupRenderer from '../components/DisplayGroupRenderer';
import {fmt} from '../components/Common';
import {VoiceDetector} from '../features/challenge/voice';
import {scoreChallenge,type ChallengeScore} from '../features/challenge/scoring';
type Phase='intro'|'ready'|'running'|'paused'|'done';
export default function Challenge({songs}:{songs:Song[]}){
 const {songId}=useParams();const song=songs.find(s=>s.songId===songId);
 const [phase,setPhase]=useState<Phase>('intro'),[position,setPosition]=useState(0),[level,setLevel]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<ChallengeScore|null>(null);
 const engine=useRef<AudioEngine|null>(null),detector=useRef<VoiceDetector|null>(null),finished=useRef(false);
 const groups=song?.displayGroups??[];const active=useMemo(()=>activeStarts(groups,position+(song?.defaultOffsetMs??0)),[groups,position,song]);
 useEffect(()=>{if(!song?.audioReady||!song.audioUrl)return;const audio=new AudioEngine();audio.load(song.audioUrl,song.durationMs,song.practiceDurationMs);engine.current=audio;
  return()=>{audio.dispose();engine.current=null;const mic=detector.current;detector.current=null;void mic?.stop()};},[song?.songId,song?.audioUrl,song?.audioReady]);
 useEffect(()=>{if(phase!=='running')return;const interval=window.setInterval(()=>{const audio=engine.current,mic=detector.current;if(!audio||!mic)return;
  const t=audio.positionMs;setPosition(t);setLevel(mic.sample(t));
  if(t>=song!.practiceDurationMs-30&&!finished.current){finished.current=true;const segments=mic.finish(t);setResult(scoreChallenge(song!.chantEvents,segments,song!.defaultOffsetMs));audio.pause();void mic.stop();detector.current=null;setPhase('done')}
 },50);return()=>clearInterval(interval)},[phase,song]);
 useEffect(()=>{if(phase!=='running')return;const onHide=()=>{if(document.visibilityState==='hidden'){engine.current?.pause();setPhase('paused')}};document.addEventListener('visibilitychange',onHide);return()=>document.removeEventListener('visibilitychange',onHide)},[phase]);
 async function prepare(){setError('');if(!song?.audioReady||!engine.current)return;const mic=new VoiceDetector();try{await mic.start();detector.current=mic;setPhase('ready')}catch(e){setError(e instanceof Error?e.message:String(e))}}
 async function start(){if(!engine.current||!detector.current)return;try{await engine.current.play();setPhase('running')}catch(e){setError(e instanceof Error?e.message:String(e))}}
 function pause(){engine.current?.pause();setPhase('paused');setLevel(false)}
 function reset(){finished.current=false;engine.current?.pause();engine.current?.seek(0);const mic=detector.current;detector.current=null;void mic?.stop();setPosition(0);setLevel(false);setResult(null);setPhase('intro')}
 if(!song)return <section className="challenge-page"><Link to="/songs">곡 목록으로</Link><p>곡을 찾을 수 없습니다.</p></section>;
 if(song.songId!=='love-attack')return <section className="challenge-page"><Link to={`/practice/${song.songId}`}>연습으로 돌아가기</Link><p>현재 도전모드는 LOVE ATTACK만 지원합니다.</p></section>;
 if(!song.contentReady||!song.audioReady)return <section className="challenge-page"><Link to={`/practice/${song.songId}`}>연습 화면으로 돌아가기</Link><p>도전모드를 시작하려면 곡 콘텐츠와 음원팩이 설치되어 있어야 합니다.</p></section>;
 return <section className="challenge-page"><header className="challenge-top"><Link to={`/practice/${song.songId}`} onClick={reset}><ArrowLeft size={20}/> 연습으로</Link><strong>도전모드 β</strong></header><h1>{song.title}</h1><p className="challenge-sub">{song.artist} · 타이밍 채점 베타</p>
 {phase==='intro'?<div className="challenge-panel"><ShieldCheck size={32}/><h2>도전모드 안내</h2><p>응원 타이밍을 측정하는 베타 모드입니다.<br/>이어폰 또는 헤드셋 마이크 사용을 권장합니다.</p><p>음성을 녹음하거나 저장하지 않습니다. 마이크 입력은 기기 안에서 실시간으로 분석됩니다. 현재 베타는 서버에 결과를 전송하지 않습니다. 음성·영상 파일은 생성하거나 전송하지 않습니다.</p><p>발성 시점만 비교하며, 실제 응원 문구의 정확도는 평가하지 않습니다.</p><button className="challenge-primary" onClick={()=>void prepare()}><Mic size={18}/> 마이크 허용하고 준비</button></div>:null}
 {phase==='ready'&&<div className="challenge-panel"><h2>준비 완료</h2><p>음원이 처음부터 재생됩니다. 마이크를 사용해 응원해 주세요.</p><button className="challenge-primary" onClick={()=>void start()}><Play size={18}/> 도전 시작</button><button className="secondary-button" onClick={reset}>취소</button></div>}
 {(phase==='running'||phase==='paused')&&<><div className="challenge-live"><div className="spread"><span>{fmt(position)}</span><span>{fmt(song.practiceDurationMs)}</span></div><progress max={song.practiceDurationMs} value={position}/><div className="challenge-mic"><Mic size={20}/>{level?'발성 감지 중':'마이크 입력 대기'}</div></div><div className="challenge-lyrics">{groups.map((g,i)=><div key={g.id} className={'challenge-line '+(active.includes(i)?'is-current':'')}><DisplayGroupRenderer group={g} hint={false}/></div>)}</div><div className="challenge-actions">{phase==='running'?<button onClick={pause}><Pause size={18}/> 일시정지</button>:<button onClick={()=>void start()}><Play size={18}/> 다시 시작</button>}<button onClick={reset}>도전 종료</button></div></>}
 {phase==='done'&&result&&<div className="challenge-panel"><h2>도전 완료!</h2><div className="challenge-score">{result.score}<small> / 100점</small></div><p>감지된 응원 {result.matched} / {result.total}개 · 평균 타이밍 오차 {result.averageErrorMs===null?'—':`${result.averageErrorMs}ms`}</p><p>발성 타이밍만 측정한 베타 점수입니다. 랭킹에는 제출되지 않습니다.</p><button className="challenge-primary" onClick={reset}>다시 도전</button><details><summary>응원별 결과 보기</summary><div className="challenge-results">{result.events.map(e=><div key={e.id}><span>{e.text}</span><b>{e.points}점</b></div>)}</div></details></div>}
 {error&&<p role="alert" className="error">{error}</p>}
 </section>
}
