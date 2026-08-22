const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;

async function waitForCore(){
  for(let i=0;i<240;i++){
    if(typeof window.downloadRequest==='function'&&typeof window.uploadRequest==='function'&&typeof window.latencyProbe==='function')return true;
    await sleep(25);
  }
  return false;
}

function median(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function mean(values){const a=values.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function percentile(values,p){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const idx=(a.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(idx-lo)}
function stdev(values){const a=values.filter(Number.isFinite);if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1))}
function mad(values){const m=median(values);return median(values.map(v=>Math.abs(v-m)))}
function qualityLabel(score){return score>=88?'Tinggi':score>=70?'Baik':score>=52?'Sedang':'Rendah'}
function humanMB(bytes){return `${(bytes/1e6).toFixed(bytes>=100e6?0:1)} MB`}
function snapshotConnection(){return{online:navigator.onLine,type:connection?.type||null,effectiveType:connection?.effectiveType||null,downlink:Number.isFinite(connection?.downlink)?connection.downlink:null,rtt:Number.isFinite(connection?.rtt)?connection.rtt:null,saveData:typeof connection?.saveData==='boolean'?connection.saveData:null}}
function sameConnection(a,b){return a?.online===b?.online&&a?.type===b?.type&&a?.effectiveType===b?.effectiveType&&a?.saveData===b?.saveData}
function clone(value){try{return structuredClone(value)}catch{return JSON.parse(JSON.stringify(value))}}
function phase(stage,message,detail={}){const stageEl=document.getElementById('testStage'),msgEl=document.getElementById('testMessage');if(stageEl)stageEl.textContent=stage;if(msgEl)msgEl.textContent=message;window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{stage,message,...detail}}))}

function rejectOutliers(values){
  const a=values.filter(Number.isFinite);if(a.length<4)return{values:a,dropped:0};
  const m=median(a),d=mad(a),floor=Math.max(Math.abs(m)*.18,.25);
  const limit=Math.max(d*3.5,floor);
  const kept=a.filter(v=>Math.abs(v-m)<=limit);
  return{values:kept.length>=Math.ceil(a.length*.6)?kept:a,dropped:a.length-(kept.length>=Math.ceil(a.length*.6)?kept.length:a.length)};
}
function summarize(values,targetSamples,elapsedMs,retries,failures,extra={}){
  const warm=values.length>=5?values.slice(1):values.slice();
  const robust=rejectOutliers(warm);const a=robust.values;
  const m=mean(a),sd=stdev(a),cv=Number.isFinite(m)&&m>0?sd/m:1;
  const stability=Math.round(clamp(100-cv*135,0,100));
  const sampleScore=clamp(a.length/Math.max(1,targetSamples-1),0,1);
  const durationScore=clamp(elapsedMs/4500,0,1);
  const retryPenalty=clamp((retries+failures)/Math.max(1,values.length+failures),0,1);
  const confidence=Math.round(clamp(stability*.48+sampleScore*100*.28+durationScore*100*.18+(100-retryPenalty*100)*.06-(robust.dropped*3),0,100));
  const p50=median(a),p75=percentile(a,.75);
  const sustained=Number.isFinite(p50)&&Number.isFinite(p75)?p50*.72+p75*.28:p50;
  return{count:a.length,rawCount:values.length,median:p50,sustained,mean:m,min:a.length?Math.min(...a):NaN,max:a.length?Math.max(...a):NaN,p10:percentile(a,.1),p75,p90:percentile(a,.9),stdev:sd,cv,stability,confidence,confidenceLabel:qualityLabel(confidence),retries,failures,successRate:Math.round((values.length/Math.max(1,values.length+failures))*100),elapsedMs,outliersDropped:robust.dropped,...extra};
}

function streamCount(direction,estimate,quick){
  if(quick)return estimate>=80?2:1;
  if(direction==='download')return estimate>=250?4:estimate>=70?3:2;
  return estimate>=120?3:estimate>=25?2:1;
}
async function requestWithRetry(request,bytes,maxRetries){
  let retries=0;
  while(true){
    try{return{point:await request(bytes),retries}}
    catch(e){if(e.name==='AbortError')throw e;if(retries>=maxRetries)throw e;retries++;await sleep(90*retries)}
  }
}
async function runBurst(direction,estimate,quick,maxRetries){
  const request=direction==='download'?window.downloadRequest:window.uploadRequest;
  const streams=streamCount(direction,estimate,quick);
  const targetSeconds=quick?.58:.9;
  const totalTarget=clamp(estimate*1e6/8*targetSeconds,direction==='download'?900_000:450_000,quick?(direction==='download'?12_000_000:6_000_000):(direction==='download'?48_000_000:24_000_000));
  const perStream=Math.round(clamp(totalTarget/streams,direction==='download'?350_000:220_000,direction==='download'?16_000_000:8_000_000));
  const started=performance.now();
  const settled=await Promise.allSettled(Array.from({length:streams},()=>requestWithRetry(request,perStream,maxRetries)));
  const elapsedMs=performance.now()-started;
  let bytes=0,retries=0,failures=0,successes=0;
  for(const item of settled){
    if(item.status==='fulfilled'){bytes+=Number(item.value.point.bytes)||perStream;retries+=item.value.retries;successes++}
    else{if(item.reason?.name==='AbortError')throw item.reason;failures++}
  }
  if(!successes)throw new Error(`${direction} burst gagal.`);
  const mbps=bytes*8/(elapsedMs/1000)/1e6;
  return{mbps,bytes,seconds:elapsedMs/1000,streams,successes,retries,failures};
}

