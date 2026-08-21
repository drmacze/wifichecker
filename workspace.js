const UNIT_KEY='wifi-checker-speed-unit-v2';
const HISTORY_KEY='wifi-checker-pro-history-v2';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let gsap=null;
try{const mod=await import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm');gsap=mod.gsap||mod.default}catch(e){console.warn('[ui] GSAP fallback',e)}

const q=(s)=>document.querySelector(s);
const qa=(s)=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function simplifyCopy(){
  const small=q('.brand-copy small');if(small)small.textContent='SPEED TEST & NETWORK INFO';
  const kicker=q('.command-copy .kicker');if(kicker)kicker.innerHTML='<span></span> INTERNET SPEED TEST';
  const h1=q('.command-copy h1');if(h1)h1.innerHTML='Cek kecepatan internet.<em> Lihat operator & paket.</em>';
  const p=q('.command-copy p');if(p)p.textContent='Ukur download, upload, ping, lalu lihat operator ISP dan perkiraan paket Mbps berdasarkan hasil nyata.';
  const run=q('#runTestBtn');if(run){const b=run.querySelector('b');const s=run.querySelector('small');if(b)b.textContent='Mulai Tes';if(s)s.textContent='Download + upload + latency'}
  const quick=q('#quickCheckBtn span');if(quick)quick.textContent='Tes Cepat';
  const tabs=qa('[data-workspace-tab]');
  const names={network:'Info Jaringan',health:'Diagnostik',insights:'Riwayat'};
  tabs.forEach(btn=>{const span=btn.querySelector('span');if(span)span.textContent=names[btn.dataset.workspaceTab]||span.textContent});
}
simplifyCopy();

function activatePanel(name,animate=true){
  qa('[data-workspace-tab]').forEach(btn=>{const on=btn.dataset.workspaceTab===name;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',String(on))});
  qa('[data-workspace-panel]').forEach(panel=>{const on=panel.dataset.workspacePanel===name;panel.hidden=!on;panel.classList.toggle('active',on);if(on&&animate&&gsap&&!reduced)gsap.fromTo(panel,{autoAlpha:0,x:10},{autoAlpha:1,x:0,duration:.24,ease:'power2.out',clearProps:'transform,opacity,visibility'})});
}
qa('[data-workspace-tab]').forEach(btn=>btn.addEventListener('click',()=>activatePanel(btn.dataset.workspaceTab)));
activatePanel('network',false);

const unitSelect=q('#speedUnitSelect');
let unit=localStorage.getItem(UNIT_KEY)||'auto';
if(!['auto','gbps','mbps','kbps','MBps'].includes(unit))unit='auto';
unitSelect.value=unit;
function convertMbps(mbps,requested=unit){
  if(!Number.isFinite(mbps))return{value:NaN,unit:'Mbps',digits:1};
  let mode=requested;if(mode==='auto')mode=mbps>=1000?'gbps':mbps>=1?'mbps':'kbps';
  if(mode==='gbps')return{value:mbps/1000,unit:'Gbps',digits:mbps>=10000?1:2};
  if(mode==='kbps')return{value:mbps*1000,unit:'Kbps',digits:mbps<.1?1:0};
  if(mode==='MBps')return{value:mbps/8,unit:'MB/s',digits:2};
  return{value:mbps,unit:'Mbps',digits:mbps>=100?0:1};
}
function numText(v,d=1){return Number.isFinite(v)?v.toFixed(d):'—'}

let rawDownload=NaN,rawUpload=NaN,rawPing=NaN;
const sourceDown=q('#downloadValue'),sourceUp=q('#uploadValue'),sourcePing=q('#pingValue');
function readSources(){
  const d=parseFloat(sourceDown?.textContent),u=parseFloat(sourceUp?.textContent),p=parseFloat(sourcePing?.textContent);
  if(Number.isFinite(d))rawDownload=d;if(Number.isFinite(u))rawUpload=u;if(Number.isFinite(p))rawPing=p;
}

function polar(cx,cy,r,deg){const rad=deg*Math.PI/180;return{x:cx+r*Math.cos(rad),y:cy+r*Math.sin(rad)}}
function arcPath(cx,cy,r,start,end){const a=polar(cx,cy,r,start),b=polar(cx,cy,r,end);return`M ${a.x.toFixed(3)} ${a.y.toFixed(3)} A ${r} ${r} 0 1 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)}`}

let gauge={state:{angle:135,raw:0},kind:'idle',max:200,lastRaw:0};
function installGauge(){
  const card=q('.meter-card'),wrap=q('.dial-wrap'),legacy=q('#speedDial');if(!card||!wrap||!legacy)return;
  const bridge=document.createElement('div');bridge.className='meter-bridge';card.append(bridge);bridge.append(legacy);
  wrap.querySelectorAll('.radar-ring').forEach(el=>el.remove());
  const d=arcPath(160,160,118,135,405);
  const ticks=Array.from({length:25},(_,i)=>{const deg=135+(270*i/24),major=i%4===0;const o=polar(160,160,major?126:124,deg),inn=polar(160,160,major?111:116,deg);return`<line class="gauge-tick${major?' major':''}" x1="${inn.x}" y1="${inn.y}" x2="${o.x}" y2="${o.y}"/>`}).join('');
  wrap.innerHTML=`<div class="clean-gauge">
    <svg viewBox="0 0 320 320" aria-hidden="true">
      <defs><linearGradient id="gaugeGradient" x1="0" x2="1"><stop offset="0%" stop-color="#48cfff"/><stop offset="100%" stop-color="#8173ff"/></linearGradient></defs>
      <path class="gauge-track" d="${d}" pathLength="100"/>
      <path id="gaugeProgress" class="gauge-progress" d="${d}" pathLength="100"/>
      <g>${ticks}</g>
      <g id="gaugeNeedle" transform="rotate(135 160 160)"><line class="gauge-needle-line" x1="160" y1="160" x2="256" y2="160"/></g>
      <circle class="gauge-hub-outer" cx="160" cy="160" r="10"/><circle class="gauge-hub-inner" cx="160" cy="160" r="4"/>
    </svg>
    <div class="gauge-center"><span id="gaugeLabel">SPEED TEST</span><strong id="gaugeValue">0</strong><small id="gaugeUnit">Mbps</small></div>
    <div class="gauge-labels"><span class="g0">0</span><span id="gaugeMid" class="gmid">100</span><span id="gaugeMax" class="gmax">200 Mbps</span></div>
    <button id="meterGoBtn" class="meter-go" type="button"><strong>GO</strong><span>Mulai tes</span></button>
  </div>`;
  const readouts=document.createElement('div');readouts.className='meter-readouts';readouts.innerHTML=`
    <div><span><i data-lucide="timer"></i> Ping</span><b id="meterPing">— <small>ms</small></b></div>
    <div><span><i data-lucide="download"></i> Download</span><b id="meterDown">— <small>Mbps</small></b></div>
    <div><span><i data-lucide="upload"></i> Upload</span><b id="meterUp">— <small>Mbps</small></b></div>`;
  card.insertBefore(readouts,q('#scoreHint'));
  q('#meterGoBtn').addEventListener('click',()=>q('#runTestBtn')?.click());
  try{window.lucide?.createIcons({attrs:{'stroke-width':1.8}})}catch{}
}
installGauge();

function prettyScale(v,kind){
  const base=kind==='upload'?100:200;const wanted=Math.max(base,v*1.12);const tiers=[100,200,300,500,750,1000,1500,2000,2500,5000,10000];return tiers.find(x=>x>=wanted)||Math.ceil(wanted/5000)*5000;
}
function paintGaugeScale(max){
  const mid=convertMbps(max/2),full=convertMbps(max);q('#gaugeMid').textContent=String(Number(mid.value.toFixed(mid.digits)));q('#gaugeMax').textContent=`${Number(full.value.toFixed(full.digits))} ${full.unit}`;
}
function paintGaugeFrame(angle,raw,label){
  const needle=q('#gaugeNeedle'),progress=q('#gaugeProgress'),value=q('#gaugeValue'),unitEl=q('#gaugeUnit'),labelEl=q('#gaugeLabel');if(!needle||!progress)return;
  needle.setAttribute('transform',`rotate(${angle.toFixed(3)} 160 160)`);
  const ratio=clamp((angle-135)/270,0,1);progress.style.strokeDashoffset=String(100-ratio*100);
  const c=convertMbps(raw);value.textContent=Number.isFinite(c.value)?c.value.toFixed(c.digits):'0';unitEl.textContent=c.unit;labelEl.textContent=label;
}
function animateGauge(raw,kind='download',label){
  if(!Number.isFinite(raw))raw=0;
  if(kind!==gauge.kind){gauge.kind=kind;gauge.max=kind==='upload'?100:200;gauge.state.raw=0;gauge.state.angle=135}
  gauge.max=Math.max(gauge.max,prettyScale(raw,kind));gauge.lastRaw=raw;paintGaugeScale(gauge.max);
  const target=135+clamp(raw/gauge.max,0,1)*270;const text=label||(kind==='upload'?'UPLOAD':'DOWNLOAD');
  if(!gsap||reduced){gauge.state.angle=target;gauge.state.raw=raw;paintGaugeFrame(target,raw,text);return}
  gsap.killTweensOf(gauge.state);gsap.to(gauge.state,{angle:target,raw,duration:.8,ease:'power3.out',onUpdate:()=>paintGaugeFrame(gauge.state.angle,gauge.state.raw,text)});
}
function resetGauge(){gauge.kind='idle';gauge.max=200;gauge.lastRaw=0;paintGaugeScale(200);if(gsap&&!reduced)gsap.to(gauge.state,{angle:135,raw:0,duration:.45,ease:'power2.out',onUpdate:()=>paintGaugeFrame(gauge.state.angle,gauge.state.raw,'SPEED TEST')});else paintGaugeFrame(135,0,'SPEED TEST')}
resetGauge();

function syncReadouts(){
  readSources();const d=convertMbps(rawDownload),u=convertMbps(rawUpload);
  q('#meterPing').innerHTML=Number.isFinite(rawPing)?`${numText(rawPing,rawPing>=100?0:1)} <small>ms</small>`:'— <small>ms</small>';
  q('#meterDown').innerHTML=Number.isFinite(d.value)?`${d.value.toFixed(d.digits)} <small>${d.unit}</small>`:'— <small>Mbps</small>';
  q('#meterUp').innerHTML=Number.isFinite(u.value)?`${u.value.toFixed(u.digits)} <small>${u.unit}</small>`:'— <small>Mbps</small>';
}
[sourceDown,sourceUp,sourcePing].filter(Boolean).forEach(el=>new MutationObserver(()=>{syncReadouts();refreshProvider()}).observe(el,{childList:true,characterData:true,subtree:true}));
syncReadouts();

const legacyLabel=q('#dialLabel'),legacyValue=q('#dialValue');
function syncLegacyGauge(){
  const label=(legacyLabel?.textContent||'').toUpperCase(),raw=parseFloat(legacyValue?.textContent);
  if(!Number.isFinite(raw))return;
  if(label.includes('LIVE DOWNLOAD'))animateGauge(raw,'download','DOWNLOAD');
  else if(label.includes('LIVE UPLOAD'))animateGauge(raw,'upload','UPLOAD');
}
[legacyLabel,legacyValue].filter(Boolean).forEach(el=>new MutationObserver(syncLegacyGauge).observe(el,{childList:true,characterData:true,subtree:true}));

const engine=q('#engineState');
function syncEngine(){
  const state=(engine?.textContent||'').trim().toUpperCase(),go=q('#meterGoBtn');
  if(state==='RUNNING'){if(go)go.hidden=true;if(gauge.kind==='idle')resetGauge()}
  if(state==='COMPLETE'){if(go)go.hidden=true;readSources();if(Number.isFinite(rawDownload))animateGauge(rawDownload,'download','HASIL DOWNLOAD');refreshProvider()}
  if(['READY','CANCELLED','ERROR'].includes(state)){if(go)go.hidden=false;if(state!=='READY')resetGauge()}
}
if(engine)new MutationObserver(syncEngine).observe(engine,{childList:true,characterData:true,subtree:true});syncEngine();

unitSelect.addEventListener('change',()=>{unit=unitSelect.value;localStorage.setItem(UNIT_KEY,unit);syncReadouts();paintGaugeScale(gauge.max);paintGaugeFrame(gauge.state.angle,gauge.state.raw,q('#gaugeLabel')?.textContent||'SPEED TEST');refreshProvider()});

function historyDownloads(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]').map(x=>Number(x.download)).filter(v=>Number.isFinite(v)&&v>0)}catch{return[]}}
function estimatePlan(current){
  const obs=[current,...historyDownloads()].filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>b-a);if(!obs.length)return null;
  const best=obs[0],top=obs.slice(0,Math.min(3,obs.length)),representative=top.reduce((a,b)=>a+b,0)/top.length,target=Math.max(best,representative)/.92;
  const tiers=[10,15,20,25,30,40,50,75,100,150,200,250,300,500,750,1000,1500,2000,2500,5000];
  const tier=tiers.reduce((a,b)=>Math.abs(Math.log(b/target))<Math.abs(Math.log(a/target))?b:a,tiers[0]);const ratio=best/tier;
  let confidence='Rendah';if(obs.length>=2&&ratio>=.82&&ratio<=1.12)confidence='Tinggi';else if(ratio>=.65&&ratio<=1.2)confidence='Sedang';return{tier,best,count:obs.length,confidence};
}
function installProvider(){
  const grid=q('[data-workspace-panel="network"] .dock-card-grid');if(!grid||q('#providerProfile'))return;
  const card=document.createElement('article');card.id='providerProfile';card.className='panel dock-card provider-card';card.innerHTML=`
    <div class="provider-top"><div class="provider-name"><span>Operator / ISP</span><strong id="providerName">Belum terdeteksi</strong></div><span class="provider-icon"><i data-lucide="radio-tower"></i></span></div>
    <div class="plan-estimate"><div><span>Perkiraan paket</span><strong id="planEstimate">— Mbps</strong></div><span id="planConfidence" class="plan-confidence">Jalankan tes</span></div>
    <div class="provider-meta"><div><span>Best observed</span><b id="bestObserved">—</b></div><div><span>ASN</span><b id="providerAsn">—</b></div></div>
    <p id="planNote" class="provider-note">Paket Mbps adalah estimasi dari hasil tes, bukan data kontrak pelanggan ISP. Model router tidak dapat dibaca oleh browser biasa.</p>`;
  grid.prepend(card);
  qa('[data-workspace-panel="network"] .dock-card').forEach(c=>{const title=c.querySelector('h2')?.textContent||'';if(/Link detail|Browser & device/i.test(title))c.classList.add('optional-card')});
  const toggle=document.createElement('button');toggle.className='detail-toggle';toggle.type='button';toggle.textContent='Tampilkan detail teknis';toggle.addEventListener('click',()=>{const cards=qa('.optional-card');const show=!cards.some(c=>c.classList.contains('show'));cards.forEach(c=>c.classList.toggle('show',show));toggle.textContent=show?'Sembunyikan detail teknis':'Tampilkan detail teknis'});grid.append(toggle);
  try{window.lucide?.createIcons({attrs:{'stroke-width':1.8}})}catch{}
}
installProvider();
function refreshProvider(){
  if(!q('#providerProfile'))return;readSources();const isp=(q('#isp')?.textContent||'').trim(),asn=(q('#asn')?.textContent||'').trim();
  q('#providerName').textContent=isp&&!/Jalankan|Tidak tersedia|Gagal/i.test(isp)?isp:'Operator belum terdeteksi';q('#providerAsn').textContent=asn&&asn!=='—'?asn:'—';
  const est=estimatePlan(rawDownload);if(!est){q('#planEstimate').textContent='— Mbps';q('#planConfidence').textContent='Jalankan tes';q('#bestObserved').textContent='—';return}
  q('#planEstimate').textContent=`≈ ${est.tier} Mbps`;q('#planConfidence').textContent=`${est.confidence} · ${est.count} tes`;q('#bestObserved').textContent=`${est.best.toFixed(est.best>=100?0:1)} Mbps`;q('#planNote').textContent=`Kemungkinan paket sekitar ${est.tier} Mbps dari hasil terbaik ${est.best.toFixed(1)} Mbps. Ini estimasi; Wi‑Fi, VPN, congestion, dan kondisi ISP dapat menurunkan hasil.`;
}
['isp','asn'].forEach(id=>{const el=q('#'+id);if(el)new MutationObserver(refreshProvider).observe(el,{childList:true,characterData:true,subtree:true})});refreshProvider();

['runTestBtn','quickCheckBtn'].forEach(id=>q('#'+id)?.addEventListener('click',()=>activatePanel('network',false)));
