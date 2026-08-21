const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function waitForCore(){
  for(let i=0;i<200;i++){
    if(typeof window.downloadRequest==='function'&&typeof window.uploadRequest==='function'&&typeof window.latencyProbe==='function')return true;
    await sleep(25);
  }
  return false;
}

function median(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function mean(values){const a=values.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}
function percentile(values,p){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const idx=(a.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(idx-lo)}
function stdev(values){const a=values.filter(Number.isFinite);if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1))}
function qualityLabel(score){return score>=88?'Tinggi':score>=70?'Baik':score>=52?'Sedang':'Rendah'}
function phase(stage,message,detail={}){
  const stageEl=document.getElementById('testStage'),msgEl=document.getElementById('testMessage');
  if(stageEl)stageEl.textContent=stage;if(msgEl)msgEl.textContent=message;
  window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{stage,message,...detail}}));
}
function humanMB(bytes){return `${(bytes/1e6).toFixed(bytes>=100e6?0:1)} MB`}
function summarize(values,targetSamples,elapsedMs,retries,failures){
  const a=values.filter(Number.isFinite);const m=mean(a),sd=stdev(a),cv=Number.isFinite(m)&&m>0?sd/m:1;
  const stability=Math.round(clamp(100-cv*145,0,100));
  const sampleScore=clamp(a.length/Math.max(1,targetSamples),0,1);
  const durationScore=clamp(elapsedMs/3500,0,1);
  const retryPenalty=clamp((retries+failures)/Math.max(1,a.length+failures),0,1);
  const confidence=Math.round(clamp((stability*.52)+(sampleScore*100*.30)+(durationScore*100*.18)-(retryPenalty*20),0,100));
  return{count:a.length,median:median(a),mean:m,min:Math.min(...a),max:Math.max(...a),p10:percentile(a,.1),p90:percentile(a,.9),stdev:sd,cv,stability,confidence,confidenceLabel:qualityLabel(confidence),retries,failures,successRate:Math.round((a.length/Math.max(1,a.length+failures))*100),elapsedMs};
}

