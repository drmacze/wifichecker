const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
const SPEED_BASE='https://speed.cloudflare.com';

async function waitForCore(){for(let i=0;i<240;i++){if(typeof window.downloadRequest==='function'&&typeof window.uploadRequest==='function'&&typeof window.latencyProbe==='function')return true;await sleep(25)}return false}
function median(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function mean(values){const a=values.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function percentile(values,p){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const idx=(a.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(idx-lo)}
function stdev(values){const a=values.filter(Number.isFinite);if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1))}
function mad(values){const m=median(values);return median(values.map(v=>Math.abs(v-m)))}
function qualityLabel(score){return score>=90?'Sangat tinggi':score>=78?'Tinggi':score>=62?'Baik':score>=48?'Sedang':'Rendah'}
function humanMB(bytes){return `${(bytes/1e6).toFixed(bytes>=100e6?0:1)} MB`}
function clone(v){try{return structuredClone(v)}catch{return JSON.parse(JSON.stringify(v))}}
function snapshotConnection(){return{online:navigator.onLine,type:connection?.type||null,effectiveType:connection?.effectiveType||null,downlink:Number.isFinite(connection?.downlink)?connection.downlink:null,rtt:Number.isFinite(connection?.rtt)?connection.rtt:null,saveData:typeof connection?.saveData==='boolean'?connection.saveData:null}}
function sameConnection(a,b){return a?.online===b?.online&&a?.type===b?.type&&a?.effectiveType===b?.effectiveType&&a?.saveData===b?.saveData}
function phase(stage,message,detail={}){const a=document.getElementById('testStage'),b=document.getElementById('testMessage');if(a)a.textContent=stage;if(b)b.textContent=message;window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{stage,message,...detail}}))}

async function readEdge(){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),2200);
  try{const r=await fetch(`${SPEED_BASE}/meta?r=${Date.now()}-${Math.random()}`,{cache:'no-store',signal:c.signal});if(!r.ok)return null;const m=await r.json();return{colo:m.colo||null,asn:m.asn||null,organization:m.asOrganization||m.asnOrganization||null,city:m.city||null,country:m.country||null}}catch{return null}finally{clearTimeout(t)}
}
function rejectOutliers(values){
  const a=values.filter(Number.isFinite);if(a.length<4)return{values:a,dropped:0,indexes:[]};
  const m=median(a),d=mad(a),limit=Math.max(d*3.25,Math.abs(m)*.16,.2),indexes=[];
  a.forEach((v,i)=>{if(Math.abs(v-m)>limit)indexes.push(i)});
  const kept=a.filter((_,i)=>!indexes.includes(i));
  return kept.length>=Math.ceil(a.length*.6)?{values:kept,dropped:indexes.length,indexes}:{values:a,dropped:0,indexes:[]};
}
function convergence(values){
  const a=rejectOutliers(values).values;if(a.length<3)return{score:0,spread:NaN,converged:false};
  const recent=a.slice(-Math.min(4,a.length)),m=median(recent),spread=Number.isFinite(m)&&m>0?(Math.max(...recent)-Math.min(...recent))/m:1;
  const score=Math.round(clamp(100-spread*220,0,100));return{score,spread,converged:score>=82};
}
function ci90(values){
  const a=rejectOutliers(values).values;if(!a.length)return{low:NaN,high:NaN,margin:NaN};
  const m=mean(a),sd=stdev(a),margin=a.length>1?1.645*sd/Math.sqrt(a.length):0;
  return{low:Math.max(0,m-margin),high:m+margin,margin};
}
function trendSlope(values){const a=values.filter(Number.isFinite);if(a.length<3)return 0;const n=a.length,xm=(n-1)/2,ym=mean(a);let num=0,den=0;for(let i=0;i<n;i++){num+=(i-xm)*(a[i]-ym);den+=(i-xm)**2}return den?num/den:0}
function contentionSignals(values){
  const a=rejectOutliers(values).values;if(a.length<4)return{suspected:false,oscillation:0,downwardDrift:false};
  const m=mean(a),cv=m>0?stdev(a)/m:1;let turns=0;for(let i=2;i<a.length;i++){const d1=a[i-1]-a[i-2],d2=a[i]-a[i-1];if(d1*d2<0)turns++}
  const oscillation=turns/Math.max(1,a.length-2),slope=trendSlope(a),downwardDrift=m>0&&slope/m<-.035;
  return{suspected:cv>.20||oscillation>.65||downwardDrift,oscillation,downwardDrift,cv};
}
function summarize(values,target,elapsedMs,retries,failures,extra={}){
  const warm=values.slice(),robust=rejectOutliers(warm),a=robust.values,m=mean(a),sd=stdev(a),cv=m>0?sd/m:1,conv=convergence(a),range=ci90(a),contention=contentionSignals(a);
  const stability=Math.round(clamp(100-cv*130,0,100)),sampleScore=clamp(a.length/Math.max(1,target),0,1),durationScore=clamp(elapsedMs/4800,0,1),retryPenalty=clamp((retries+failures)/Math.max(1,values.length+failures),0,1);
  const confidence=Math.round(clamp(stability*.38+conv.score*.22+sampleScore*100*.20+durationScore*100*.12+(100-retryPenalty*100)*.08-robust.dropped*2,0,100));
  const p50=median(a),p70=percentile(a,.70),sustained=Number.isFinite(p50)&&Number.isFinite(p70)?p50*.78+p70*.22:p50;
  return{count:a.length,rawCount:values.length,median:p50,sustained,mean:m,min:a.length?Math.min(...a):NaN,max:a.length?Math.max(...a):NaN,p10:percentile(a,.1),p70,p90:percentile(a,.9),stdev:sd,cv,stability,confidence,confidenceLabel:qualityLabel(confidence),retries,failures,successRate:Math.round(values.length/Math.max(1,values.length+failures)*100),elapsedMs,outliersDropped:robust.dropped,convergence:conv.score,converged:conv.converged,ci90Low:range.low,ci90High:range.high,ci90Margin:range.margin,contentionSuspected:contention.suspected,oscillation:contention.oscillation,downwardDrift:contention.downwardDrift,...extra};
}