if(await waitForCore()){
  const session={version:4,method:'multi-stream-http',startedAt:0,endedAt:0,status:'idle',phases:{},totalBytes:0,totalRetries:0,totalFailures:0,integrity:{networkChanged:false,visibilityInterrupted:false,offlineDuringTest:false,connectionStart:null,connectionEnd:null,changeEvents:0,hiddenEvents:0}};
  window.wifiMeasurementSession=session;

  const engine=document.getElementById('engineState');
  const resetSession=()=>{session.startedAt=performance.now();session.endedAt=0;session.durationMs=0;session.status='running';session.phases={};session.totalBytes=0;session.totalRetries=0;session.totalFailures=0;session.integrity={networkChanged:false,visibilityInterrupted:false,offlineDuringTest:false,connectionStart:snapshotConnection(),connectionEnd:null,changeEvents:0,hiddenEvents:0};window.dispatchEvent(new CustomEvent('wifi-measurement-reset',{detail:{version:4}}))};
  const finishSession=status=>{session.endedAt=performance.now();session.status=status;session.durationMs=session.startedAt?session.endedAt-session.startedAt:0;session.integrity.connectionEnd=snapshotConnection();if(!sameConnection(session.integrity.connectionStart,session.integrity.connectionEnd))session.integrity.networkChanged=true;window.dispatchEvent(new CustomEvent('wifi-measurement-session',{detail:clone(session)}))};
  if(engine)new MutationObserver(()=>{const s=engine.textContent.trim().toUpperCase();if(s==='RUNNING')resetSession();else if(s==='COMPLETE')finishSession('complete');else if(s==='CANCELLED')finishSession('cancelled');else if(s==='ERROR')finishSession('error')}).observe(engine,{childList:true,characterData:true,subtree:true});

  connection?.addEventListener?.('change',()=>{if(session.status!=='running')return;session.integrity.changeEvents++;session.integrity.networkChanged=true});
  document.addEventListener('visibilitychange',()=>{if(session.status!=='running'||document.visibilityState!=='hidden')return;session.integrity.hiddenEvents++;session.integrity.visibilityInterrupted=true});
  addEventListener('offline',()=>{if(session.status==='running')session.integrity.offlineDuringTest=true});

  window.runLatency=async function(samples=12,onSample){
    const target=Math.max(samples,samples>=10?14:samples),started=performance.now(),vals=[];let failures=0,retries=0;
    window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:'ping',status:'running'}}));
    for(let i=0;i<target;i++){
      let value=NaN;
      for(let attempt=0;attempt<2;attempt++){
        try{value=await window.latencyProbe();break}catch(e){if(e.name==='AbortError')throw e;if(attempt===0){retries++;await sleep(75)}else failures++}
      }
      if(Number.isFinite(value))vals.push(value);
      onSample?.(i+1,target,value);
      phase('Mengukur ping',Number.isFinite(value)?`${value.toFixed(1)} ms · sampel ${i+1}/${target}`:`Sampel ${i+1}/${target} gagal`,{phase:'ping',status:'sample',sample:i+1,targetSamples:target,value,retries,failures});
      if(i+1<target)await sleep(60);
    }
    if(vals.length<Math.max(4,Math.ceil(target*.55)))throw new Error('Sampel latency tidak cukup.');
    const stable=vals.length>5?vals.slice(1):vals,diffs=[];for(let i=1;i<stable.length;i++)diffs.push(Math.abs(stable[i]-stable[i-1]));
    const ping=median(stable),jitter=mean(diffs),elapsedMs=performance.now()-started,stats=summarize(stable,target,elapsedMs,retries,failures,{jitter,p95:percentile(stable,.95)});
    session.phases.ping={...stats,ping,jitter};session.totalRetries+=retries;session.totalFailures+=failures;
    phase('Ping selesai',`${ping.toFixed(1)} ms · jitter ${jitter.toFixed(1)} ms · P95 ${stats.p95.toFixed(1)} ms`,{phase:'ping',status:'result',value:ping,unit:'ms',stats});
    await sleep(target>=10?850:400);
    return{ping,jitter,samples:stable,failed:failures,retries,stats};
  };

  window.adaptiveBandwidth=async function(direction,onPoint,quick=false){
    const isDown=direction==='download';
    const targetBursts=quick?3:(isDown?7:6),maxBursts=quick?4:(isDown?9:8),targetElapsed=quick?1900:(isDown?5600:4900),hardCap=quick?(isDown?36_000_000:18_000_000):(isDown?240_000_000:130_000_000);
    const points=[];let total=0,estimate=isDown?25:10,retries=0,failures=0,maxStreams=1;const started=performance.now();
    window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:direction,status:'running',engineVersion:4}}));
    for(let i=0;i<maxBursts;i++){
      const elapsed=performance.now()-started;
      if(i>=targetBursts&&elapsed>=targetElapsed)break;
      if(total>=hardCap&&i>=Math.min(4,targetBursts))break;
      try{
        const p=await runBurst(direction,estimate,quick,quick?1:2);points.push(p);total+=p.bytes;retries+=p.retries;failures+=p.failures;maxStreams=Math.max(maxStreams,p.streams);
        if(Number.isFinite(p.mbps))estimate=estimate*.3+p.mbps*.7;
        onPoint?.(p,i+1,targetBursts);
        const running=points.map(x=>x.mbps);const robust=rejectOutliers(running.length>=4?running.slice(1):running);const liveMedian=median(robust.values);
        phase(isDown?'Mengukur download':'Mengukur upload',`${p.mbps.toFixed(1)} Mbps · ${p.streams} stream · median ${liveMedian.toFixed(1)} · ${humanMB(total)}`,{phase:direction,status:'sample',sample:i+1,targetSamples:targetBursts,value:p.mbps,runningMedian:liveMedian,bytes:total,streams:p.streams,retries,failures});
      }catch(e){if(e.name==='AbortError')throw e;failures++;phase(isDown?'Download retry':'Upload retry','Burst gagal, engine melanjutkan pengukuran…',{phase:direction,status:'retry',sample:i+1,targetSamples:targetBursts,retries,failures})}
      if(i+1<targetBursts)await sleep(quick?70:110);
    }
    const usable=points.map(p=>p.mbps).filter(Number.isFinite);if(usable.length<2)throw new Error(`${direction} gagal mendapat sampel cukup.`);
    const elapsedMs=performance.now()-started,stats=summarize(usable,targetBursts,elapsedMs,retries,failures,{bytes:total,peak:Math.max(...usable),maxStreams,bursts:points.length,method:'aggregate-parallel-burst'});
    const chosen=stats.sustained;
    session.phases[direction]={...stats,value:chosen};session.totalBytes+=total;session.totalRetries+=retries;session.totalFailures+=failures;
    phase(isDown?'Download selesai':'Upload selesai',`${chosen.toFixed(1)} Mbps · ${maxStreams} stream · stability ${stats.stability}% · confidence ${stats.confidence}%`,{phase:direction,status:'result',value:chosen,unit:'Mbps',samples:points.length,bytes:total,stats});
    await sleep(quick?450:950);
    return{mbps:chosen,points,stats};
  };

  window.measureLoadedLatency=async function(direction,bandwidthMbps){
    const isDown=direction==='download',estimate=Math.max(1,bandwidthMbps||1),streams=streamCount(direction,estimate,false),targetTotal=clamp(estimate*1e6/8*2.1,isDown?2_000_000:800_000,isDown?55_000_000:28_000_000),perStream=Math.round(targetTotal/streams);
    let done=false;const started=performance.now();
    const load=Promise.allSettled(Array.from({length:streams},()=>requestWithRetry(isDown?window.downloadRequest:window.uploadRequest,perStream,1))).finally(()=>{done=true});
    const probes=[];await sleep(90);
    while(!done&&probes.length<12){try{probes.push(await window.latencyProbe(3500))}catch(e){if(e.name==='AbortError')throw e}if(!done)await sleep(120)}
    await load;
    const value=probes.length?median(probes):NaN;
    session.phases[isDown?'loadedDownload':'loadedUpload']={value,samples:probes,p95:percentile(probes,.95),streams,elapsedMs:performance.now()-started};
    return value;
  };

  window.wifiCheckerEngineV4={version:4,realSampling:true,multiStream:true,robustOutlierRejection:true,integrityMonitoring:true,session};
  window.dispatchEvent(new CustomEvent('wifi-engine-ready',{detail:{version:4,method:'multi-stream-http'}}));
}
