const $ = (id) => document.getElementById(id);
const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const SPEED_BASE = 'https://speed.cloudflare.com';
const HISTORY_KEY = 'wifi-checker-pro-history-v2';
const THEME_KEY = 'wifi-checker-theme';

const state = {
  running: false,
  pendingMode: 'full',
  result: null,
  meta: null,
  dns: null,
  location: null,
  testController: null,
  historyConsent: true,
  live: { download: [], upload: [], ping: [], jitter: [] }
};

const fmt = (v, d = 1) => Number.isFinite(v) ? Number(v).toFixed(d) : '—';
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const median = (arr) => percentile(arr, .5);
function percentile(arr, p) {
  const a = arr.filter(Number.isFinite).slice().sort((x,y)=>x-y);
  if (!a.length) return NaN;
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? a[lo] : a[lo] + (a[hi]-a[lo]) * (idx-lo);
}
function avg(arr){const a=arr.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN}

function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2500);
}

function setProgress(percent, stage, message) {
  const p = clamp(percent, 0, 100);
  $('progressBar').style.width = `${p}%`;
  $('testPercent').textContent = `${Math.round(p)}%`;
  if (stage) $('testStage').textContent = stage;
  if (message) $('testMessage').textContent = message;
}
function setEngine(stateText){ $('engineState').textContent = stateText; }
function setDiag(key, ok, text) {
  const el = document.querySelector(`[data-diag="${key}"]`);
  if (!el) return;
  el.classList.toggle('good', ok === true);
  el.classList.toggle('bad', ok === false);
  el.querySelector('strong').textContent = text || (ok ? 'OK' : 'Gagal');
}
function updateOnlineState() {
  const online = navigator.onLine;
  const badge = $('onlineBadge');
  badge.classList.toggle('online', online); badge.classList.toggle('offline', !online);
  badge.querySelector('span').textContent = online ? 'Online' : 'Offline';
  $('connectionStatus').textContent = online ? 'Online' : 'Offline';
  setDiag('internet', online, online ? 'Online' : 'Offline');
}
function detectBrowser(){
  const ua=navigator.userAgent;
  if(/Edg\//.test(ua))return'Microsoft Edge'; if(/OPR\//.test(ua))return'Opera';
  if(/CriOS\//.test(ua))return'Chrome iOS'; if(/FxiOS\//.test(ua))return'Firefox iOS';
  if(/Chrome\//.test(ua))return'Chrome / Chromium'; if(/Firefox\//.test(ua))return'Firefox';
  if(/Safari\//.test(ua)&&/Version\//.test(ua))return'Safari'; return'Browser modern';
}
function updatePassiveInfo(){
  updateOnlineState();
  $('connectionType').textContent = connection?.type ? String(connection.type).toUpperCase() : 'Tidak diekspos';
  $('effectiveType').textContent = connection?.effectiveType ? String(connection.effectiveType).toUpperCase() : 'Tidak tersedia';
  $('estimatedDownlink').textContent = Number.isFinite(connection?.downlink) ? `${connection.downlink} Mbps (estimasi API)` : 'Tidak tersedia';
  $('estimatedRtt').textContent = Number.isFinite(connection?.rtt) ? `${connection.rtt} ms (estimasi API)` : 'Tidak tersedia';
  $('saveData').textContent = typeof connection?.saveData === 'boolean' ? (connection.saveData ? 'Aktif' : 'Nonaktif') : 'Tidak tersedia';
  $('browserName').textContent = detectBrowser();
  $('platform').textContent = navigator.userAgentData?.platform || navigator.platform || 'Tidak tersedia';
  $('cpuCores').textContent = navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency} logical` : 'Tidak tersedia';
  $('deviceMemory').textContent = navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'Tidak tersedia';
  $('screenInfo').textContent = `${screen.width} × ${screen.height} @ ${window.devicePixelRatio || 1}x`;
  $('networkApiState').textContent = connection ? 'Didukung browser' : 'Tidak didukung';
  $('secureContext').textContent = window.isSecureContext ? 'Ya (HTTPS)' : 'Tidak';
  $('protocol').textContent = location.protocol.replace(':','').toUpperCase();
  setDiag('https', window.isSecureContext, window.isSecureContext ? 'Secure' : 'Tidak aman');
  setDiag('network-api', Boolean(connection), connection ? 'Tersedia' : 'Dibatasi');
  setDiag('geolocation', 'geolocation' in navigator, 'geolocation' in navigator ? 'Tersedia' : 'Tidak didukung');
  $('lastUpdated').textContent = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
}

function openModal(id){ const m=$(id); m.classList.add('open'); m.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
function closeModal(id){ const m=$(id); m.classList.remove('open'); m.setAttribute('aria-hidden','true'); if(!document.querySelector('.modal.open')) document.body.style.overflow=''; }
async function refreshGeoPermission(){
  const pill=$('geoPermissionState'), pagePill=$('locationPermissionPill');
  let label='Akan diminta', cls='neutral';
  if(!window.isSecureContext || !navigator.geolocation){label='Tidak tersedia';cls='bad'}
  else if(navigator.permissions?.query){
    try{ const s=await navigator.permissions.query({name:'geolocation'}); label=s.state==='granted'?'Sudah diizinkan':s.state==='denied'?'Ditolak':'Akan diminta'; cls=s.state==='granted'?'good':s.state==='denied'?'bad':'neutral'; s.onchange=()=>refreshGeoPermission(); }catch(_){ }
  }
  [pill,pagePill].forEach(el=>{el.textContent=label;el.className=`permission-pill ${cls}`});
}
function requestExactLocation(){
  return new Promise(resolve=>{
    if(!window.isSecureContext || !navigator.geolocation){
      state.location=null; paintLocationError('Geolocation membutuhkan HTTPS dan dukungan browser.'); resolve(null); return;
    }
    $('geoPermissionState').textContent='Menunggu izin…';
    navigator.geolocation.getCurrentPosition(pos=>{
      state.location={lat:pos.coords.latitude,lon:pos.coords.longitude,accuracy:pos.coords.accuracy,altitude:pos.coords.altitude,timestamp:pos.timestamp};
      paintLocation(state.location); refreshGeoPermission(); resolve(state.location);
    },err=>{
      state.location=null;
      const msg=err.code===1?'Izin lokasi ditolak.':err.code===2?'Lokasi perangkat tidak tersedia.':'Permintaan lokasi melewati batas waktu.';
      paintLocationError(msg); refreshGeoPermission(); resolve(null);
    },{enableHighAccuracy:true,timeout:12000,maximumAge:0});
  });
}
function paintLocation(loc){
  $('deviceCoords').textContent=`${loc.lat.toFixed(6)}, ${loc.lon.toFixed(6)}`;
  $('deviceAccuracy').textContent=`Akurasi yang dilaporkan browser ±${Math.round(loc.accuracy)} m`;
  $('latitude').textContent=loc.lat.toFixed(6); $('longitude').textContent=loc.lon.toFixed(6);
  $('geoAccuracy').textContent=`±${Math.round(loc.accuracy)} m`; $('altitude').textContent=Number.isFinite(loc.altitude)?`${Math.round(loc.altitude)} m`:'Tidak tersedia';
  $('locationPermissionPill').textContent='Diizinkan'; $('locationPermissionPill').className='permission-pill good';
  setDiag('geolocation',true,`±${Math.round(loc.accuracy)} m`);
}
function paintLocationError(msg){
  $('deviceCoords').textContent='Tidak digunakan'; $('deviceAccuracy').textContent=msg;
  ['latitude','longitude','geoAccuracy','altitude'].forEach(id=>$(id).textContent='—');
  setDiag('geolocation',false,'Tidak digunakan');
}

function createLinkedController(parentSignal){
  const c=new AbortController();
  if(parentSignal){ if(parentSignal.aborted)c.abort(); else parentSignal.addEventListener('abort',()=>c.abort(),{once:true}); }
  return c;
}
async function fetchWithTimeout(url, options={}, timeout=10000, parentSignal=state.testController?.signal){
  const c=createLinkedController(parentSignal); const t=setTimeout(()=>c.abort(),timeout);
  try{return await fetch(url,{cache:'no-store',...options,signal:c.signal})}finally{clearTimeout(t)}
}
async function loadNetworkMeta(){
  try{
    const r=await fetchWithTimeout(`${SPEED_BASE}/meta?r=${Date.now()}`,{},7000); if(!r.ok)throw new Error(`HTTP ${r.status}`);
    const m=await r.json(); state.meta=m;
    const ip=m.clientIp||m.ip||'Tidak tersedia'; const org=m.asOrganization||m.asnOrganization||m.organization||'Tidak tersedia';
    const loc=[m.city,m.region,m.country].filter(Boolean).join(', ')||'Tidak tersedia';
    $('publicIp').textContent=ip; $('publicIpDetail').textContent=ip; $('isp').textContent=org;
    $('asn').textContent=m.asn?`AS${String(m.asn).replace(/^AS/i,'')}`:'Tidak tersedia'; $('colo').textContent=m.colo||'Tidak tersedia';
    $('networkLocation').textContent=loc; $('edgeChip').innerHTML=`EDGE <b>${m.colo||'—'}</b>`;
    return m;
  }catch(e){
    if(e.name==='AbortError')throw e;
    ['publicIp','publicIpDetail'].forEach(id=>$(id).textContent='Gagal dimuat'); $('isp').textContent='Tidak tersedia'; $('networkLocation').textContent='Tidak tersedia';
    return null;
  }
}
async function probeSpeedEndpoint(){
  const t=performance.now();
  try{const r=await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&r=${Math.random()}`,{},5500);if(!r.ok)throw 0;await r.arrayBuffer();const ms=performance.now()-t;setDiag('speed',true,`${Math.round(ms)} ms`);return true}catch(e){if(e.name==='AbortError')throw e;setDiag('speed',false,'Tidak terjangkau');return false}
}
async function latencyProbe(timeout=5000){
  const s=performance.now(); const r=await fetchWithTimeout(`${SPEED_BASE}/__down?bytes=0&r=${Date.now()}-${Math.random()}`,{},timeout); if(!r.ok)throw new Error(`HTTP ${r.status}`); await r.arrayBuffer(); return performance.now()-s;
}
async function runLatency(samples=12,onSample){
  const vals=[]; let failures=0;
  for(let i=0;i<samples;i++){
    try{vals.push(await latencyProbe())}catch(e){if(e.name==='AbortError')throw e;failures++}
    onSample?.(i+1,samples,vals.at(-1)); await sleep(65);
  }
  if(vals.length<Math.max(3,Math.ceil(samples*.5)))throw new Error('Sampel latency tidak cukup.');
  const stable=vals.length>5?vals.slice(1):vals;
  const diffs=[];for(let i=1;i<stable.length;i++)diffs.push(Math.abs(stable[i]-stable[i-1]));
  return{ping:percentile(stable,.5),jitter:avg(diffs),samples:stable,failed:failures};
}
async function downloadRequest(bytes){
  const url=`${SPEED_BASE}/__down?bytes=${bytes}&r=${Math.random()}`; const s=performance.now();
  const r=await fetchWithTimeout(url,{},25000); if(!r.ok)throw new Error(`Download HTTP ${r.status}`); const buf=await r.arrayBuffer();
  const sec=(performance.now()-s)/1000, actual=buf.byteLength||bytes; return{mbps:(actual*8)/sec/1e6,seconds:sec,bytes:actual};
}
async function uploadRequest(bytes){
  const body=new Uint8Array(bytes); const s=performance.now();
  const r=await fetchWithTimeout(`${SPEED_BASE}/__up?r=${Math.random()}`,{method:'POST',body},25000); if(!r.ok)throw new Error(`Upload HTTP ${r.status}`); await r.text();
  const sec=(performance.now()-s)/1000; return{mbps:(bytes*8)/sec/1e6,seconds:sec,bytes};
}
async function adaptiveBandwidth(direction,onPoint,quick=false){
  const request=direction==='download'?downloadRequest:uploadRequest;
  const sizes=quick?(direction==='download'?[500_000,2_000_000,5_000_000]:[250_000,1_000_000]):(direction==='download'?[250_000,1_000_000,5_000_000,10_000_000,25_000_000]:[150_000,750_000,2_000_000,5_000_000,10_000_000]);
  const points=[]; let total=0;
  for(let i=0;i<sizes.length;i++){
    const p=await request(sizes[i]); points.push(p); total+=p.bytes; onPoint?.(p,i+1,sizes.length);
    const targetReached=p.seconds>=1.4 && points.length>=2; const cap=direction==='download'?45_000_000:20_000_000;
    if(targetReached||total>=cap)break;
  }
  const usable=points.filter(p=>p.seconds>=.05).map(p=>p.mbps); if(!usable.length)throw new Error(`${direction} gagal diukur.`);
  const chosen=usable.length>=3?percentile(usable.slice(1),.9):median(usable);
  return{mbps:chosen,points};
}
async function measureLoadedLatency(direction,bandwidthMbps){
  const secondsTarget=1.8; const bytesPerSec=clamp((bandwidthMbps*1e6)/8,250_000,20_000_000);
  const bytes=Math.round(clamp(bytesPerSec*secondsTarget,direction==='download'?2_000_000:700_000,direction==='download'?25_000_000:10_000_000));
  let done=false; const main=(direction==='download'?downloadRequest(bytes):uploadRequest(bytes)).finally(()=>{done=true});
  const probes=[];
  await sleep(100);
  while(!done && probes.length<10){
    try{probes.push(await latencyProbe(3500))}catch(e){if(e.name==='AbortError')throw e}
    if(!done)await sleep(160);
  }
  await main;
  return probes.length?percentile(probes,.5):NaN;
}
async function dnsProbe(name,url){
  const s=performance.now();
  try{const r=await fetchWithTimeout(url,{headers:{Accept:'application/dns-json'}},7000);if(!r.ok)throw 0;const data=await r.json();if(typeof data.Status==='number'&&data.Status!==0)throw 0;return{name,ok:true,ms:performance.now()-s}}catch(e){if(e.name==='AbortError')throw e;return{name,ok:false,ms:NaN}}
}
async function runDnsTests(){
  $('cloudflareDns').textContent='Menguji…';$('googleDns').textContent='Menguji…';$('fastestDns').textContent='…';
  const stamp=Date.now(); const [cf,g]=await Promise.all([
    dnsProbe('Cloudflare',`https://cloudflare-dns.com/dns-query?name=example.com&type=A&ct=application/dns-json&r=${stamp}`),
    dnsProbe('Google',`https://dns.google/resolve?name=example.com&type=A&r=${stamp}`)
  ]);
  for(const [id,x] of [['cloudflareDns',cf],['googleDns',g]]){const el=$(id);el.textContent=x.ok?`${Math.round(x.ms)} ms`:'Gagal';el.className=x.ok?'good':'bad'}
  const good=[cf,g].filter(x=>x.ok).sort((a,b)=>a.ms-b.ms);$('fastestDns').textContent=good.length?`${good[0].name} · ${Math.round(good[0].ms)} ms`:'Tidak dapat dibandingkan';
  state.dns={cloudflare:cf,google:g};return state.dns;
}

function gradeDownload(v){return v>=100?'Sangat cepat':v>=50?'Cepat':v>=25?'Baik':v>=10?'Cukup':'Lambat'}
function gradeUpload(v){return v>=30?'Sangat baik':v>=10?'Baik':v>=5?'Cukup':'Rendah'}
function gradePing(v){return v<=20?'Excellent':v<=40?'Sangat baik':v<=70?'Baik':v<=120?'Cukup':'Tinggi'}
function gradeJitter(v){return v<=5?'Sangat stabil':v<=10?'Stabil':v<=20?'Cukup stabil':'Tidak stabil'}
function scoreFor(r){
  const d=clamp((Math.log10(Math.max(r.download,1))/Math.log10(200))*35,4,35);
  const u=clamp((Math.log10(Math.max(r.upload,1))/Math.log10(60))*20,3,20);
  const p=clamp(25-(Math.max(r.ping-12,0)/108)*20,5,25);
  const j=clamp(20-(Math.max(r.jitter-2,0)/38)*17,3,20);
  return Math.round(clamp(d+u+p+j,0,100));
}
function bufferbloat(r){
  const loaded=[r.downLoadedLatency,r.upLoadedLatency].filter(Number.isFinite); if(!loaded.length)return{grade:'Tidak tersedia',delta:NaN};
  const delta=Math.max(...loaded)-r.ping; return{delta,grade:delta<=10?'A':delta<=25?'B':delta<=50?'C':delta<=100?'D':'F'};
}
function setDial(value,label='NETWORK SCORE',unit='/ 100',max=100){
  const v=Number.isFinite(value)?value:0; const ratio=clamp(v/max,0,1); const deg=ratio*290;
  $('dialLabel').textContent=label;$('dialValue').textContent=Number.isFinite(value)?(value>=100?Math.round(value):fmt(value,1)):'—';$('dialUnit').textContent=unit;
  $('speedDial').style.setProperty('--meter',`${deg}deg`);$('speedDial').style.setProperty('--needle',`${deg}deg`);
}
function animateValue(id,to,d=1){
  const el=$(id); if(!Number.isFinite(to)){el.textContent='—';return} const start=performance.now(),from=parseFloat(el.textContent)||0,dur=600;
  const tick=t=>{const p=clamp((t-start)/dur,0,1),e=1-Math.pow(1-p,3);el.textContent=(from+(to-from)*e).toFixed(d);if(p<1)requestAnimationFrame(tick)};requestAnimationFrame(tick);
}
function drawSpark(id,values){
  const c=$(id);if(!c)return;const ctx=c.getContext('2d'),dpr=window.devicePixelRatio||1,w=c.clientWidth||180,h=c.clientHeight||40;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const vals=values.filter(Number.isFinite);if(vals.length<2)return;const lo=Math.min(...vals),hi=Math.max(...vals),range=hi-lo||1;ctx.beginPath();vals.forEach((v,i)=>{const x=(i/(vals.length-1))*w,y=h-4-((v-lo)/range)*(h-8);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.lineWidth=1.6;ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim()||'#55f3ec';ctx.stroke();}
function paintResult(r){
  animateValue('downloadValue',r.download);animateValue('uploadValue',r.upload);animateValue('pingValue',r.ping);animateValue('jitterValue',r.jitter);
  $('downloadGrade').textContent=gradeDownload(r.download);$('uploadGrade').textContent=gradeUpload(r.upload);$('pingGrade').textContent=gradePing(r.ping);$('jitterGrade').textContent=gradeJitter(r.jitter);
  $('downLoadedLatency').textContent=Number.isFinite(r.downLoadedLatency)?`${fmt(r.downLoadedLatency)} ms`:'Tidak tersedia';$('upLoadedLatency').textContent=Number.isFinite(r.upLoadedLatency)?`${fmt(r.upLoadedLatency)} ms`:'Tidak tersedia';
  const b=bufferbloat(r);$('bufferbloatGrade').textContent=b.grade;$('bufferbloatDelta').textContent=Number.isFinite(b.delta)?`Loaded latency +${fmt(Math.max(0,b.delta))} ms vs idle`:'Loaded latency tidak tersedia';
  r.score=scoreFor(r); setDial(r.score,'NETWORK SCORE','/ 100',100); $('scoreHint').textContent=r.score>=85?'Koneksi sangat baik untuk mayoritas aktivitas real-time.':r.score>=65?'Koneksi cukup baik, lihat loaded latency untuk stabilitas saat sibuk.':'Ada bottleneck pada bandwidth atau latency. Lihat rekomendasi di bawah.';
  drawSpark('downloadSpark',r.downloadPoints||[]);drawSpark('uploadSpark',r.uploadPoints||[]);drawSpark('pingSpark',r.pingSamples||[]);drawSpark('jitterSpark',r.jitterPoints||[]);
  renderRecommendations(r);
}
function renderRecommendations(r){
  const tips=[]; const b=bufferbloat(r);
  if(r.ping>70)tips.push(['Latency tinggi','Untuk gaming/meeting, coba sambungan 5/6 GHz yang lebih dekat ke router atau Ethernet.']);
  if(r.jitter>15)tips.push(['Jitter tidak stabil','Hindari download/upload berat bersamaan dan cek interferensi Wi‑Fi.']);
  if(Number.isFinite(b.delta)&&b.delta>50)tips.push(['Bufferbloat terdeteksi',`Latency naik sekitar ${Math.round(b.delta)} ms ketika koneksi dibebani. QoS/SQM pada router dapat membantu.`]);
  if(r.download<25)tips.push(['Download terbatas','Ulangi tes dekat router. Jika hasil tetap rendah, bandingkan dengan paket ISP dan perangkat lain.']);
  if(r.upload<5)tips.push(['Upload rendah','Upload rendah dapat mengganggu video call, cloud backup, dan live streaming.']);
  if(!tips.length)tips.push(['Koneksi sehat','Bandwidth, latency, dan jitter berada pada rentang yang baik untuk penggunaan umum.']);
  $('recommendations').innerHTML=tips.map(([t,p])=>`<div class="tip"><strong>${t}</strong><p>${p}</p></div>`).join('');
}
function jitterPoints(samples){const out=[];for(let i=1;i<samples.length;i++)out.push(Math.abs(samples[i]-samples[i-1]));return out}

function historyData(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}
function saveHistory(r){
  if(!state.historyConsent)return;const list=historyData();list.unshift({time:Date.now(),download:r.download,upload:r.upload,ping:r.ping,jitter:r.jitter,score:r.score,mode:r.mode});localStorage.setItem(HISTORY_KEY,JSON.stringify(list.slice(0,10)));renderHistory();
}
function renderHistory(){
  const list=historyData();if(!list.length){$('historyList').innerHTML='<p class="empty-state">Belum ada riwayat di browser ini.</p>';return}
  $('historyList').innerHTML=list.map(x=>`<div class="history-item"><time>${new Date(x.time).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</time><b>${fmt(x.download)}<span>Mbps ↓</span></b><b>${fmt(x.upload)}<span>Mbps ↑</span></b><b>${fmt(x.ping)}<span>ms ping</span></b><b>${x.score??'—'}<span>score</span></b></div>`).join('');
}
function safeExport(){
  if(!state.result)return null; const r=state.result;
  return{generatedAt:new Date().toISOString(),mode:r.mode,measurements:{downloadMbps:r.download,uploadMbps:r.upload,pingMs:r.ping,jitterMs:r.jitter,downloadLoadedLatencyMs:r.downLoadedLatency,uploadLoadedLatencyMs:r.upLoadedLatency,networkScore:r.score,bufferbloat:bufferbloat(r)},network:state.meta?{publicIp:state.meta.clientIp||state.meta.ip||null,asn:state.meta.asn||null,organization:state.meta.asOrganization||state.meta.asnOrganization||null,cloudflareColo:state.meta.colo||null,ipLocation:[state.meta.city,state.meta.region,state.meta.country].filter(Boolean).join(', ')||null}:null,dns:state.dns?{cloudflareMs:state.dns.cloudflare.ok?state.dns.cloudflare.ms:null,googleMs:state.dns.google.ok?state.dns.google.ms:null}:null,browser:{name:detectBrowser(),platform:navigator.userAgentData?.platform||navigator.platform||null},privacy:{preciseDeviceLocationIncluded:false}};
}
function summaryText(){const e=safeExport();if(!e)return'Belum ada hasil tes.';const m=e.measurements;return`WiFi Checker Pro\nDownload: ${fmt(m.downloadMbps)} Mbps\nUpload: ${fmt(m.uploadMbps)} Mbps\nPing: ${fmt(m.pingMs)} ms\nJitter: ${fmt(m.jitterMs)} ms\nLoaded latency ↓: ${fmt(m.downloadLoadedLatencyMs)} ms\nLoaded latency ↑: ${fmt(m.uploadLoadedLatencyMs)} ms\nScore: ${m.networkScore}/100\n${e.network?.organization||''}`.trim()}

function testLiveMetric(kind,value,max){
  state.live[kind].push(value); if(state.live[kind].length>24)state.live[kind].shift(); const id=kind==='download'?'downloadSpark':kind==='upload'?'uploadSpark':'pingSpark';drawSpark(id,state.live[kind]);
  if(kind==='download')setDial(value,'LIVE DOWNLOAD','Mbps',max||200);else if(kind==='upload')setDial(value,'LIVE UPLOAD','Mbps',max||100);
}
async function performTest(mode='full'){
  if(state.running)return; state.running=true;state.testController=new AbortController();state.live={download:[],upload:[],ping:[],jitter:[]};
  $('runTestBtn').disabled=true;$('quickCheckBtn').disabled=true;$('cancelTestBtn').classList.remove('hidden');$('testModeBadge').textContent=mode==='full'?'Full Test aktif':'Quick Check aktif';setEngine('RUNNING');
  try{
    setProgress(4,'Menyiapkan endpoint','Memastikan edge pengujian dapat dijangkau…'); await Promise.all([loadNetworkMeta(),probeSpeedEndpoint()]);
    if(!navigator.onLine)throw new Error('Perangkat sedang offline.');
    setProgress(12,'Mengukur idle latency','Mengambil beberapa sampel ping untuk median dan jitter…');
    const lat=await runLatency(mode==='full'?12:6,(i,n,v)=>{setProgress(12+(i/n)*16,'Mengukur idle latency',`Sampel ${i}/${n}`);if(Number.isFinite(v)){state.live.ping.push(v);drawSpark('pingSpark',state.live.ping)}});
    const jp=jitterPoints(lat.samples);drawSpark('jitterSpark',jp);
    setProgress(31,'Mengukur download','Ukuran transfer dinaikkan adaptif agar hasil lebih representatif…');
    const down=await adaptiveBandwidth('download',(p,i,n)=>{testLiveMetric('download',p.mbps,200);setProgress(31+(i/n)*20,'Mengukur download',`${fmt(p.mbps)} Mbps · sampel ${i}`)},mode!=='full');
    let up={mbps:NaN,points:[]};
    if(mode==='full'){
      setProgress(53,'Mengukur upload','Mengirim payload adaptif ke edge pengujian…');
      up=await adaptiveBandwidth('upload',(p,i,n)=>{testLiveMetric('upload',p.mbps,100);setProgress(53+(i/n)*18,'Mengukur upload',`${fmt(p.mbps)} Mbps · sampel ${i}`)},false);
    }else{
      setProgress(55,'Quick upload sample','Mengukur upload singkat…');
      up=await adaptiveBandwidth('upload',(p)=>testLiveMetric('upload',p.mbps,100),true);
    }
    let downLoaded=NaN,upLoaded=NaN;
    if(mode==='full'){
      setProgress(73,'Loaded latency download','Mengukur latency saat download aktif…'); downLoaded=await measureLoadedLatency('download',down.mbps);
      setProgress(82,'Loaded latency upload','Mengukur latency saat upload aktif…'); upLoaded=await measureLoadedLatency('upload',up.mbps);
    }
    setProgress(89,'DNS diagnostics','Menguji resolver DoH secara nyata…'); await runDnsTests();
    const result={mode,download:down.mbps,upload:up.mbps,ping:lat.ping,jitter:lat.jitter,downLoadedLatency:downLoaded,upLoadedLatency:upLoaded,downloadPoints:down.points.map(x=>x.mbps),uploadPoints:up.points.map(x=>x.mbps),pingSamples:lat.samples,jitterPoints:jp,measuredAt:Date.now()};
    state.result=result;paintResult(result);saveHistory(result);setProgress(100,'Tes selesai','Semua pengukuran yang didukung browser telah selesai.');setEngine('COMPLETE');$('testModeBadge').textContent=mode==='full'?'Full Test selesai':'Quick Check selesai';
  }catch(e){
    if(e.name==='AbortError'||state.testController?.signal.aborted){setProgress(0,'Tes dibatalkan','Pengujian dihentikan oleh pengguna.');setEngine('CANCELLED');toast('Tes dibatalkan.')}else{setProgress(0,'Tes gagal',e.message||'Terjadi kesalahan saat mengukur jaringan.');setEngine('ERROR');toast(e.message||'Tes gagal.');console.error(e)}
  }finally{state.running=false;state.testController=null;$('runTestBtn').disabled=false;$('quickCheckBtn').disabled=false;$('cancelTestBtn').classList.add('hidden');updatePassiveInfo()}
}
function preflight(mode){state.pendingMode=mode;refreshGeoPermission();openModal('permissionModal')}

function initReveal(){
  const els=[...document.querySelectorAll('.reveal')]; if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return}
  const io=new IntersectionObserver(entries=>entries.forEach(x=>{if(x.isIntersecting){x.target.classList.add('visible');io.unobserve(x.target)}}),{threshold:.08});els.forEach(e=>io.observe(e));
}
function initNetworkCanvas(){
  const c=$('networkCanvas'),ctx=c.getContext('2d');let w,h,dpr,nodes=[];const resize=()=>{dpr=Math.min(devicePixelRatio||1,2);w=innerWidth;h=innerHeight;c.width=w*dpr;c.height=h*dpr;c.style.width=`${w}px`;c.style.height=`${h}px`;ctx.setTransform(dpr,0,0,dpr,0,0);nodes=Array.from({length:Math.min(34,Math.max(16,Math.floor(w/45)))},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.09,vy:(Math.random()-.5)*.09}))};resize();addEventListener('resize',resize,{passive:true});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;function frame(){ctx.clearRect(0,0,w,h);ctx.strokeStyle='rgba(90,205,240,.08)';ctx.fillStyle='rgba(95,226,240,.25)';for(const n of nodes){if(!reduced){n.x+=n.vx;n.y+=n.vy;if(n.x<0||n.x>w)n.vx*=-1;if(n.y<0||n.y>h)n.vy*=-1}ctx.beginPath();ctx.arc(n.x,n.y,1.1,0,Math.PI*2);ctx.fill()}for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d<145){ctx.globalAlpha=(1-d/145)*.65;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke()}}ctx.globalAlpha=1;if(!reduced)requestAnimationFrame(frame)}frame();
}
function initTheme(){const saved=localStorage.getItem(THEME_KEY);if(saved==='light')document.documentElement.classList.add('light');$('themeBtn').addEventListener('click',()=>{document.documentElement.classList.toggle('light');localStorage.setItem(THEME_KEY,document.documentElement.classList.contains('light')?'light':'dark')})}