function baseStreams(direction,estimate,quick){
  if(quick)return estimate>=100?2:1;
  if(direction==='download')return estimate>=300?5:estimate>=120?4:estimate>=35?3:2;
  return estimate>=180?4:estimate>=60?3:estimate>=15?2:1;
}
function adaptiveStreams(direction,estimate,quick,index,values){
  let streams=baseStreams(direction,estimate,quick),max=quick?2:(direction==='download'?6:4);
  if(!quick&&index>=2){const c=convergence(values);if(c.score<65)streams++;if(values.length>=2&&values.at(-1)>values.at(-2)*1.10)streams++}
  return Math.round(clamp(streams,1,max));
}
async function requestWithRetry(request,bytes,maxRetries){let retries=0;while(true){try{return{point:await request(bytes),retries}}catch(e){if(e.name==='AbortError')throw e;if(retries>=maxRetries)throw e;retries++;await sleep(90*retries)}}}
async function runBurst(direction,estimate,quick,maxRetries,streams){
  const request=direction==='download'?window.downloadRequest:window.uploadRequest,targetSeconds=quick?.58:.92;
  const totalTarget=clamp(estimate*1e6/8*targetSeconds,direction==='download'?850_000:420_000,quick?(direction==='download'?14_000_000:7_000_000):(direction==='download'?60_000_000:30_000_000));
  const perStream=Math.round(clamp(totalTarget/streams,direction==='download'?300_000:200_000,direction==='download'?18_000_000:9_000_000));
  const started=performance.now(),settled=await Promise.allSettled(Array.from({length:streams},()=>requestWithRetry(request,perStream,maxRetries))),elapsedMs=performance.now()-started;
  let bytes=0,retries=0,failures=0,successes=0;for(const item of settled){if(item.status==='fulfilled'){bytes+=Number(item.value.point.bytes)||perStream;retries+=item.value.retries;successes++}else{if(item.reason?.name==='AbortError')throw item.reason;failures++}}
  if(!successes)throw new Error(`${direction} burst gagal.`);return{mbps:bytes*8/(elapsedMs/1000)/1e6,bytes,seconds:elapsedMs/1000,streams,successes,retries,failures};
}

