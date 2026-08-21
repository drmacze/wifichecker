const UNIT_KEY='wifi-checker-speed-unit-v1';
const HISTORY_KEY='wifi-checker-pro-history-v2';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let gsap=null;
try{const mod=await import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm');gsap=mod.gsap||mod.default}catch(e){console.warn('[workspace] GSAP fallback',e)}

const q=(s)=>document.querySelector(s);
const qa=(s)=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const meterStyle=document.createElement('style');
meterStyle.textContent=`
@property --meter{syntax:'<angle>';inherits:false;initial-value:0deg}
@property --needle{syntax:'<angle>';inherits:false;initial-value:0deg}
.speed-dial{transition:--meter .92s cubic-bezier(.16,1,.3,1),--needle .92s cubic-bezier(.16,1,.3,1)!important}
`;
document.head.append(meterStyle);

function activatePanel(name,animate=true){
  const tabs=qa('[data-workspace-tab]');
  const panels=qa('[data-workspace-panel]');
  tabs.forEach(btn=>{const on=btn.dataset.workspaceTab===name;btn.classList.toggle('active',on);btn.setAttribute('aria-selected',String(on))});
  panels.forEach(panel=>{
    const on=panel.dataset.workspacePanel===name;
    panel.hidden=!on;panel.classList.toggle('active',on);
    if(on&&animate&&gsap&&!reduced){gsap.fromTo(panel,{autoAlpha:0,x:16},{autoAlpha:1,x:0,duration:.36,ease:'power3.out',clearProps:'transform,opacity,visibility'})}
  });
}
qa('[data-workspace-tab]').forEach(btn=>btn.addEventListener('click',()=>activatePanel(btn.dataset.workspaceTab)));

const unitSelect=q('#speedUnitSelect');
const downloadSource=q('#downloadValue');
const uploadSource=q('#uploadValue');
const downloadDisplay=q('#downloadDisplay');
const uploadDisplay=q('#uploadDisplay');
const downloadUnit=q('#downloadUnit');
const uploadUnit=q('#uploadUnit');
const meterScaleMid=q('#meterScaleMid');
const meterScaleMax=q('#meterScaleMax');
let unit=localStorage.getItem(UNIT_KEY)||'auto';
if(!['auto','gbps','mbps','kbps','MBps'].includes(unit))unit='auto';
unitSelect.value=unit;
let rawDownload=NaN,rawUpload=NaN,lastLiveRaw=NaN;

function convertMbps(mbps,requested=unit){
  if(!Number.isFinite(mbps))return{value:NaN,unit:requested==='auto'?'Mbps':requested==='MBps'?'MB/s':requested==='gbps'?'Gbps':requested==='kbps'?'Kbps':'Mbps',digits:1};
  let mode=requested;
  if(mode==='auto')mode=mbps>=1000?'gbps':mbps>=1?'mbps':'kbps';
  if(mode==='gbps')return{value:mbps/1000,unit:'Gbps',digits:mbps>=10000?1:2};
  if(mode==='kbps')return{value:mbps*1000,unit:'Kbps',digits:mbps<.1?1:0};
  if(mode==='MBps')return{value:mbps/8,unit:'MB/s',digits:2};
  return{value:mbps,unit:'Mbps',digits:mbps>=100?0:1};
}
function paintBandwidth(source,display,unitEl){
  const raw=parseFloat(source.textContent);
  if(Number.isFinite(raw)){if(source===downloadSource)rawDownload=raw;else rawUpload=raw}
  const base=source===downloadSource?rawDownload:rawUpload;
  const c=convertMbps(base);
  display.textContent=Number.isFinite(c.value)?c.value.toFixed(c.digits):'—';
  unitEl.textContent=c.unit;
}
function repaintBandwidth(){paintBandwidth(downloadSource,downloadDisplay,downloadUnit);paintBandwidth(uploadSource,uploadDisplay,uploadUnit)}
new MutationObserver(()=>{paintBandwidth(downloadSource,downloadDisplay,downloadUnit);refreshProviderProfile()}).observe(downloadSource,{childList:true,characterData:true,subtree:true});
new MutationObserver(()=>paintBandwidth(uploadSource,uploadDisplay,uploadUnit)).observe(uploadSource,{childList:true,characterData:true,subtree:true});

function prettyScale(mbps){
  const thresholds=[1,2.5,5,10,20,30,50,75,100,150,200,250,300,500,750,1000,1500,2000,2500,5000,10000,25000];
  const wanted=Math.max(1,mbps*1.12);
  return thresholds.find(v=>v>=wanted)||Math.ceil(wanted/10000)*10000;
}
let meterState={deg:0,value:0};
let lastMeter={value:NaN,label:'NETWORK SCORE',max:100,isBandwidth:false};
function setScale(max,isBandwidth){
  if(!isBandwidth){meterScaleMid.textContent='50';meterScaleMax.textContent='100';return}
  const half=convertMbps(max/2),full=convertMbps(max);
  meterScaleMid.textContent=String(Number(half.value.toFixed(half.digits)));
  meterScaleMax.textContent=`${Number(full.value.toFixed(full.digits))} ${full.unit}`;
}
function smoothDial(value,label='NETWORK SCORE',incomingUnit='/ 100',incomingMax=100){
  const isBandwidth=/DOWNLOAD|UPLOAD|THROUGHPUT/i.test(label);
  const finite=Number.isFinite(value);
  const raw=finite?value:0;
  const baseline=isBandwidth?Math.max(Number(incomingMax)||0,/UPLOAD/i.test(label)?100:200):Math.max(1,incomingMax||100);
  const max=isBandwidth?Math.max(baseline,prettyScale(Math.max(raw,1))):baseline;
  const targetDeg=clamp(raw/max,0,1)*290;
  lastMeter={value:finite?value:NaN,label,max,isBandwidth};
  setScale(max,isBandwidth);
  const dial=q('#speedDial'),valueEl=q('#dialValue'),unitEl=q('#dialUnit'),labelEl=q('#dialLabel');
  labelEl.textContent=label;
  const converted=isBandwidth?convertMbps(raw):{value:raw,unit:incomingUnit,digits:raw>=100?0:1};
  unitEl.textContent=isBandwidth?converted.unit:incomingUnit;
  if(!finite)valueEl.textContent='—';
  if(reduced||!gsap){
    meterState.deg=targetDeg;meterState.value=converted.value;
    dial.style.setProperty('--meter',`${targetDeg}deg`);dial.style.setProperty('--needle',`${targetDeg}deg`);
    if(finite)valueEl.textContent=converted.value.toFixed(converted.digits);
    return;
  }
  gsap.killTweensOf(meterState);
  gsap.to(meterState,{deg:targetDeg,value:converted.value,duration:.92,ease:'expo.out',onUpdate:()=>{
    dial.style.setProperty('--meter',`${meterState.deg}deg`);
    dial.style.setProperty('--needle',`${meterState.deg}deg`);
    if(finite)valueEl.textContent=meterState.value.toFixed(converted.digits);
  }});
}

function rerenderLiveMeter(){if(lastMeter.isBandwidth)smoothDial(lastMeter.value,lastMeter.label,'Mbps',lastMeter.max)}
unitSelect.addEventListener('change',()=>{
  unit=unitSelect.value;
  localStorage.setItem(UNIT_KEY,unit);
  repaintBandwidth();
  if(Number.isFinite(lastLiveRaw)&&/LIVE|RESULT/i.test(q('#dialLabel').textContent))smoothDial(lastLiveRaw,q('#dialLabel').textContent,'Mbps',prettyScale(lastLiveRaw));
  else rerenderLiveMeter();
  rewriteStatusUnit();
});
repaintBandwidth();

const testMessage=q('#testMessage');
function rewriteStatusUnit(){
  const text=testMessage.textContent;
  const next=text.replace(/(\d+(?:\.\d+)?)\sMbps\b/g,(_,n)=>{const c=convertMbps(Number(n));return`${Number(c.value.toFixed(c.digits))} ${c.unit}`});
  if(next!==text)testMessage.textContent=next;
}
new MutationObserver(rewriteStatusUnit).observe(testMessage,{childList:true,characterData:true,subtree:true});

function installOoklaStyleReadout(){
  const dial=q('#speedDial');
  const card=q('.meter-card');
  if(!dial||!card||q('#meterGoBtn'))return;
  const go=document.createElement('button');
  go.id='meterGoBtn';go.type='button';go.className='meter-go';go.innerHTML='<strong>GO</strong><span>Start test</span>';
  go.addEventListener('click',()=>q('#runTestBtn')?.click());
  dial.append(go);

  const triplet=document.createElement('div');
  triplet.className='speed-triplet';
  triplet.innerHTML=`
    <div><span><i data-lucide="timer"></i> Ping</span><b id="meterPing">— <small>ms</small></b></div>
    <div><span><i data-lucide="download"></i> Download</span><b id="meterDown">— <small>Mbps</small></b></div>
    <div><span><i data-lucide="upload"></i> Upload</span><b id="meterUp">— <small>Mbps</small></b></div>`;
  card.insertBefore(triplet,q('#scoreHint'));
  try{window.lucide?.createIcons({attrs:{'stroke-width':1.7}})}catch{}

  const sync=()=>{
    const ping=parseFloat(q('#pingValue')?.textContent);const down=rawDownload;const up=rawUpload;
    const d=convertMbps(down),u=convertMbps(up);
    q('#meterPing').innerHTML=Number.isFinite(ping)?`${ping.toFixed(ping>=100?0:1)} <small>ms</small>`:'— <small>ms</small>';
    q('#meterDown').innerHTML=Number.isFinite(d.value)?`${d.value.toFixed(d.digits)} <small>${d.unit}</small>`:'— <small>Mbps</small>';
    q('#meterUp').innerHTML=Number.isFinite(u.value)?`${u.value.toFixed(u.digits)} <small>${u.unit}</small>`:'— <small>Mbps</small>';
  };
  ['pingValue','downloadValue','uploadValue'].forEach(id=>{const el=q('#'+id);if(el)new MutationObserver(sync).observe(el,{childList:true,characterData:true,subtree:true})});
  sync();
}

function installProviderProfile(){
  const grid=q('[data-workspace-panel="network"] .dock-card-grid');
  if(!grid||q('#providerProfile'))return;
  const card=document.createElement('article');
  card.id='providerProfile';card.className='panel dock-card provider-card';
  card.innerHTML=`
    <div class="provider-head"><div><span class="overline">ISP / SUBSCRIPTION</span><h2 id="providerName">Menunggu data operator</h2></div><span class="provider-mark"><i data-lucide="radio-tower"></i></span></div>
    <div class="plan-hero"><span>PERKIRAAN PAKET</span><strong id="planEstimate">— Mbps</strong><small id="planConfidence">Jalankan Full Test</small></div>
    <div class="provider-stats">
      <div><span>ASN / operator</span><b id="providerAsn">—</b></div>
      <div><span>Best observed</span><b id="bestObserved">— Mbps</b></div>
      <div><span>Link API max</span><b id="linkCeiling">Tidak tersedia</b></div>
      <div><span>Router operator</span><b id="routerInfo">Tidak diekspos browser</b></div>
    </div>
    <p class="plan-note" id="planNote">Nama ISP berasal dari jaringan publik. Paket Mbps adalah estimasi dari throughput terbaik, bukan data kontrak pelanggan.</p>`;
  grid.prepend(card);
  try{window.lucide?.createIcons({attrs:{'stroke-width':1.7}})}catch{}
  refreshProviderProfile();
}

function readHistoryDownloads(){
  try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]').map(x=>Number(x.download)).filter(v=>Number.isFinite(v)&&v>0)}catch{return[]}
}
function estimatePlanTier(current){
  const observations=[current,...readHistoryDownloads()].filter(v=>Number.isFinite(v)&&v>0).sort((a,b)=>b-a);
  if(!observations.length)return null;
  const best=observations[0];
  const top=observations.slice(0,Math.min(3,observations.length));
  const representative=top.reduce((a,b)=>a+b,0)/top.length;
  const normalized=Math.max(best,representative)/.93;
  const tiers=[10,15,20,25,30,40,50,75,100,150,200,250,300,500,750,1000,1500,2000,2500,5000];
  const tier=tiers.reduce((bestTier,t)=>Math.abs(Math.log(t/normalized))<Math.abs(Math.log(bestTier/normalized))?t:bestTier,tiers[0]);
  const ratio=best/tier;
  const samples=observations.length;
  let confidence='Rendah';
  if(ratio>=.84&&ratio<=1.16&&samples>=2)confidence='Tinggi';
  else if(ratio>=.68&&ratio<=1.22)confidence='Sedang';
  return{tier,best,samples,confidence,ratio};
}
function refreshProviderProfile(){
  if(!q('#providerProfile'))return;
  const isp=(q('#isp')?.textContent||'').trim();
  const asn=(q('#asn')?.textContent||'').trim();
  q('#providerName').textContent=isp&& !/Jalankan|Tidak tersedia/i.test(isp)?isp:'Operator belum terdeteksi';
  q('#providerAsn').textContent=asn&&asn!=='—'?asn:'—';
  const link=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  q('#linkCeiling').textContent=Number.isFinite(link?.downlinkMax)?`${link.downlinkMax} Mbps (teknologi)`:'Tidak tersedia';
  const est=estimatePlanTier(rawDownload);
  if(!est){q('#planEstimate').textContent='— Mbps';q('#planConfidence').textContent='Jalankan Full Test';q('#bestObserved').textContent='— Mbps';return}
  q('#planEstimate').textContent=`≈ ${est.tier} Mbps`;
  q('#planConfidence').textContent=`Confidence ${est.confidence} · ${est.samples} hasil`;
  q('#bestObserved').textContent=`${est.best.toFixed(est.best>=100?0:1)} Mbps`;
  q('#planNote').textContent=`Estimasi paket mendekati ${est.tier} Mbps berdasarkan throughput terbaik ${est.best.toFixed(1)} Mbps. Wi‑Fi, congestion, VPN, dan kondisi ISP bisa membuat hasil lebih rendah dari paket sebenarnya.`;
}

