import type {VoiceSegment} from './scoring';
/** Local RMS-based speech/activity detector. Samples are never recorded or transmitted. */
export class VoiceDetector {
 private context:AudioContext|null=null;private stream:MediaStream|null=null;private analyser:AnalyserNode|null=null;
 private samples:Float32Array<ArrayBuffer>|null=null;private activeStart:number|null=null;private lastLoud:number|null=null;
 private segments:VoiceSegment[]=[];private baseline=0.008;
 async start(){if(!navigator.mediaDevices?.getUserMedia)throw new Error('이 브라우저에서는 마이크를 사용할 수 없습니다.');
  this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
  try{this.context=new AudioContext();await this.context.resume();const source=this.context.createMediaStreamSource(this.stream);
   this.analyser=this.context.createAnalyser();this.analyser.fftSize=2048;source.connect(this.analyser);this.samples=new Float32Array(this.analyser.fftSize) as Float32Array<ArrayBuffer>;
  }catch(e){await this.stop();throw e}}
 sample(positionMs:number){if(!this.analyser||!this.samples)return false;
  this.analyser.getFloatTimeDomainData(this.samples);let sum=0;for(const x of this.samples)sum+=x*x;
  const rms=Math.sqrt(sum/this.samples.length);this.baseline=this.baseline*.995+Math.min(rms,.025)*.005;
  const loud=rms>Math.max(.018,this.baseline*2.7);
  if(loud){this.lastLoud=positionMs;if(this.activeStart===null)this.activeStart=positionMs}
  else if(this.activeStart!==null&&this.lastLoud!==null&&positionMs-this.lastLoud>=180){
   if(this.lastLoud-this.activeStart>=80)this.segments.push({startMs:this.activeStart,endMs:this.lastLoud});
   this.activeStart=null;this.lastLoud=null;
  }return loud;
 }
 finish(positionMs:number){if(this.activeStart!==null&&this.lastLoud!==null&&this.lastLoud-this.activeStart>=80)this.segments.push({startMs:this.activeStart,endMs:Math.min(positionMs,this.lastLoud)});
 this.activeStart=null;this.lastLoud=null;return [...this.segments]}
 async stop(){this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.analyser=null;this.samples=null;if(this.context){await this.context.close().catch(()=>{});this.context=null}}
}
