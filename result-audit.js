const q=s=>document.querySelector(s);
const HISTORY_KEY='wifi-checker-pro-history-v2';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function waitForUI(){for(let i=0;i<200;i++){if(q('[data-workspace-panel="health"]')&&q('[data-workspace-panel="insights"]'))return true;await new Promise(r=>setTimeout(r,50))}return false}
function median(values){const a=values.filter(Number.isFinite).slice().sort((x,y)=>x-y);if(!a.length)return NaN;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function history(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}
function pct(v){return Number.isFinite(v)?`${Math.round(v)}%`:'—'}
function rangeText(p){return Number.isFinite(p?.ci90Low)&&Number.isFinite(p?.ci90High)?`${p.ci90Low.toFixed(1)}–${p.ci90High.toFixed(1)} Mbps`:'—'}
function relativeWidth(p){const v=Number(p?.value),lo=Number(p?.ci90Low),hi=Number(p?.ci90High);return Number.isFinite(v)&&v>0&&Number.isFinite(lo)&&Number.isFinite(hi)?(hi-lo)/v:NaN}

function installAudit(){
  const panel=q('[data-workspace-panel="health"]');if(!panel||q('#resultAuditCard'))return;
  const card=document.createElement('article');card.id='resultAuditCard';card.className='panel dock-card result-audit-card';card.innerHTML=`
    <div class="audit-head"><div><span>RESULT AUDIT</span><strong>Seberapa presisi hasil ini?</strong></div><span id="auditBadge" class="audit-badge">Menunggu tes</span></div>
    <div class="audit-grid">
      <div><span>Download range 90%</span><b id="auditDownRange">—</b><small>rentang statistik</small></div>
      <div><span>Upload range 90%</span><b id="auditUpRange">—</b><small>rentang statistik</small></div>
      <div><span>Convergence</span><b id="auditConvergence">—</b><small>download / upload</small></div>
      <div><span>Auto extend</span><b id="auditExtend">—</b><small>burst tambahan</small></div>
      <div><span>Warm-up</span><b id="auditWarmup">—</b><small>kalibrasi dibuang</small></div>
      <div><span>Cloudflare edge</span><b id="auditEdge">—</b><small>awal → akhir</small></div>
    </div>
    <div id="auditVerdict" class="audit-verdict"><b>Belum ada audit</b><p>Jalankan Full Test untuk mendapatkan convergence dan rentang hasil.</p></div>`;
  const integrity=q('#integrityCard'),measure=q('#measurementQualityCard');if(integrity)integrity.after(card);else if(measure)measure.after(card);else panel.prepend(card);
}
function installBaseline(){
  const panel=q('[data-workspace-panel="insights"]');if(!panel||q('#baselineCard'))return;
  const card=document.createElement('article');card.id='baselineCard';card.className='panel dock-card result-audit-card';card.innerHTML=`
    <div class="audit-head"><div><span>LOCAL BASELINE</span><strong>Dibanding tes sebelumnya</strong></div><span id="baselineBadge" class="audit-badge">Belum cukup data</span></div>
    <div class="baseline-grid">
      <div><span>Download baseline</span><b id="baseDown">—</b></div><div><span>Perubahan</span><b id="baseDownDelta">—</b></div>
      <div><span>Upload baseline</span><b id="baseUp">—</b></div><div><span>Ping baseline</span><b id="basePing">—</b></div>
    </div>
    <p id="baselineNote" class="baseline-note">Baseline memakai median riwayat lokal perangkat ini, bukan paket ISP.</p>`;
  const bottleneck=q('#bottleneckCard'),use=q('#useCaseCard');if(bottleneck)bottleneck.after(card);else if(use)use.after(card);else panel.prepend(card);
}
function auditScore(s){
  const d=s?.phases?.download||{},u=s?.phases?.upload||{},i=s?.integrity||{};let score=100;
  score-=Math.max(0,82-(d.convergence||0))*.25;score-=Math.max(0,82-(u.convergence||0))*.25;
  const dw=relativeWidth(d),uw=relativeWidth(u);if(Number.isFinite(dw))score-=Math.max(0,dw-.18)*45;if(Number.isFinite(uw))score-=Math.max(0,uw-.22)*35;
  if(d.contentionSuspected)score-=8;if(u.contentionSuspected)score-=8;if(i.networkChanged)score-=18;if(i.visibilityInterrupted)score-=12;if(s?.edge?.changed)score-=12;
  score-=Math.min(10,(d.outliersDropped||0)+(u.outliersDropped||0)*2);return Math.round(clamp(score,0,100));
}
function paintAudit(s){
  if(!s)return;const d=s.phases?.download||{},u=s.phases?.upload||{},score=auditScore(s),badge=q('#auditBadge');
  if(badge){badge.className='audit-badge '+(score>=85?'good':score>=65?'warn':'bad');badge.textContent=`${score}/100`}
  q('#auditDownRange').textContent=rangeText(d);q('#auditUpRange').textContent=rangeText(u);q('#auditConvergence').textContent=`${pct(d.convergence)} / ${pct(u.convergence)}`;q('#auditExtend').textContent=String((d.autoExtended||0)+(u.autoExtended||0));q('#auditWarmup').textContent=s.calibrationBytes>0?`${(s.calibrationBytes/1e6).toFixed(1)} MB`:'—';
  const start=s.edge?.start?.colo||'—',end=s.edge?.end?.colo||start;q('#auditEdge').textContent=`${start} → ${end}`;
  const verdict=q('#auditVerdict');if(!verdict)return;const flags=[];if(d.contentionSuspected||u.contentionSuspected)flags.push('throughput berfluktuasi seperti ada contention/cross-traffic');if(s.integrity?.networkChanged)flags.push('jaringan berubah saat tes');if(s.integrity?.visibilityInterrupted)flags.push('tab sempat background');if(s.edge?.changed)flags.push('edge berubah selama sesi');
  const wide=(Number.isFinite(relativeWidth(d))&&relativeWidth(d)>.38)||(Number.isFinite(relativeWidth(u))&&relativeWidth(u)>.45);
  if(score>=85&&!flags.length&&!wide){verdict.className='audit-verdict good';verdict.innerHTML='<b>Hasil terkonvergensi dengan baik</b><p>Rentang hasil cukup rapat dan tidak ada gangguan besar yang terdeteksi selama pengukuran.</p>'}
  else if(score>=65&&!wide){verdict.className='audit-verdict warn';verdict.innerHTML=`<b>Hasil dapat dipakai, tetapi ada catatan</b><p>${flags.length?flags.join(' · '):'Beberapa burst belum sepenuhnya konvergen.'}</p>`}
  else{verdict.className='audit-verdict bad';verdict.innerHTML=`<b>Sebaiknya ulangi Full Test</b><p>${flags.length?flags.join(' · '):'Rentang hasil terlalu lebar atau convergence masih rendah.'}</p>`}
}
function paintBaseline(s){
  const h=history(),prior=h.slice(1,6);if(!prior.length)return;const down=median(prior.map(x=>Number(x.download))),up=median(prior.map(x=>Number(x.upload))),ping=median(prior.map(x=>Number(x.ping))),curD=Number(s?.phases?.download?.value),curU=Number(s?.phases?.upload?.value),curP=Number(s?.phases?.ping?.ping);
  q('#baseDown').textContent=Number.isFinite(down)?`${down.toFixed(1)} Mbps`:'—';q('#baseUp').textContent=Number.isFinite(up)?`${up.toFixed(1)} Mbps`:'—';q('#basePing').textContent=Number.isFinite(ping)?`${ping.toFixed(1)} ms`:'—';
  const delta=Number.isFinite(curD)&&Number.isFinite(down)&&down>0?(curD-down)/down*100:NaN;q('#baseDownDelta').textContent=Number.isFinite(delta)?`${delta>=0?'+':''}${delta.toFixed(0)}%`:'—';
  const pingDelta=Number.isFinite(curP)&&Number.isFinite(ping)&&ping>0?(curP-ping)/ping*100:0,upDelta=Number.isFinite(curU)&&Number.isFinite(up)&&up>0?(curU-up)/up*100:0,badge=q('#baselineBadge'),note=q('#baselineNote');
  let state='good',label='Normal',text='Hasil masih dekat dengan baseline lokal perangkat ini.';if(Number.isFinite(delta)&&delta<-35){state='bad';label='Degradasi';text=`Download turun sekitar ${Math.abs(delta).toFixed(0)}% dari median ${prior.length} tes sebelumnya.`}else if(pingDelta>60){state='warn';label='Latency naik';text=`Ping naik sekitar ${pingDelta.toFixed(0)}% dibanding baseline lokal.`}else if(upDelta<-40){state='warn';label='Upload turun';text=`Upload turun sekitar ${Math.abs(upDelta).toFixed(0)}% dibanding baseline lokal.`}
  if(badge){badge.className=`audit-badge ${state}`;badge.textContent=label}if(note)note.textContent=text+' Baseline bukan paket ISP.';
}

if(await waitForUI()){
  installAudit();installBaseline();
  const paint=s=>{if(s?.status!=='complete')return;paintAudit(s);setTimeout(()=>paintBaseline(s),180)};
  window.addEventListener('wifi-measurement-session',e=>paint(e.detail||window.wifiMeasurementSession));window.addEventListener('wifi-measurement-audit',e=>paint(e.detail||window.wifiMeasurementSession));
  const s=window.wifiMeasurementSession;if(s?.status==='complete')paint(s);
}
