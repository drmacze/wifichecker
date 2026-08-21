const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

function median(values){
  const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if(!a.length)return NaN;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function phase(stage,message,detail={}){
  const stageEl=document.getElementById('testStage');
  const msgEl=document.getElementById('testMessage');
  if(stageEl)stageEl.textContent=stage;
  if(msgEl)msgEl.textContent=message;
  window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{stage,message,...detail}}));
}
function humanMB(bytes){return `${(bytes/1e6).toFixed(bytes>=100e6?0:1)} MB`}

const originalLatency=window.runLatency;
if(typeof originalLatency==='function'){
  window.runLatency=async function(samples=12,onSample){
    window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:'ping',status:'running'}}));
    const result=await originalLatency(samples,onSample);
    phase('Ping selesai',`${result.ping.toFixed(1)} ms · jitter ${Number.isFinite(result.jitter)?result.jitter.toFixed(1):'—'} ms`,{phase:'ping',status:'result',value:result.ping,unit:'ms'});
    await sleep(samples>=10?850:450);
    return result;
  };
}

async function measuredBandwidth(direction,onPoint,quick=false){
  const request=direction==='download'?window.downloadRequest:window.uploadRequest;
  if(typeof request!=='function')throw new Error(`Engine ${direction} tidak tersedia.`);

  const isDown=direction==='download';
  const targetSamples=quick?3:(isDown?6:5);
  const maxSamples=quick?4:(isDown?8:7);
  const targetElapsed=quick?1500:(isDown?4200:3600);
  const minBytes=isDown?750_000:350_000;
  const maxBytes=quick?(isDown?8_000_000:4_000_000):(isDown?28_000_000:14_000_000);
  const hardCap=quick?(isDown?28_000_000:14_000_000):(isDown?190_000_000:90_000_000);
  const points=[];
  let total=0;
  let estimate=isDown?25:10;
  const started=performance.now();

  window.dispatchEvent(new CustomEvent('wifi-test-phase',{detail:{phase:direction,status:'running'}}));

  for(let i=0;i<maxSamples;i++){
    const elapsed=performance.now()-started;
    if(i>=targetSamples && elapsed>=targetElapsed)break;
    if(total>=hardCap && i>=Math.min(3,targetSamples))break;

    const targetSeconds=i===0?.45:.78;
    const adaptiveBytes=estimate*1e6/8*targetSeconds;
    const bytes=Math.round(clamp(adaptiveBytes,minBytes,maxBytes));
    const p=await request(bytes);
    points.push(p);
    total+=p.bytes;
    if(Number.isFinite(p.mbps))estimate=estimate*.38+p.mbps*.62;
    onPoint?.(p,i+1,targetSamples);

    phase(isDown?'Mengukur download':'Mengukur upload',`${p.mbps.toFixed(1)} Mbps · sampel ${i+1}/${targetSamples} · ${humanMB(total)} data nyata`,{phase:direction,status:'sample',sample:i+1,targetSamples,value:p.mbps,bytes:total});
    if(i+1<targetSamples)await sleep(quick?70:120);
  }

  const usable=points.map(p=>p.mbps).filter(Number.isFinite);
  if(!usable.length)throw new Error(`${direction} gagal diukur.`);
  const stable=usable.length>2?usable.slice(1):usable;
  const tail=stable.slice(-Math.min(4,stable.length));
  const chosen=median(tail);

  phase(isDown?'Download selesai':'Upload selesai',`${chosen.toFixed(1)} Mbps · ${points.length} sampel · ${humanMB(total)} ditransfer`,{phase:direction,status:'result',value:chosen,unit:'Mbps',samples:points.length,bytes:total});
  await sleep(quick?450:1050);
  return{mbps:chosen,points};
}

window.adaptiveBandwidth=measuredBandwidth;
window.wifiCheckerEngineV2={version:2,realSampling:true};
