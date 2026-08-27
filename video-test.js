const VIDEO_MANIFEST='https://storage.googleapis.com/shaka-demo-assets/sintel-mp4-only/dash.mpd';
const SHAKA_SRC='https://cdn.jsdelivr.net/npm/shaka-player@5.2.7/dist/shaka-player.compiled.js';
const RESOLUTIONS=[360,480,720,1080,1440,2160];
const q=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const median=a=>{const x=a.filter(Number.isFinite).slice().sort((m,n)=>m-n);if(!x.length)return NaN;const i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2};
const percentile=(a,p)=>{const x=a.filter(Number.isFinite).slice().sort((m,n)=>m-n);if(!x.length)return NaN;const i=(x.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?x[l]:x[l]+(x[h]-x[l])*(i-l)};
const fmt=(v,d=1)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
let player=null,timer=null,tickTimer=null,test=null,shakaPromise=null;

function loadShaka(){
  if(window.shaka?.Player)return Promise.resolve(window.shaka);
  if(shakaPromise)return shakaPromise;
  shakaPromise=new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.src=SHAKA_SRC;s.async=true;s.crossOrigin='anonymous';
    s.onload=()=>{try{window.shaka.polyfill.installAll();resolve(window.shaka)}catch(e){reject(e)}};s.onerror=()=>reject(new Error('Shaka Player gagal dimuat.'));document.head.append(s);
  });return shakaPromise;
}
function installButton(){
  const actions=q('.command-actions');if(!actions||q('#videoTestBtn'))return;
  const b=document.createElement('button');b.id='videoTestBtn';b.type='button';b.className='soft-btn video-test-launch';b.innerHTML='<i data-lucide="play-square"></i><span>Video Test</span>';b.addEventListener('click',openLab);
  const quick=q('#quickCheckBtn');quick?.after(b)||actions.append(b);try{window.lucide?.createIcons({attrs:{'stroke-width':1.8}})}catch{}
}
function installLab(){
  if(q('#videoTestLab'))return;
  const el=document.createElement('section');el.id='videoTestLab';el.className='video-lab';el.hidden=true;el.setAttribute('aria-hidden','true');
  el.innerHTML=`<div class="video-lab-backdrop" data-video-close></div><div class="video-lab-card" role="dialog" aria-modal="true" aria-labelledby="videoLabTitle" data-lenis-prevent>
    <header class="video-lab-head"><div><span>REAL STREAMING LAB</span><h2 id="videoLabTitle">Video Resolution Test</h2><p>Pilih resolusi, tonton stream nyata, lalu lihat kekuatan playback dan kualitas jaringan secara live.</p></div><button type="button" class="video-close" data-video-close aria-label="Tutup"><i data-lucide="x"></i></button></header>
    <div class="video-lab-layout">
      <div class="video-stage-col">
        <div class="video-stage"><video id="videoLabPlayer" playsinline controls muted preload="none"></video><div id="videoOverlay" class="video-overlay"><span>SIAP</span><b>Pilih resolusi lalu mulai</b><small>Stream adaptive-media nyata · kualitas akan dikunci</small></div><div class="video-live-badge"><i></i><span id="videoLiveState">IDLE</span></div></div>
        <div class="resolution-picker" id="resolutionPicker">${RESOLUTIONS.map(h=>`<button type="button" data-height="${h}" class="${h===1080?'active':''}">${h===2160?'4K':`${h}p`}</button>`).join('')}</div>
        <div class="video-controls-row"><label>Durasi<select id="videoTestDuration"><option value="15">15 detik</option><option value="30" selected>30 detik</option><option value="60">60 detik</option></select></label><button id="startVideoTest" type="button" class="video-primary"><i data-lucide="play"></i><span>Mulai Video Test</span></button><button id="stopVideoTest" type="button" class="video-secondary" disabled>Stop</button></div>
        <div class="video-progress"><div><span id="videoProgressBar"></span></div><small id="videoProgressText">Belum berjalan</small></div>
        <div id="videoVerdict" class="video-verdict neutral"><div class="video-score"><strong>—</strong><span>/100</span></div><div><b>Belum diuji</b><p>Streaming Strength menilai pengalaman playback, bukan RSSI/dBm sinyal radio Wi‑Fi.</p></div></div>
      </div>
      <aside class="video-metrics-col">
        <div class="video-metric-grid">
          <div><span>Actual resolution</span><b id="vmResolution">—</b><small id="vmFps">— fps</small></div>
          <div><span>Stream bitrate</span><b id="vmBitrate">—</b><small>actual variant</small></div>
          <div><span>Bandwidth estimate</span><b id="vmBandwidth">—</b><small>player EWMA</small></div>
          <div><span>Headroom</span><b id="vmHeadroom">—</b><small>bandwidth ÷ bitrate</small></div>
          <div><span>Buffer health</span><b id="vmBuffer">—</b><small>seconds ahead</small></div>
          <div><span>Startup time</span><b id="vmStartup">—</b><small>load → playing</small></div>
          <div><span>Rebuffer</span><b id="vmRebuffer">—</b><small id="vmRebufferTime">0.0 s total</small></div>
          <div><span>Dropped frames</span><b id="vmDropped">—</b><small id="vmDecoded">— decoded</small></div>
          <div><span>Data transferred</span><b id="vmData">—</b><small>media + manifest</small></div>
          <div><span>Codec</span><b id="vmCodec">—</b><small id="vmAudio">audio —</small></div>
          <div><span>Network changes</span><b id="vmChanges">0</b><small>during playback</small></div>
          <div><span>Recommended</span><b id="vmRecommended">—</b><small>safe headroom target</small></div>
        </div>
        <div class="video-detail-card"><span>LIVE ANALYSIS</span><b id="videoAnalysisTitle">Menunggu tes</b><p id="videoAnalysisText">Saat video berjalan, sistem memantau startup delay, buffer, stall, dropped frame, bitrate stream, bandwidth estimate, dan perubahan koneksi.</p></div>
        <div class="video-note"><b>Catatan akurasi</b><p>Resolusi tidak memiliki kebutuhan Mbps yang universal. Test ini memakai bitrate track video yang benar-benar diputar. Netflix/YouTube/layanan lain dapat memakai codec dan bitrate berbeda. Audio dimute saat mulai agar autoplay stabil di mobile; kamu bisa unmute dari player.</p></div>
      </aside>
    </div>
  </div>`;
  document.body.append(el);
  el.querySelectorAll('[data-video-close]').forEach(x=>x.addEventListener('click',closeLab));
  q('#resolutionPicker').addEventListener('click',e=>{const b=e.target.closest('[data-height]');if(!b||test?.running)return;q('#resolutionPicker').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b))});
  q('#startVideoTest').addEventListener('click',startTest);q('#stopVideoTest').addEventListener('click',()=>finishTest('stopped'));
  try{window.lucide?.createIcons({attrs:{'stroke-width':1.8}})}catch{}
}
function selectedHeight(){return Number(q('#resolutionPicker .active')?.dataset.height)||1080}
function setOverlay(label,value,meta,show=true){const o=q('#videoOverlay');if(!o)return;o.querySelector('span').textContent=label;o.querySelector('b').textContent=value;o.querySelector('small').textContent=meta||'';o.classList.toggle('hidden',!show)}
function setLive(s){q('#videoLiveState').textContent=s;q('.video-live-badge')?.classList.toggle('running',s==='LIVE')}
function bufferAhead(video){if(!video?.buffered?.length)return 0;for(let i=0;i<video.buffered.length;i++)if(video.currentTime>=video.buffered.start(i)&&video.currentTime<=video.buffered.end(i))return Math.max(0,video.buffered.end(i)-video.currentTime);return 0}
function qualityFrames(video){try{return video.getVideoPlaybackQuality?.()||{totalVideoFrames:0,droppedVideoFrames:0}}catch{return{totalVideoFrames:0,droppedVideoFrames:0}}}
function chosenTrack(){return player?.getVariantTracks?.().find(t=>t.active)||test?.track||null}
function chooseTrack(tracks,target){
  const usable=tracks.filter(t=>Number.isFinite(t.height)&&t.height>0);if(!usable.length)return null;
  const heights=[...new Set(usable.map(t=>t.height))];heights.sort((a,b)=>Math.abs(a-target)-Math.abs(b-target)||(a>target?1:-1));const h=heights[0];
  return usable.filter(t=>t.height===h).sort((a,b)=>(b.bandwidth||0)-(a.bandwidth||0))[0];
}
function scoreNow(){
  if(!test)return NaN;const bw=median(test.bandwidthSamples),track=chosenTrack(),bit=(track?.bandwidth||0)/1e6,head=bit>0?bw/bit:NaN,buf=median(test.bufferSamples.slice(-12)),frames=qualityFrames(q('#videoLabPlayer')),drop=frames.totalVideoFrames?frames.droppedVideoFrames/frames.totalVideoFrames:0,start=test.startupMs;
  const hs=!Number.isFinite(head)?55:head>=2?100:head>=1.5?90:head>=1.2?76:head>=1?58:head>=.8?38:18;
  const bs=!Number.isFinite(buf)?55:buf>=10?100:buf>=6?90:buf>=3?72:buf>=1.5?50:25;
  const ss=test.rebuffers===0?100:clamp(88-test.rebuffers*20-test.rebufferMs/1000*8,0,88);
  const ds=drop<=.005?100:drop<=.02?82:drop<=.05?58:drop<=.1?35:15;
  const us=!Number.isFinite(start)?55:start<=1200?100:start<=2500?88:start<=4500?68:start<=7000?45:25;
  return Math.round(hs*.34+bs*.22+ss*.24+ds*.10+us*.10);
}
function recommendation(){
  if(!test?.tracks?.length)return null;const bw=percentile(test.bandwidthSamples,.25);if(!Number.isFinite(bw))return null;const safe=bw*1e6/1.4;
  const byHeight=new Map();for(const t of test.tracks){if(!Number.isFinite(t.height)||!Number.isFinite(t.bandwidth))continue;const old=byHeight.get(t.height);if(!old||t.bandwidth>old.bandwidth)byHeight.set(t.height,t)}
  const viable=[...byHeight.values()].filter(t=>t.bandwidth<=safe).sort((a,b)=>a.height-b.height);let pick=viable.at(-1)||[...byHeight.values()].sort((a,b)=>a.height-b.height)[0];
  if(test.rebuffers>0&&viable.length>1){const idx=viable.findIndex(t=>t.id===pick.id);if(idx>0)pick=viable[idx-1]}
  return pick;
}
function paintLive(){
  if(!test)return;const video=q('#videoLabPlayer'),stats=player?.getStats?.()||{},track=chosenTrack(),bw=Number(stats.estimatedBandwidth)/1e6,buf=bufferAhead(video),frames=qualityFrames(video);
  if(Number.isFinite(bw)&&bw>0)test.bandwidthSamples.push(bw);test.bufferSamples.push(buf);if(test.bandwidthSamples.length>120)test.bandwidthSamples.shift();if(test.bufferSamples.length>120)test.bufferSamples.shift();
  const bit=(track?.bandwidth||0)/1e6,head=bit>0&&Number.isFinite(bw)?bw/bit:NaN,dropPct=frames.totalVideoFrames?frames.droppedVideoFrames/frames.totalVideoFrames*100:NaN,rec=recommendation();
  q('#vmResolution').textContent=track?.height?`${track.width||'—'}×${track.height}`:(video.videoHeight?`${video.videoWidth}×${video.videoHeight}`:'—');q('#vmFps').textContent=`${track?.frameRate?fmt(track.frameRate,0):'—'} fps`;
  q('#vmBitrate').textContent=bit?`${fmt(bit,2)} Mbps`:'—';q('#vmBandwidth').textContent=Number.isFinite(bw)?`${fmt(bw,1)} Mbps`:'—';q('#vmHeadroom').textContent=Number.isFinite(head)?`${fmt(head,2)}×`:'—';q('#vmBuffer').textContent=`${fmt(buf,1)} s`;q('#vmStartup').textContent=Number.isFinite(test.startupMs)?`${Math.round(test.startupMs)} ms`:'—';q('#vmRebuffer').textContent=`${test.rebuffers}×`;q('#vmRebufferTime').textContent=`${fmt(test.rebufferMs/1000,1)} s total`;q('#vmDropped').textContent=Number.isFinite(dropPct)?`${fmt(dropPct,2)}%`:'—';q('#vmDecoded').textContent=`${frames.totalVideoFrames||0} decoded`;q('#vmData').textContent=`${fmt(test.bytes/1e6,1)} MB`;
  q('#vmCodec').textContent=(track?.videoCodec||track?.codecs||'—').split(',')[0];q('#vmAudio').textContent=`audio ${track?.audioCodec||'—'}`;q('#vmChanges').textContent=String(test.networkChanges);q('#vmRecommended').textContent=rec?`${rec.height===2160?'4K':`${rec.height}p`}`:'—';
  const score=scoreNow();paintVerdict(score,false);
  const title=q('#videoAnalysisTitle'),text=q('#videoAnalysisText');if(Number.isFinite(head)&&head<1){title.textContent='Bandwidth di bawah bitrate stream';text.textContent=`Headroom hanya ${fmt(head,2)}×. Buffering kemungkinan meningkat jika kondisi ini bertahan.`}else if(test.rebuffers>0){title.textContent='Rebuffer terdeteksi';text.textContent=`Video sudah berhenti ${test.rebuffers} kali selama ${fmt(test.rebufferMs/1000,1)} detik. Coba resolusi lebih rendah.`}else if(Number.isFinite(head)&&head>=1.5&&buf>=5){title.textContent='Playback punya headroom sehat';text.textContent=`Bandwidth sekitar ${fmt(head,2)}× bitrate stream dengan buffer ${fmt(buf,1)} detik.`}else{title.textContent='Mengumpulkan data playback';text.textContent='Sistem sedang menunggu cukup sampel bandwidth, buffer, frame, dan stall.'}
}
function paintVerdict(score,final){
  const v=q('#videoVerdict');if(!v)return;let cls='neutral',label='Mengukur';if(Number.isFinite(score)){if(score>=90){cls='good';label='Sangat kuat'}else if(score>=78){cls='good';label='Kuat'}else if(score>=65){cls='warn';label='Cukup'}else if(score>=50){cls='orange';label='Rawan buffering'}else{cls='bad';label='Tidak disarankan'}}
  v.className=`video-verdict ${cls}`;v.querySelector('.video-score strong').textContent=Number.isFinite(score)?score:'—';v.querySelector('b').textContent=final?`${label} untuk resolusi ini`:label;
  if(final){const r=recommendation(),target=selectedHeight(),actual=test?.track?.height||target;v.querySelector('p').textContent=r?`Tes ${actual===2160?'4K':`${actual}p`} selesai. Resolusi aman berdasarkan bandwidth konservatif dan stall: ${r.height===2160?'4K':`${r.height}p`}.`:'Tes selesai; data bandwidth belum cukup untuk rekomendasi resolusi.'}
}
function beginPlaybackClock(duration,target){
  if(!test?.running||test.clockStartedAt)return;test.clockStartedAt=performance.now();
  tickTimer=setInterval(()=>{if(!test?.running||!test.clockStartedAt)return;paintLive();const elapsed=(performance.now()-test.clockStartedAt)/1000,progress=clamp(elapsed/duration,0,1);q('#videoProgressBar').style.width=`${progress*100}%`;q('#videoProgressText').textContent=`${Math.min(duration,elapsed).toFixed(0)} / ${duration} detik · ${test.track?.height||target}p locked`;if(progress>=1)finishTest('complete')},500);
}
async function destroyPlayer(){clearInterval(tickTimer);clearTimeout(timer);tickTimer=timer=null;try{q('#videoLabPlayer')?.pause()}catch{}try{await player?.destroy?.()}catch{}player=null}
async function startTest(){
  if(test?.running)return;const startBtn=q('#startVideoTest'),stopBtn=q('#stopVideoTest'),video=q('#videoLabPlayer'),target=selectedHeight(),duration=Number(q('#videoTestDuration').value)||30;
  startBtn.disabled=true;stopBtn.disabled=false;q('#resolutionPicker').querySelectorAll('button').forEach(b=>b.disabled=true);q('#videoTestDuration').disabled=true;q('#videoProgressBar').style.width='0';setOverlay('MENYIAPKAN','Memuat stream…','Kualitas akan dikunci pada track terdekat.',true);setLive('LOAD');await destroyPlayer();
  test={running:true,target,duration,startedAt:performance.now(),loadStartedAt:0,playStartedAt:0,clockStartedAt:0,startupMs:NaN,rebuffers:0,rebufferMs:0,waitingAt:0,bytes:0,bandwidthSamples:[],bufferSamples:[],networkChanges:0,tracks:[],track:null};
  try{
    const shaka=await loadShaka();if(!shaka.Player.isBrowserSupported())throw new Error('Browser ini tidak didukung untuk adaptive media test.');
    player=new shaka.Player();await player.attach(video);player.configure({abr:{enabled:false}});
    const net=player.getNetworkingEngine();net?.registerResponseFilter((type,response)=>{const n=response?.data?.byteLength||0;if(test?.running&&Number.isFinite(n))test.bytes+=n});
    player.addEventListener('error',e=>{if(test?.running)q('#videoAnalysisText').textContent=`Player error ${e.detail?.code||''}.`});
    video.muted=true;video.playsInline=true;
    const onWaiting=()=>{if(!test?.running||!test.playStartedAt||video.paused)return;if(!test.waitingAt){test.waitingAt=performance.now();test.rebuffers++}};
    const onPlaying=()=>{if(!test?.running)return;const now=performance.now();if(!test.playStartedAt){test.playStartedAt=now;test.startupMs=now-(test.loadStartedAt||test.startedAt);beginPlaybackClock(duration,target)}else if(test.waitingAt){test.rebufferMs+=now-test.waitingAt;test.waitingAt=0}const actual=test.track?.height||target;setOverlay('LIVE',`${actual===2160?'4K':`${actual}p`} streaming test`,'Tonton video sambil metrik jaringan dianalisis.',false);setLive('LIVE')};
    video.addEventListener('waiting',onWaiting);video.addEventListener('playing',onPlaying);
    test.cleanup=()=>{video.removeEventListener('waiting',onWaiting);video.removeEventListener('playing',onPlaying)};
    const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection,connChange=()=>{if(test?.running)test.networkChanges++};conn?.addEventListener?.('change',connChange);test.connCleanup=()=>conn?.removeEventListener?.('change',connChange);
    test.loadStartedAt=performance.now();await player.load(VIDEO_MANIFEST);test.tracks=player.getVariantTracks().filter(t=>Number.isFinite(t.height));const track=chooseTrack(test.tracks,target);if(!track)throw new Error('Track video tidak tersedia.');test.track=track;player.selectVariantTrack(track,true,0);video.currentTime=0;
    try{await video.play()}catch(e){setOverlay('TEKAN PLAY','Autoplay diblokir browser','Tekan tombol Play pada video; countdown baru dimulai setelah video benar-benar playing.',false);setLive('PAUSED')}
  }catch(e){console.error('[video-test]',e);setOverlay('GAGAL','Video test tidak dapat dimulai',e.message||'Periksa koneksi dan coba lagi.',true);setLive('ERROR');await finishTest('error')}
}
async function finishTest(reason='complete'){
  if(!test)return;const wasRunning=test.running;if(test.waitingAt){test.rebufferMs+=performance.now()-test.waitingAt;test.waitingAt=0}test.running=false;clearInterval(tickTimer);tickTimer=null;test.cleanup?.();test.connCleanup?.();if(wasRunning)paintLive();const score=scoreNow();paintVerdict(score,true);setLive(reason==='error'?'ERROR':'DONE');q('#videoProgressBar').style.width=reason==='complete'?'100%':q('#videoProgressBar').style.width;q('#videoProgressText').textContent=reason==='complete'?'Test selesai':reason==='error'?'Test gagal':'Test dihentikan';q('#startVideoTest').disabled=false;q('#stopVideoTest').disabled=true;q('#resolutionPicker').querySelectorAll('button').forEach(b=>b.disabled=false);q('#videoTestDuration').disabled=false;try{q('#videoLabPlayer').pause()}catch{}if(reason!=='error')setOverlay('SELESAI',`${selectedHeight()===2160?'4K':`${selectedHeight()}p`} · score ${Number.isFinite(score)?score:'—'}/100`,'Lihat rekomendasi dan detail playback di panel kanan.',false)
}
async function openLab(){installLab();const lab=q('#videoTestLab');lab.hidden=false;lab.setAttribute('aria-hidden','false');document.documentElement.classList.add('video-lab-open');setTimeout(()=>q('#startVideoTest')?.focus(),60)}
async function closeLab(){await destroyPlayer();if(test){test.running=false;test.cleanup?.();test.connCleanup?.()}test=null;const lab=q('#videoTestLab');if(lab){lab.hidden=true;lab.setAttribute('aria-hidden','true')}document.documentElement.classList.remove('video-lab-open');setLive('IDLE')}

let tries=0;const boot=setInterval(()=>{tries++;if(q('.command-actions')){clearInterval(boot);installButton();installLab()}else if(tries>120)clearInterval(boot)},50);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!q('#videoTestLab')?.hidden)closeLab()});
window.wifiVideoTest={open:openLab,close:closeLab,manifest:VIDEO_MANIFEST,playerVersion:'5.2.7'};