if(await waitForCore()){
  const session={version:5,method:'adaptive-convergent-multistream-http',startedAt:0,endedAt:0,status:'idle',phases:{},totalBytes:0,totalRetries:0,totalFailures:0,calibrationBytes:0,edge:{start:null,end:null,changed:false},integrity:{networkChanged:false,visibilityInterrupted:false,offlineDuringTest:false,connectionStart:null,connectionEnd:null,changeEvents:0,hiddenEvents:0}};
  window.wifiMeasurementSession=session;
  const engine=document.getElementById('engineState');
  const resetSession=()=>{session.version=5;session.method='adaptive-convergent-multistream-http';session.startedAt=performance.now();session.endedAt=0;session.durationMs=0;session.status='running';session.phases={};session.totalBytes=0;session.calibrationBytes=0;session.totalRetries=0;session.totalFailures=0;session.edge={start:null,end:null,changed:false};session.integrity={networkChanged:false,visibilityInterrupted:false,offlineDuringTest:false,connectionStart:snapshotConnection(),connectionEnd:null,changeEvents:0,hiddenEvents:0};readEdge().then(x=>{session.edge.start=x});window.dispatchEvent(new CustomEvent('wifi-measurement-reset',{detail:{version:5}}))};
  const finishSession=status=>{session.endedAt=performance.now();session.status=status;session.durationMs=session.startedAt?session.endedAt-session.startedAt:0;session.integrity.connectionEnd=snapshotConnection();if(!sameConnection(session.integrity.connectionStart,session.integrity.connectionEnd))session.integrity.networkChanged=true;window.dispatchEvent(new CustomEvent('wifi-measurement-session',{detail:clone(session)}));readEdge().then(x=>{session.edge.end=x;session.edge.changed=Boolean(session.edge.start?.colo&&x?.colo&&session.edge.start.colo!==x.colo);if(session.edge.changed)session.integrity.networkChanged=true;window.dispatchEvent(new CustomEvent('wifi-measurement-audit',{detail:clone(session)}))})};
  if(engine)new MutationObserver(()=>{const s=engine.textContent.trim().toUpperCase();if(s==='RUNNING')resetSession();else if(s==='COMPLETE')finishSession('complete');else if(s==='CANCELLED')finishSession('cancelled');else if(s==='ERROR')finishSession('error')}).observe(engine,{childList:true,characterData:true,subtree:true});
  connection?.addEventListener?.('change',()=>{if(session.status==='running'){session.integrity.changeEvents++;session.integrity.networkChanged=true}});document.addEventListener('visibilitychange',()=>{if(session.status==='running'&&document.visibilityState==='hidden'){session.integrity.hiddenEvents++;session.integrity.visibilityInterrupted=true}});addEventListener('offline',()=>{if(session.status==='running')session.integrity.offlineDuringTest=true});

  window.runLatency=async function(samples=12,onSample){
    const target=Math.max(samples,samples>=10?16:samples),started=performance.now(),vals=[];let failures=0,retries=0;window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:'ping',status:'running',engineVersion:5}}));
    for(let i=0;i<target;i++){let value=NaN;for(let attempt=0;attempt<2;attempt++){try{value=await window.latencyProbe();break}catch(e){if(e.name==='AbortError')throw e;if(attempt===0){retries++;await sleep(70)}else failures++}}if(Number.isFinite(value))vals.push(value);onSample?.(i+1,target,value);phase('Mengukur ping',Number.isFinite(value)?`${value.toFixed(1)} ms · ${i+1}/${target}`:`Sampel ${i+1}/${target} gagal`,{phase:'ping',status:'sample',sample:i+1,targetSamples:target,value,retries,failures});if(i+1<target)await sleep(55)}
    if(vals.length<Math.max(5,Math.ceil(target*.58)))throw new Error('Sampel latency tidak cukup.');const stable=vals.length>5?vals.slice(1):vals,diffs=[];for(let i=1;i<stable.length;i++)diffs.push(Math.abs(stable[i]-stable[i-1]));const ping=median(stable),jitter=mean(diffs),elapsedMs=performance.now()-started,stats=summarize(stable,target-1,elapsedMs,retries,failures,{jitter,p95:percentile(stable,.95),p99:percentile(stable,.99)});session.phases.ping={...stats,ping,jitter};session.totalRetries+=retries;session.totalFailures+=failures;phase('Ping selesai',`${ping.toFixed(1)} ms · jitter ${jitter.toFixed(1)} · P95 ${stats.p95.toFixed(1)} ms`,{phase:'ping',status:'result',value:ping,unit:'ms',stats});await sleep(target>=10?780:360);return{ping,jitter,samples:stable,failed:failures,retries,stats};
  };

  window.adaptiveBandwidth=async function(direction,onPoint,quick=false){
    const isDown=direction==='download',targetBursts=quick?3:(isDown?6:6),maxBursts=quick?5:(isDown?11:10),minElapsed=quick?1700:(isDown?4700:4300),hardCap=quick?(isDown?42_000_000:22_000_000):(isDown?260_000_000:145_000_000),points=[];let total=0,estimate=isDown?20:8,retries=0,failures=0,maxStreams=1,autoExtended=0,earlyStopped=false;const started=performance.now();
    window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:direction,status:'running',engineVersion:5}}));
    if(!quick){
      try{const streams=1,cal=await runBurst(direction,estimate,false,1,streams);estimate=Math.max(1,cal.mbps);session.calibrationBytes+=cal.bytes;total+=cal.bytes;phase(isDown?'Kalibrasi download':'Kalibrasi upload',`${cal.mbps.toFixed(1)} Mbps · warm-up tidak dihitung sebagai hasil`,{phase:direction,status:'calibration',value:cal.mbps,bytes:cal.bytes,streams});await sleep(90)}catch(e){if(e.name==='AbortError')throw e}
    }
    for(let i=0;i<maxBursts;i++){
      const elapsed=performance.now()-started,values=points.map(x=>x.mbps),conv=convergence(values),enough=i>=targetBursts&&elapsed>=minElapsed;
      if(enough&&conv.converged){earlyStopped=true;break}if(total>=hardCap&&i>=Math.min(4,targetBursts))break;if(i>=targetBursts&&!conv.converged)autoExtended++;
      const streams=adaptiveStreams(direction,estimate,quick,i,values);maxStreams=Math.max(maxStreams,streams);
      try{const p=await runBurst(direction,estimate,quick,quick?1:2,streams);points.push(p);total+=p.bytes;retries+=p.retries;failures+=p.failures;if(Number.isFinite(p.mbps))estimate=estimate*.28+p.mbps*.72;onPoint?.(p,i+1,targetBursts);const running=points.map(x=>x.mbps),r=rejectOutliers(running),liveMedian=median(r.values),c=convergence(r.values);phase(isDown?'Mengukur download':'Mengukur upload',`${p.mbps.toFixed(1)} Mbps · ${streams} stream · convergence ${c.score}% · ${humanMB(total)}`,{phase:direction,status:'sample',sample:i+1,targetSamples:targetBursts,value:p.mbps,runningMedian:liveMedian,bytes:total,streams,retries,failures,convergence:c.score,autoExtended})}catch(e){if(e.name==='AbortError')throw e;failures++;phase(isDown?'Download retry':'Upload retry','Burst gagal; engine melanjutkan pengukuran.',{phase:direction,status:'retry',sample:i+1,targetSamples:targetBursts,retries,failures})}if(i+1<targetBursts||autoExtended)await sleep(quick?65:100)
    }
    const usable=points.map(p=>p.mbps).filter(Number.isFinite);if(usable.length<2)throw new Error(`${direction} gagal mendapat sampel cukup.`);const elapsedMs=performance.now()-started,stats=summarize(usable,targetBursts,elapsedMs,retries,failures,{bytes:total,peak:Math.max(...usable),maxStreams,bursts:points.length,autoExtended,earlyStopped,warmupDiscarded:!quick,method:'adaptive-convergent-parallel-burst'}),chosen=stats.sustained;session.phases[direction]={...stats,value:chosen};session.totalBytes+=total;session.totalRetries+=retries;session.totalFailures+=failures;phase(isDown?'Download selesai':'Upload selesai',`${chosen.toFixed(1)} Mbps · convergence ${stats.convergence}% · range ${stats.ci90Low.toFixed(1)}–${stats.ci90High.toFixed(1)} Mbps`,{phase:direction,status:'result',value:chosen,unit:'Mbps',samples:points.length,bytes:total,stats});await sleep(quick?420:900);return{mbps:chosen,points,stats};
  };

  window.measureLoadedLatency=async function(direction,bandwidthMbps){const isDown=direction==='download',estimate=Math.max(1,bandwidthMbps||1),streams=baseStreams(direction,estimate,false),targetTotal=clamp(estimate*1e6/8*2.25,isDown?2_000_000:800_000,isDown?60_000_000:30_000_000),perStream=Math.round(targetTotal/streams);let done=false;const started=performance.now(),load=Promise.allSettled(Array.from({length:streams},()=>requestWithRetry(isDown?window.downloadRequest:window.uploadRequest,perStream,1))).finally(()=>{done=true}),probes=[];await sleep(80);while(!done&&probes.length<14){try{probes.push(await window.latencyProbe(3500))}catch(e){if(e.name==='AbortError')throw e}if(!done)await sleep(110)}await load;const value=probes.length?median(probes):NaN;session.phases[isDown?'loadedDownload':'loadedUpload']={value,samples:probes,p75:percentile(probes,.75),p95:percentile(probes,.95),streams,elapsedMs:performance.now()-started};return value};

  window.wifiCheckerEngineV5={version:5,realSampling:true,multiStream:true,warmupCalibration:true,adaptiveStreamRamping:true,robustOutlierRejection:true,convergenceControl:true,confidenceRange:true,contentionHeuristics:true,edgeConsistency:true,integrityMonitoring:true,session};
  window.dispatchEvent(new CustomEvent('wifi-engine-ready',{detail:{version:5,method:'adaptive-convergent-multistream-http'}}));
}
