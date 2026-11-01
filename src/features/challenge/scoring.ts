import type {ChantEvent} from '../../models/types';
export interface VoiceSegment { startMs:number; endMs:number }
export interface ScoredEvent { id:string; text:string; expectedMs:number; actualMs:number|null; errorMs:number|null; points:number }
export interface ChallengeScore { score:number; matched:number; total:number; averageErrorMs:number|null; events:ScoredEvent[] }
// Each vocal onset can match at most one cue. Timing-only beta; never judges words/pronunciation.
export function scoreChallenge(events:readonly ChantEvent[], segments:readonly VoiceSegment[], offsetMs=0):ChallengeScore {
 const cues=[...events].sort((a,b)=>a.startMs-b.startMs);
 const onsets=segments.filter(s=>Number.isFinite(s.startMs)&&s.endMs>=s.startMs).map(s=>s.startMs).sort((a,b)=>a-b);
 const used=new Set<number>();let matched=0,sum=0,totalPoints=0;
 const results=cues.map(c=>{const expected=c.startMs-offsetMs;let pick=-1,dist=Infinity;
  for(let i=0;i<onsets.length;i++){if(used.has(i))continue;const d=Math.abs(onsets[i]-expected);if(d<=900&&d<dist){pick=i;dist=d}}
  const points=pick<0?0:Math.max(0,Math.round(100*(1-dist/900)));
  if(pick>=0){used.add(pick);matched++;sum+=dist}totalPoints+=points;
  return {id:c.id,text:c.text,expectedMs:expected,actualMs:pick<0?null:onsets[pick],errorMs:pick<0?null:Math.round(dist),points};
 });
 return {score:cues.length?Math.round(totalPoints/cues.length):0,matched,total:cues.length,averageErrorMs:matched?Math.round(sum/matched):null,events:results};
}