if(await waitForCore()){
  const session={version:3,startedAt:0,endedAt:0,status:'idle',phases:{},totalBytes:0,totalRetries:0,totalFailures:0};
  window.wifiMeasurementSession=session;

  const engine=document.getElementById('engineState');
  const resetSession=()=>{session.startedAt=performance.now();session.endedAt=0;session.status='running';session.phases={};session.totalBytes=0;session.totalRetries=0;session.totalFailures=0;window.dispatchEvent(new CustomEvent('wifi-measurement-reset'))};
  const finishSession=status=>{session.endedAt=performance.now();session.status=status;session.durationMs=session.startedAt?session.endedAt-session.startedAt:0;window.dispatchEvent(new CustomEvent('wifi-measurement-session',{detail:structuredClone(session)}))};
  if(engine)new MutationObserver(()=>{const s=engine.textContent.trim().toUpperCase();if(s==='RUNNING')resetSession();else if(s==='COMPLETE')finishSession('complete');else if(s==='CANCELLED')finishSession('cancelled');else if(s==='ERROR')finishSession('error')}).observe(engine,{childList:true,characterData:true,subtree:true});

  window.runLatency=async function(samples=12,onSample){
    const started=performance.now(),vals=[];let failures=0,retries=0;
    window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:'ping',status:'running'}}));
    for(let i=0;i<samples;i++){
      let value=NaN;
      for(let attempt=0;attempt<2;attempt++){
        try{value=await window.latencyProbe();break}catch(e){if(e.name==='AbortError')throw e;if(attempt===0){retries++;await sleep(90)}else failures++}
      }
      if(Number.isFinite(value))vals.push(value);
      onSample?.(i+1,samples,value);
      phase('Mengukur ping',Number.isFinite(value)?`${value.toFixed(1)} ms · sampel ${i+1}/${samples}`:`Sampel ${i+1}/${samples} gagal, lanjut…`,{phase:'ping',status:'sample',sample:i+1,targetSamples:samples,value,retries,failures});
      if(i+1<samples)await sleep(70);
    }
    if(vals.length<Math.max(3,Math.ceil(samples*.5)))throw new Error('Sampel latency tidak cukup.');
    const stable=vals.length>5?vals.slice(1):vals;
    const diffs=[];for(let i=1;i<stable.length;i++)diffs.push(Math.abs(stable[i]-stable[i-1]));
    const ping=median(stable),jitter=mean(diffs),elapsedMs=performance.now()-started;
    const stats=summarize(stable,samples,elapsedMs,retries,failures);stats.jitter=jitter;
    session.phases.ping={...stats,ping,jitter};session.totalRetries+=retries;session.totalFailures+=failures;
    phase('Ping selesai',`${ping.toFixed(1)} ms · jitter ${jitter.toFixed(1)} ms · confidence ${stats.confidence}%`,{phase:'ping',status:'result',value:ping,unit:'ms',stats});
    await sleep(samples>=10?900:450);
    return{ping,jitter,samples:stable,failed:failures,retries,stats};
  };

  async function requestWithRetry(request,bytes,maxRetries){
    let retries=0;
    while(true){
      try{return{point:await request(bytes),retries}}
      catch(e){if(e.name==='AbortError')throw e;if(retries>=maxRetries)throw e;retries++;await sleep(110*retries)}
    }
  }

  window.adaptiveBandwidth=async function(direction,onPoint,quick=false){
    const request=direction==='download'?window.downloadRequest:window.uploadRequest;
    const isDown=direction==='download';
    const targetSamples=quick?3:(isDown?7:6),maxSamples=quick?5:(isDown?10:9);
    const targetElapsed=quick?1800:(isDown?4800:4300);
    const minBytes=isDown?750_000:350_000,maxBytes=quick?(isDown?8_000_000:4_000_000):(isDown?30_000_000:16_000_000);
    const hardCap=quick?(isDown?32_000_000:16_000_000):(isDown?220_000_000:120_000_000);
    const points=[];let total=0,estimate=isDown?25:10,retries=0,failures=0;const started=performance.now();
    window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:direction,status:'running'}}));

    for(let i=0;i<maxSamples;i++){
      const elapsed=performance.now()-started;
      if(i>=targetSamples&&elapsed>=targetElapsed)break;
      if(total>=hardCap&&i>=Math.min(4,targetSamples))break;
      const targetSeconds=i===0?.45:.82;
      const bytes=Math.round(clamp(estimate*1e6/8*targetSeconds,minBytes,maxBytes));
      try{
        const r=await requestWithRetry(request,bytes,quick?1:2);retries+=r.retries;const p=r.point;points.push(p);total+=p.bytes;
        if(Number.isFinite(p.mbps))estimate=estimate*.34+p.mbps*.66;
        onPoint?.(p,i+1,targetSamples);
        const live=points.map(x=>x.mbps).filter(Number.isFinite);const liveMedian=median(live);
        phase(isDown?'Mengukur download':'Mengukur upload',`${p.mbps.toFixed(1)} Mbps · median ${liveMedian.toFixed(1)} · ${i+1}/${targetSamples} · ${humanMB(total)}`,{phase:direction,status:'sample',sample:i+1,targetSamples,value:p.mbps,runningMedian:liveMedian,bytes:total,retries,failures});
      }catch(e){if(e.name==='AbortError')throw e;failures++;phase(isDown?'Download retry':'Upload retry',`Sampel gagal setelah retry · melanjutkan pengukuran`,{phase:direction,status:'retry',sample:i+1,targetSamples,retries,failures});}
      if(i+1<targetSamples)await sleep(quick?80:130);
    }

    const usable=points.map(p=>p.mbps).filter(Number.isFinite);if(!usable.length)throw new Error(`${direction} gagal diukur.`);
    const stable=usable.length>=4?usable.slice(1):usable;
    const elapsedMs=performance.now()-started,stats=summarize(stable,targetSamples,elapsedMs,retries,failures);
    const chosen=stats.median;
    stats.bytes=total;stats.peak=stats.max;stats.low=stats.min;stats.spread=Math.max(0,stats.p90-stats.p10);
    session.phases[direction]={...stats,value:chosen};session.totalBytes+=total;session.totalRetries+=retries;session.totalFailures+=failures;
    phase(isDown?'Download selesai':'Upload selesai',`${chosen.toFixed(1)} Mbps · stability ${stats.stability}% · confidence ${stats.confidence}% · ${humanMB(total)}`,{phase:direction,status:'result',value:chosen,unit:'Mbps',samples:points.length,bytes:total,stats});
    await sleep(quick?500:1100);
    return{mbps:chosen,points,stats};
  };

  window.wifiCheckerEngineV3={version:3,realSampling:true,retries:true,robustMedian:true,session};
  window.dispatchEvent(new CustomEvent('wifi-engine-ready',{detail:{version:3}}));
}