$('runTestBtn').addEventListener('click',()=>preflight('full'));
$('quickCheckBtn').addEventListener('click',()=>preflight('quick'));
$('grantAndRunBtn').addEventListener('click',async()=>{state.historyConsent=$('historyConsent').checked;await requestExactLocation();closeModal('permissionModal');performTest(state.pendingMode)});
$('runWithoutLocationBtn').addEventListener('click',()=>{state.historyConsent=$('historyConsent').checked;state.location=null;paintLocationError('Pengguna memilih menjalankan tes tanpa lokasi.');closeModal('permissionModal');performTest(state.pendingMode)});
$('cancelTestBtn').addEventListener('click',()=>state.testController?.abort());
$('privacyBtn').addEventListener('click',()=>openModal('privacyModal'));
document.querySelectorAll('[data-close-modal]').forEach(x=>x.addEventListener('click',()=>closeModal('permissionModal')));
document.querySelectorAll('[data-close-privacy]').forEach(x=>x.addEventListener('click',()=>closeModal('privacyModal')));
addEventListener('keydown',e=>{if(e.key==='Escape'){closeModal('permissionModal');closeModal('privacyModal')}});
$('dnsBtn').addEventListener('click',async()=>{if(state.running)return;state.testController=new AbortController();try{await runDnsTests();toast('DNS diagnostic selesai.')}catch(e){toast('DNS diagnostic gagal.')}finally{state.testController=null}});
$('clearHistoryBtn').addEventListener('click',()=>{localStorage.removeItem(HISTORY_KEY);renderHistory();toast('Riwayat lokal dihapus.');});
$('copyBtn').addEventListener('click',async()=>{if(!state.result)return toast('Jalankan tes terlebih dahulu.');try{await navigator.clipboard.writeText(summaryText());toast('Ringkasan disalin.')}catch{toast('Browser tidak mengizinkan clipboard.')}});
$('exportBtn').addEventListener('click',()=>{const data=safeExport();if(!data)return toast('Jalankan tes terlebih dahulu.');const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`wifi-check-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
addEventListener('online',updatePassiveInfo);addEventListener('offline',updatePassiveInfo);connection?.addEventListener?.('change',updatePassiveInfo);

initTheme();initReveal();initNetworkCanvas();updatePassiveInfo();refreshGeoPermission();renderHistory();setDial(NaN);
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