function syncProviderSources(){
  ['isp','asn'].forEach(id=>{const el=q('#'+id);if(el)new MutationObserver(refreshProviderProfile).observe(el,{childList:true,characterData:true,subtree:true})});
  const link=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  link?.addEventListener?.('change',refreshProviderProfile);
}

function syncOoklaMeter(){
  const label=q('#dialLabel'),value=q('#dialValue'),dialUnit=q('#dialUnit'),engine=q('#engineState'),go=q('#meterGoBtn');
  let lastEngine=engine.textContent;
  const sampleFrame=()=>{
    const lbl=label.textContent;
    if(/LIVE DOWNLOAD|LIVE UPLOAD/i.test(lbl)&&dialUnit.textContent==='Mbps'){
      const raw=parseFloat(value.textContent);
      if(Number.isFinite(raw)){lastLiveRaw=raw;const converted=convertMbps(raw);if(converted.unit!=='Mbps')smoothDial(raw,lbl,'Mbps',/UPLOAD/i.test(lbl)?100:200)}
    }
    requestAnimationFrame(sampleFrame);
  };
  requestAnimationFrame(sampleFrame);

  new MutationObserver(()=>{
    const state=engine.textContent;
    if(state===lastEngine)return;lastEngine=state;
    go.hidden=!['READY','CANCELLED','ERROR'].includes(state);
    if(state==='RUNNING'){q('.meter-card')?.classList.add('testing');}
    else q('.meter-card')?.classList.remove('testing');
    if(state==='COMPLETE'&&Number.isFinite(rawDownload)){
      lastLiveRaw=rawDownload;
      setTimeout(()=>smoothDial(rawDownload,'DOWNLOAD RESULT','Mbps',prettyScale(rawDownload)),80);
      refreshProviderProfile();
    }
  }).observe(engine,{childList:true,characterData:true,subtree:true});
}

installOoklaStyleReadout();
installProviderProfile();
syncProviderSources();
syncOoklaMeter();

['runTestBtn','quickCheckBtn'].forEach(id=>q('#'+id)?.addEventListener('click',()=>activatePanel('network',false)));
activatePanel('network',false);
