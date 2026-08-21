const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const HISTORY_KEY='wifi-checker-pro-history-v2';
let lastSession=null,testStartedAt=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function waitForUI(){for(let i=0;i<160;i++){if(q('.meter-readouts')&&q('[data-workspace-panel="health"]')&&q('[data-workspace-panel="insights"]'))return true;await sleep(50)}return false}
function mb(bytes){return `${((bytes||0)/1e6).toFixed(bytes>=100e6?0:1)} MB`}
function sec(ms){return `${((ms||0)/1000).toFixed(1)} s`}
function tone(score){return score>=85?'green':score>=65?'yellow':score>=45?'orange':'red'}
function overallConfidence(s){const vals=[s?.phases?.ping?.confidence,s?.phases?.download?.confidence,s?.phases?.upload?.confidence].filter(Number.isFinite);return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):NaN}
function overallStability(s){const vals=[s?.phases?.download?.stability,s?.phases?.upload?.stability].filter(Number.isFinite);return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):NaN}
function parseDelta(){const m=(q('#bufferbloatDelta')?.textContent||'').match(/\+([\d.]+)/);return m?Number(m[1]):NaN}
function history(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}

function installProof(){
  if(q('.measurement-proof'))return;
  const el=document.createElement('div');el.className='measurement-proof';el.innerHTML=`
    <div class="proof-cell" id="proofConfidence"><span>Confidence</span><b>—</b><small>kualitas sampel</small></div>
    <div class="proof-cell" id="proofStability"><span>Stability</span><b>—</b><small>variasi throughput</small></div>
    <div class="proof-cell" id="proofTraffic"><span>Traffic nyata</span><b>0 MB</b><small>download + upload</small></div>
    <div class="proof-cell" id="proofDuration"><span>Durasi</span><b>0.0 s</b><small>waktu pengukuran</small></div>`;
  const anchor=q('.quality-legend')||q('.meter-readouts');anchor?.after(el);
}
function installHealth(){
  const panel=q('[data-workspace-panel="health"]');if(!panel||q('#measurementQualityCard'))return;
  const card=document.createElement('article');card.id='measurementQualityCard';card.className='panel dock-card intel-summary-card';card.innerHTML=`
    <div class="intel-summary-head"><div><span>MEASUREMENT QUALITY</span><strong>Validasi hasil tes</strong></div><span id="measurementBadge" class="intel-badge">Belum diuji</span></div>
    <div class="measure-section-title">Download</div><div class="measure-grid">
      <div class="measure-stat"><span>Median</span><b id="iqDownMedian">—</b><small>hasil utama</small></div><div class="measure-stat"><span>Peak</span><b id="iqDownPeak">—</b><small>puncak sampel</small></div>
      <div class="measure-stat"><span>Stability</span><b id="iqDownStability">—</b><small>semakin tinggi lebih stabil</small></div><div class="measure-stat"><span>Samples</span><b id="iqDownSamples">—</b><small>sampel stabil</small></div></div>
    <div class="measure-section-title">Upload & reliability</div><div class="measure-grid">
      <div class="measure-stat"><span>Upload median</span><b id="iqUpMedian">—</b><small>hasil utama</small></div><div class="measure-stat"><span>Upload stability</span><b id="iqUpStability">—</b><small>variasi throughput</small></div>
      <div class="measure-stat"><span>Request success</span><b id="iqSuccess">—</b><small>bukan packet loss</small></div><div class="measure-stat"><span>Retry</span><b id="iqRetries">—</b><small>request yang diulang</small></div></div>
    <p class="measure-note">Request success menunjukkan keberhasilan request HTTP pengukuran. Browser biasa tidak dapat mengukur packet loss jaringan secara akurat tanpa infrastruktur WebRTC/TURN khusus.</p>`;
  panel.prepend(card);
}
function installUseCases(){
  const panel=q('[data-workspace-panel="insights"]');if(!panel||q('#useCaseCard'))return;
  const card=document.createElement('article');card.id='useCaseCard';card.className='panel dock-card intel-summary-card';card.innerHTML=`
    <div class="intel-summary-head"><div><span>CONNECTION PROFILE</span><strong>Cocok untuk apa?</strong></div><span id="profileBadge" class="intel-badge">Menunggu tes</span></div>
    <div class="usecase-grid">
      <div class="usecase" data-use="gaming"><span class="usecase-icon"><i data-lucide="gamepad-2"></i></span><span class="usecase-copy"><b>Gaming</b><small>ping + jitter + loaded latency</small></span><span class="usecase-status">—</span></div>
      <div class="usecase" data-use="call"><span class="usecase-icon"><i data-lucide="video"></i></span><span class="usecase-copy"><b>Video Call</b><small>upload + latency stability</small></span><span class="usecase-status">—</span></div>
      <div class="usecase" data-use="stream"><span class="usecase-icon"><i data-lucide="tv"></i></span><span class="usecase-copy"><b>4K Streaming</b><small>download + stability</small></span><span class="usecase-status">—</span></div>
      <div class="usecase" data-use="cloud"><span class="usecase-icon"><i data-lucide="cloud-upload"></i></span><span class="usecase-copy"><b>Cloud / Upload</b><small>upload throughput</small></span><span class="usecase-status">—</span></div>
    </div>
    <div class="trend-row"><div><span>Download vs lalu</span><b id="trendDown">—</b></div><div><span>Upload vs lalu</span><b id="trendUp">—</b></div><div><span>Ping vs lalu</span><b id="trendPing">—</b></div></div>`;
  panel.prepend(card);try{window.lucide?.createIcons({attrs:{'stroke-width':1.8}})}catch{}
}
function setProof(id,value,sub,score){const el=q(id);if(!el)return;el.querySelector('b').textContent=value;if(sub)el.querySelector('small').textContent=sub;el.dataset.tone=Number.isFinite(score)?tone(score):''}
function updateProof(s,live=false){
  const conf=overallConfidence(s),stable=overallStability(s);setProof('#proofConfidence',Number.isFinite(conf)?`${conf}%`:'Mengukur…',Number.isFinite(conf)?`${conf>=85?'tinggi':conf>=65?'baik':conf>=45?'sedang':'rendah'}`:'mengumpulkan sampel',conf);
  setProof('#proofStability',Number.isFinite(stable)?`${stable}%`:'—','variasi throughput',stable);
  setProof('#proofTraffic',mb(s?.totalBytes||0),'download + upload');
  const dur=s?.durationMs||(testStartedAt?performance.now()-testStartedAt:0);setProof('#proofDuration',sec(dur),live?'sedang berjalan':'waktu pengukuran');
  q('.measurement-proof')?.classList.toggle('measurement-live',live);
}
function setUse(name,state,label){const el=q(`[data-use="${name}"]`);if(!el)return;el.classList.remove('good','warn','bad');el.classList.add(state);el.querySelector('.usecase-status').textContent=label}
function evaluateUseCases(s){
  const ping=s?.phases?.ping?.ping??Number(q('#pingValue')?.textContent),jitter=s?.phases?.ping?.jitter??Number(q('#jitterValue')?.textContent),down=s?.phases?.download?.value??Number(q('#downloadValue')?.textContent),up=s?.phases?.upload?.value??Number(q('#uploadValue')?.textContent),ds=s?.phases?.download?.stability??0,us=s?.phases?.upload?.stability??0,delta=parseDelta();
  const gamingGood=ping<=40&&jitter<=10&&(!Number.isFinite(delta)||delta<=35),gamingWarn=ping<=85&&jitter<=22;
  setUse('gaming',gamingGood?'good':gamingWarn?'warn':'bad',gamingGood?'Siap':gamingWarn?'Cukup':'Kurang');
  const callGood=down>=8&&up>=5&&ping<=100&&jitter<=20,callWarn=down>=4&&up>=2&&ping<=160;
  setUse('call',callGood?'good':callWarn?'warn':'bad',callGood?'Siap':callWarn?'Cukup':'Kurang');
  const streamGood=down>=30&&ds>=65,streamWarn=down>=18;
  setUse('stream',streamGood?'good':streamWarn?'warn':'bad',streamGood?'Siap':streamWarn?'Cukup':'Kurang');
  const cloudGood=up>=15&&us>=60,cloudWarn=up>=5;
  setUse('cloud',cloudGood?'good':cloudWarn?'warn':'bad',cloudGood?'Siap':cloudWarn?'Cukup':'Kurang');
  const goodCount=qa('.usecase.good').length;const badge=q('#profileBadge');if(badge){badge.className='intel-badge '+(goodCount>=3?'good':goodCount>=2?'warn':'bad');badge.textContent=goodCount>=3?'Koneksi serbaguna':goodCount>=2?'Cukup baik':'Perlu perbaikan'}
}
function trendText(current,previous,lowerBetter=false){if(!Number.isFinite(current)||!Number.isFinite(previous)||previous===0)return{text:'—',cls:'trend-neutral'};const pct=((current-previous)/previous)*100;const better=lowerBetter?pct<0:pct>0;const near=Math.abs(pct)<3;return{text:`${pct>=0?'+':''}${pct.toFixed(0)}%`,cls:near?'trend-neutral':better?'trend-up':'trend-down'}}
function updateTrends(){const h=history();if(h.length<2)return;const cur=h[0],prev=h[1];[['#trendDown',cur.download,prev.download,false],['#trendUp',cur.upload,prev.upload,false],['#trendPing',cur.ping,prev.ping,true]].forEach(([sel,a,b,lower])=>{const el=q(sel),t=trendText(Number(a),Number(b),lower);if(el){el.textContent=t.text;el.className=t.cls}})}
function updateHealth(s){
  const d=s?.phases?.download,u=s?.phases?.upload,p=s?.phases?.ping;const conf=overallConfidence(s);const badge=q('#measurementBadge');if(badge){badge.className='intel-badge '+(conf>=85?'good':conf>=60?'warn':'bad');badge.textContent=Number.isFinite(conf)?`Confidence ${conf}%`:'Belum diuji'}
  q('#iqDownMedian').textContent=Number.isFinite(d?.median)?`${d.median.toFixed(1)} Mbps`:'—';q('#iqDownPeak').textContent=Number.isFinite(d?.peak)?`${d.peak.toFixed(1)} Mbps`:'—';q('#iqDownStability').textContent=Number.isFinite(d?.stability)?`${d.stability}%`:'—';q('#iqDownSamples').textContent=Number.isFinite(d?.count)?`${d.count} stabil`:'—';
  q('#iqUpMedian').textContent=Number.isFinite(u?.median)?`${u.median.toFixed(1)} Mbps`:'—';q('#iqUpStability').textContent=Number.isFinite(u?.stability)?`${u.stability}%`:'—';
  const counts=[d,u,p].filter(Boolean);const success=counts.length?Math.round(counts.reduce((a,x)=>a+(x.successRate||100),0)/counts.length):NaN;q('#iqSuccess').textContent=Number.isFinite(success)?`${success}%`:'—';q('#iqRetries').textContent=String(s?.totalRetries??'—');
}
function snapshotSession(){const s=window.wifiMeasurementSession;if(!s)return null;try{return JSON.parse(JSON.stringify(s))}catch{return s}}
function enrichExport(){
  const original=window.safeExport;if(typeof original!=='function'||original.__intelWrapped)return;
  const wrapped=function(){const data=original();if(data){const s=snapshotSession();data.measurementQuality=s?{engineVersion:s.version,durationMs:s.durationMs,totalBytes:s.totalBytes,totalRetries:s.totalRetries,totalFailures:s.totalFailures,phases:s.phases}:null}return data};wrapped.__intelWrapped=true;window.safeExport=wrapped;
}

if(await waitForUI()){
  installProof();installHealth();installUseCases();enrichExport();
  window.addEventListener('wifi-measurement-reset',()=>{testStartedAt=performance.now();lastSession=window.wifiMeasurementSession;updateProof(lastSession,true);const badge=q('#measurementBadge');if(badge){badge.className='intel-badge';badge.textContent='Mengukur…'}});
  window.addEventListener('wifi-test-phase',e=>{const d=e.detail||{};const s=window.wifiMeasurementSession;if(d.bytes&&s){const phase=s.phases?.[d.phase];if(!phase)s.totalBytes=Math.max(s.totalBytes||0,Number(d.bytes)||0)}updateProof(s,true)});
  window.addEventListener('wifi-measurement-session',e=>{lastSession=e.detail||snapshotSession();updateProof(lastSession,false);updateHealth(lastSession);evaluateUseCases(lastSession);setTimeout(updateTrends,120);enrichExport()});
  const engine=q('#engineState');if(engine)new MutationObserver(()=>{if(engine.textContent.trim().toUpperCase()==='COMPLETE'&&lastSession){updateHealth(lastSession);evaluateUseCases(lastSession);setTimeout(updateTrends,160)}}).observe(engine,{childList:true,characterData:true,subtree:true});
}
