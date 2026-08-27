const q=s=>document.querySelector(s);
const HISTORY_KEY='wifi-checker-pro-history-v2';
const TIERS=[10,15,20,25,30,40,50,75,100,150,200,250,300,500,750,1000,1500,2000,2500,5000];

function median(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function historyDownloads(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]').map(x=>Number(x.download)).filter(v=>Number.isFinite(v)&&v>0).slice(0,8)}catch{return[]}}
function nearestTier(target,maxTier=Infinity){const allowed=TIERS.filter(t=>t<=maxTier);const list=allowed.length?allowed:[TIERS[0]];return list.reduce((a,b)=>Math.abs(Math.log(b/target))<Math.abs(Math.log(a/target))?b:a,list[0])}
function exactDownload(session=window.wifiMeasurementSession){const v=Number(session?.phases?.download?.value);return Number.isFinite(v)&&v>0?v:NaN}
function engineConfidence(session=window.wifiMeasurementSession){const v=Number(session?.phases?.download?.confidence);return Number.isFinite(v)?v:NaN}
function resultWidth(phase){const v=Number(phase?.value),lo=Number(phase?.ci90Low),hi=Number(phase?.ci90High);return Number.isFinite(v)&&v>0&&Number.isFinite(lo)&&Number.isFinite(hi)?(hi-lo)/v:NaN}
function integrityPenalty(session){
  const i=session?.integrity||{},d=session?.phases?.download||{};let p=0;
  if(i.networkChanged)p+=22;if(i.visibilityInterrupted)p+=12;if(i.offlineDuringTest)p+=35;if(session?.edge?.changed)p+=12;
  p+=Math.min(15,(session?.totalRetries||0)*2+(session?.totalFailures||0)*4);p+=Math.min(12,(d.outliersDropped||0)*4);
  if(Number.isFinite(d.convergence)&&d.convergence<70)p+=Math.min(16,(70-d.convergence)*.4);if(d.contentionSuspected)p+=10;
  const width=resultWidth(d);if(Number.isFinite(width)&&width>.30)p+=Math.min(18,(width-.30)*35);
  return Math.min(70,Math.round(p));
}

function estimateFromCurrent(current,session){
  if(!Number.isFinite(current)||current<=0)return null;
  const history=historyDownloads().filter(v=>Math.abs(v-current)>Math.max(.2,current*.015));
  const consistent=history.filter(v=>v/current>=.72&&v/current<=1.38).slice(0,4);
  const representative=median([current,current,...consistent]),target=representative/.92,hasConsensus=consistent.length>=2;
  const uncertainty=resultWidth(session?.phases?.download),uncertaintyCap=Number.isFinite(uncertainty)&&uncertainty>.35?1.30:hasConsensus?1.85:1.55;
  const cap=current*uncertaintyCap,tier=nearestTier(target,cap),ratio=current/tier,rawConfidence=engineConfidence(session),penalty=integrityPenalty(session),confidence=Number.isFinite(rawConfidence)?Math.max(0,rawConfidence-penalty):NaN;
  let label='Rendah';if(Number.isFinite(confidence)&&confidence>=84&&ratio>=.72&&ratio<=1.15&&consistent.length>=1)label='Tinggi';else if((!Number.isFinite(confidence)||confidence>=58)&&ratio>=.58&&ratio<=1.2)label='Sedang';
  const historyBest=historyDownloads().reduce((m,v)=>Math.max(m,v),current);return{tier,current,historyBest,consistent:consistent.length,confidence:label,engineConfidence:confidence,rawConfidence,penalty,uncertainty};
}
function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
function applyAccuracy(session=window.wifiMeasurementSession){
  if(session?.status!=='complete')return;const current=exactDownload(session);if(!Number.isFinite(current))return;const est=estimateFromCurrent(current,session);if(!est)return;
  const meta=q('#providerProfile .provider-meta'),bestLabel=q('#bestObserved')?.previousElementSibling;if(bestLabel)setText(bestLabel,'Tes saat ini');setText(q('#bestObserved'),`${current.toFixed(current>=100?0:1)} Mbps`);setText(q('#planEstimate'),`≈ ${est.tier} Mbps`);
  const confSuffix=Number.isFinite(est.engineConfidence)?` · measurement ${Math.round(est.engineConfidence)}%`:'';setText(q('#planConfidence'),`${est.confidence}${confSuffix}`);
  const historyPart=est.historyBest>current*1.15?` Best riwayat ${est.historyBest.toFixed(est.historyBest>=100?0:1)} Mbps disimpan hanya sebagai pembanding, bukan hasil tes sekarang.`:'';
  const integrityPart=est.penalty>0?` Confidence diturunkan ${est.penalty} poin karena uncertainty/integrity selama pengujian.`:'';
  const range=session?.phases?.download,rangePart=Number.isFinite(range?.ci90Low)&&Number.isFinite(range?.ci90High)?` Rentang statistik hasil ${range.ci90Low.toFixed(1)}–${range.ci90High.toFixed(1)} Mbps.`:'';
  setText(q('#planNote'),`Kecepatan Download tes ini ${current.toFixed(1)} Mbps. Perkiraan paket ≈${est.tier} Mbps memakai hasil saat ini sebagai acuan utama${est.consistent?` + ${est.consistent} riwayat yang konsisten`:''}.${rangePart}${historyPart}${integrityPart} Paket asli tetap hanya dapat dipastikan dari akun/kontrak ISP.`);
  if(meta)meta.dataset.accuracySource=`engine-v${session.version||5}`;
}
function scheduleApply(session){[0,180,720,1300].forEach(ms=>setTimeout(()=>applyAccuracy(session),ms))}
window.addEventListener('wifi-measurement-session',e=>scheduleApply(e.detail));window.addEventListener('wifi-measurement-audit',e=>scheduleApply(e.detail));window.addEventListener('wifi-engine-ready',()=>{const s=window.wifiMeasurementSession;if(s?.status==='complete')scheduleApply(s)});
let tries=0;const ready=setInterval(()=>{tries++;const s=window.wifiMeasurementSession;if(q('#providerProfile')&&s?.status==='complete'){clearInterval(ready);scheduleApply(s)}else if(tries>120)clearInterval(ready)},100);
