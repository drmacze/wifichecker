const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

async function waitForUI(){for(let i=0;i<180;i++){if(q('[data-workspace-panel="health"]')&&q('[data-workspace-panel="insights"]')&&q('.measurement-proof'))return true;await new Promise(r=>setTimeout(r,50))}return false}
function tone(score){return score>=82?'good':score>=58?'warn':'bad'}
function bufferDelta(){const m=(q('#bufferbloatDelta')?.textContent||'').match(/\+([\d.]+)/);return m?Number(m[1]):NaN}

function installIntegrityCard(){
  const panel=q('[data-workspace-panel="health"]');if(!panel||q('#integrityCard'))return;
  const card=document.createElement('article');card.id='integrityCard';card.className='panel dock-card advanced-card';card.innerHTML=`
    <div class="advanced-head"><div><span>TEST INTEGRITY</span><strong>Apakah hasil ini dapat dipercaya?</strong></div><span id="integrityBadge" class="advanced-badge">Menunggu tes</span></div>
    <div class="integrity-grid">
      <div><span>Engine</span><b id="integrityEngine">v4</b><small>multi-stream HTTP</small></div>
      <div><span>Max streams</span><b id="integrityStreams">—</b><small>parallel burst</small></div>
      <div><span>Outlier</span><b id="integrityOutliers">—</b><small>sampel dibuang</small></div>
      <div><span>Network changes</span><b id="integrityChanges">—</b><small>saat tes berjalan</small></div>
    </div>
    <div id="integrityFlags" class="integrity-flags"><span>Jalankan Full Test untuk audit kualitas pengukuran.</span></div>`;
  const measure=q('#measurementQualityCard');if(measure)measure.after(card);else panel.prepend(card);
}
function installBottleneckCard(){
  const panel=q('[data-workspace-panel="insights"]');if(!panel||q('#bottleneckCard'))return;
  const card=document.createElement('article');card.id='bottleneckCard';card.className='panel dock-card advanced-card';card.innerHTML=`
    <div class="advanced-head"><div><span>BOTTLENECK ANALYSIS</span><strong>Apa yang paling membatasi koneksi?</strong></div><span id="bottleneckBadge" class="advanced-badge">Menunggu tes</span></div>
    <div class="bottleneck-main"><span id="bottleneckIcon">◎</span><div><b id="bottleneckTitle">Belum dianalisis</b><p id="bottleneckText">Jalankan Full Test agar sistem membandingkan throughput, latency, jitter, loaded latency, stability, dan estimasi paket.</p></div></div>
    <div class="evidence-grid">
      <div><span>Speed efficiency</span><b id="efficiencyValue">—</b></div>
      <div><span>Latency health</span><b id="latencyHealth">—</b></div>
      <div><span>Load penalty</span><b id="loadPenalty">—</b></div>
      <div><span>Repeatability</span><b id="repeatabilityValue">—</b></div>
    </div>`;
  const use=q('#useCaseCard');if(use)use.after(card);else panel.prepend(card);
}
function installEnginePill(){
  const top=q('.instrument-top .meter-top-actions');if(!top||q('#engineVersionPill'))return;
  const pill=document.createElement('span');pill.id='engineVersionPill';pill.className='tiny-badge engine-pill';pill.textContent='ENGINE v4';top.prepend(pill);
}
function setFlag(text,kind='neutral'){const el=document.createElement('span');el.className=`integrity-flag ${kind}`;el.textContent=text;return el}
function integrityScore(s){
  const d=s?.phases?.download,u=s?.phases?.upload,p=s?.phases?.ping,i=s?.integrity||{};
  const conf=[d?.confidence,u?.confidence,p?.confidence].filter(Number.isFinite);let score=conf.length?conf.reduce((a,b)=>a+b,0)/conf.length:60;
  if(i.networkChanged)score-=18;if(i.visibilityInterrupted)score-=12;if(i.offlineDuringTest)score-=30;
  score-=Math.min(15,((d?.outliersDropped||0)+(u?.outliersDropped||0))*3);
  score-=Math.min(12,(s?.totalRetries||0)*2+(s?.totalFailures||0)*4);
  return Math.round(clamp(score,0,100));
}
function paintIntegrity(s){
  if(!s)return;const d=s.phases?.download||{},u=s.phases?.upload||{},i=s.integrity||{},score=integrityScore(s),badge=q('#integrityBadge');
  if(badge){badge.className=`advanced-badge ${tone(score)}`;badge.textContent=`${score}/100`}
  q('#integrityEngine').textContent=`v${s.version||4}`;q('#integrityStreams').textContent=String(Math.max(d.maxStreams||0,u.maxStreams||0)||'—');q('#integrityOutliers').textContent=String((d.outliersDropped||0)+(u.outliersDropped||0));q('#integrityChanges').textContent=String(i.changeEvents||0);
  const flags=q('#integrityFlags');if(!flags)return;flags.innerHTML='';
  flags.append(setFlag(i.networkChanged?'Jaringan berubah saat tes':'Jaringan stabil',i.networkChanged?'bad':'good'));
  flags.append(setFlag(i.visibilityInterrupted?'Tab sempat ditinggalkan':'Tab tetap aktif',i.visibilityInterrupted?'warn':'good'));
  flags.append(setFlag((s.totalRetries||0)>0?`${s.totalRetries} retry`:'Tanpa retry',(s.totalRetries||0)>0?'warn':'good'));
  flags.append(setFlag(((d.outliersDropped||0)+(u.outliersDropped||0))>0?'Outlier dibuang':'Sampel konsisten',((d.outliersDropped||0)+(u.outliersDropped||0))>0?'warn':'good'));
}
function parsePlan(){const m=(q('#planEstimate')?.textContent||'').match(/([\d.]+)/);return m?Number(m[1]):NaN}
function repeatability(s){const ds=s?.phases?.download?.stability,us=s?.phases?.upload?.stability;const vals=[ds,us].filter(Number.isFinite);return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):NaN}
function analyzeBottleneck(s){
  const down=Number(s?.phases?.download?.value),up=Number(s?.phases?.upload?.value),ping=Number(s?.phases?.ping?.ping),jitter=Number(s?.phases?.ping?.jitter),plan=parsePlan(),delta=bufferDelta(),repeat=repeatability(s);
  const efficiency=Number.isFinite(plan)&&plan>0?clamp(down/plan*100,0,150):NaN;
  const latencyScore=!Number.isFinite(ping)?NaN:Math.round(clamp(100-(Math.max(0,ping-20)*.8)-(Math.max(0,jitter-5)*1.7),0,100));
  const loadScore=!Number.isFinite(delta)?NaN:Math.round(clamp(100-delta*.8,0,100));
  let title='Koneksi seimbang',text='Tidak ada bottleneck dominan yang terlihat dari metrik browser.',kind='good';
  if(Number.isFinite(delta)&&delta>80){title='Bufferbloat / antrian router';text=`Latency naik sekitar ${Math.round(delta)} ms saat koneksi dibebani. Prioritaskan SQM/QoS atau kurangi upload/download bersamaan.`;kind='bad'}
  else if((Number.isFinite(ping)&&ping>90)||(Number.isFinite(jitter)&&jitter>25)){title='Latency dan jitter';text='Respons koneksi menjadi bottleneck utama. Ini lebih terasa pada gaming, voice, dan video call daripada sekadar angka Mbps.';kind='bad'}
  else if(Number.isFinite(efficiency)&&efficiency<55&&Number.isFinite(repeat)&&repeat>=65){title='Throughput di bawah perkiraan';text=`Download saat ini hanya sekitar ${Math.round(efficiency)}% dari estimasi tier. Karena hasil cukup stabil, cek congestion ISP, Wi‑Fi, VPN, atau perangkat lain.`;kind='warn'}
  else if(Number.isFinite(up)&&up<5&&Number.isFinite(down)&&down>=20){title='Upload menjadi batas';text='Download cukup, tetapi upload rendah dapat membatasi video call, live streaming, cloud backup, dan pengiriman file.';kind='warn'}
  else if(Number.isFinite(repeat)&&repeat<55){title='Koneksi tidak konsisten';text='Variasi antar burst cukup besar. Hasil puncak mungkin bagus, tetapi throughput sulit dipertahankan secara stabil.';kind='warn'}
  return{title,text,kind,efficiency,latencyScore,loadScore,repeat};
}
function paintBottleneck(s){
  const a=analyzeBottleneck(s),badge=q('#bottleneckBadge');if(badge){badge.className=`advanced-badge ${a.kind}`;badge.textContent=a.kind==='good'?'Sehat':a.kind==='warn'?'Perlu cek':'Bermasalah'}
  q('#bottleneckTitle').textContent=a.title;q('#bottleneckText').textContent=a.text;
  q('#efficiencyValue').textContent=Number.isFinite(a.efficiency)?`${Math.round(a.efficiency)}%`:'—';q('#latencyHealth').textContent=Number.isFinite(a.latencyScore)?`${a.latencyScore}/100`:'—';q('#loadPenalty').textContent=Number.isFinite(a.loadScore)?`${a.loadScore}/100`:'—';q('#repeatabilityValue').textContent=Number.isFinite(a.repeat)?`${a.repeat}%`:'—';
}

if(await waitForUI()){
  installIntegrityCard();installBottleneckCard();installEnginePill();try{window.lucide?.createIcons({attrs:{'stroke-width':1.8}})}catch{}
  window.addEventListener('wifi-engine-ready',e=>{const pill=q('#engineVersionPill');if(pill)pill.textContent=`ENGINE v${e.detail?.version||4}`});
  window.addEventListener('wifi-measurement-session',e=>{const s=e.detail||window.wifiMeasurementSession;if(s?.status!=='complete')return;paintIntegrity(s);setTimeout(()=>paintBottleneck(s),250)});
  const s=window.wifiMeasurementSession;if(s?.status==='complete'){paintIntegrity(s);paintBottleneck(s)}
}
