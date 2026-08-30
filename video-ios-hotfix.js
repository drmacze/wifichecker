const q=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=(v,d=1)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
const HLS_SOURCES=[
  'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls-apple/master.m3u8',
  'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',
  'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8'
];
let state=null;

function isIOSFamily(){const ua=navigator.userAgent||'';return /iPad|iPhone|iPod/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}
function attrMap(line){const out={};for(const m of line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))out[m[1]]=m[2]?.replace(/^"|"$/g,'');return out}
function parseMaster(text,base){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),tracks=[];
  for(let i=0;i<lines.length;i++){
    if(!lines[i].startsWith('#EXT-X-STREAM-INF:'))continue;
    const a=attrMap(lines[i].slice(18));let uri='';
    for(let j=i+1;j<lines.length;j++){if(!lines[j].startsWith('#')){uri=lines[j];break}if(lines[j].startsWith('#EXT-X-STREAM-INF:'))break}
    if(!uri)continue;
    const [width,height]=(a.RESOLUTION||'0x0').split('x').map(Number);
    tracks.push({width:width||0,height:height||0,bandwidth:Number(a['AVERAGE-BANDWIDTH']||a.BANDWIDTH)||NaN,frameRate:Number(a['FRAME-RATE'])||NaN,codecs:a.CODECS||'',url:new URL(uri,base).href});
  }
  return tracks;
}
async function discover(){
  const masters=[];
  for(const url of HLS_SOURCES){
    try{
      const r=await fetch(`${url}${url.includes('?')?'&':'?'}wc=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const tracks=parseMaster(await r.text(),url);masters.push({url,tracks});
      if(tracks.length)return{url,tracks};
    }catch(e){console.warn('[video-ios] manifest discovery',url,e)}
  }
  return masters[0]||{url:HLS_SOURCES[0],tracks:[]};
}
function chooseTrack(tracks,target){const valid=tracks.filter(t=>t.height>0);if(!valid.length)return null;return valid.slice().sort((a,b)=>Math.abs(a.height-target)-Math.abs(b.height-target)||a.height-b.height)[0]}
function selectedHeight(){return Number(q('#resolutionPicker .active')?.dataset.height)||1080}
function bufferAhead(video){if(!video?.buffered?.length)return 0;for(let i=0;i<video.buffered.length;i++){if(video.currentTime>=video.buffered.start(i)&&video.currentTime<=video.buffered.end(i))return Math.max(0,video.buffered.end(i)-video.currentTime)}return 0}
function frames(video){try{return video.getVideoPlaybackQuality?.()||{totalVideoFrames:0,droppedVideoFrames:0}}catch{return{totalVideoFrames:0,droppedVideoFrames:0}}}
function bandwidthBaseline(){const v=Number(window.wifiMeasurementSession?.phases?.download?.value);if(Number.isFinite(v)&&v>0)return{value:v,source:'Engine v5'};const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection,d=Number(c?.downlink);return Number.isFinite(d)&&d>0?{value:d,source:'Network API'}:{value:NaN,source:'Playback only'}}
function setText(sel,text){const el=q(sel);if(el&&el.textContent!==text)el.textContent=text}
function setLive(text){setText('#videoLiveState',text);q('.video-live-badge')?.classList.toggle('running',text==='LIVE')}
function overlay(label,value,meta,hidden=false){const o=q('#videoOverlay');if(!o)return;setText('#videoOverlay span',label);setText('#videoOverlay b',value);setText('#videoOverlay small',meta);o.classList.toggle('hidden',hidden)}
function setControls(running){const start=q('#startVideoTest'),stop=q('#stopVideoTest'),duration=q('#videoTestDuration');if(start)start.disabled=running;if(stop)stop.disabled=!running;if(duration)duration.disabled=running;q('#resolutionPicker')?.querySelectorAll('button').forEach(b=>b.disabled=running)}
function resetMetrics(){['#vmResolution','#vmBitrate','#vmBandwidth','#vmHeadroom','#vmBuffer','#vmStartup','#vmRebuffer','#vmDropped','#vmData','#vmCodec','#vmRecommended'].forEach(s=>setText(s,'—'));setText('#vmFps','— fps');setText('#vmBandwidthSource','native HLS');setText('#vmRebufferTime','0.0 s total');setText('#vmDecoded','— decoded');setText('#vmAudio','audio —');setText('#vmChanges','0');const bar=q('#videoProgressBar');if(bar)bar.style.width='0';setText('#videoProgressText','Menyiapkan native HLS…')}
function score(){
  if(!state)return NaN;const video=q('#videoLabPlayer'),f=frames(video),drop=f.totalVideoFrames?f.droppedVideoFrames/f.totalVideoFrames:0,buf=bufferAhead(video),base=bandwidthBaseline(),bit=(state.track?.bandwidth||0)/1e6,head=bit>0&&Number.isFinite(base.value)?base.value/bit:NaN;
  const hs=Number.isFinite(head)?(head>=2?100:head>=1.5?90:head>=1.2?76:head>=1?58:head>=.8?38:18):72;
  const bs=buf>=10?100:buf>=6?90:buf>=3?72:buf>=1.5?50:30;
  const ss=state.rebuffers===0?100:clamp(88-state.rebuffers*20-state.rebufferMs/1000*8,0,88);
  const ds=drop<=.005?100:drop<=.02?82:drop<=.05?58:drop<=.1?35:15;
  const us=!Number.isFinite(state.startupMs)?60:state.startupMs<=1200?100:state.startupMs<=2500?88:state.startupMs<=4500?68:state.startupMs<=7000?45:25;
  return Math.round(hs*.26+bs*.26+ss*.28+ds*.10+us*.10);
}
function paintVerdict(final=false){const box=q('#videoVerdict');if(!box)return;const s=score();let cls='neutral',label='Mengukur';if(Number.isFinite(s)){if(s>=90){cls='good';label='Sangat kuat'}else if(s>=78){cls='good';label='Kuat'}else if(s>=65){cls='warn';label='Cukup'}else if(s>=50){cls='orange';label='Rawan buffering'}else{cls='bad';label='Tidak disarankan'}}box.className=`video-verdict ${cls}`;setText('#videoVerdict .video-score strong',Number.isFinite(s)?String(s):'—');setText('#videoVerdict b',final?`${label} untuk resolusi ini`:label);if(final){const actual=q('#videoLabPlayer')?.videoHeight||state?.track?.height||state?.target;setText('#videoVerdict p',`Playback ${actual===2160?'4K':`${actual}p`} diuji langsung lewat native HLS Safari. ${state?.adaptiveFallback?'Master adaptive dipakai karena metadata variant tidak dapat dibaca.':'Variant resolusi terdekat berhasil dipilih.'}`)}}
function paint(){
  if(!state)return;const video=q('#videoLabPlayer'),f=frames(video),buf=bufferAhead(video),base=bandwidthBaseline(),bit=(state.track?.bandwidth||0)/1e6,head=bit>0&&Number.isFinite(base.value)?base.value/bit:NaN,drop=f.totalVideoFrames?f.droppedVideoFrames/f.totalVideoFrames*100:NaN,actualH=video.videoHeight||state.track?.height||0,actualW=video.videoWidth||state.track?.width||0;
  setText('#vmResolution',actualH?`${actualW||'—'}×${actualH}`:'—');setText('#vmFps',`${state.track?.frameRate?fmt(state.track.frameRate,0):'—'} fps`);setText('#vmBitrate',bit?`${fmt(bit,2)} Mbps`:(state.adaptiveFallback?'Adaptive':'—'));setText('#vmBandwidth',Number.isFinite(base.value)?`${fmt(base.value,1)} Mbps`:'—');setText('#vmBandwidthSource',base.source);setText('#vmHeadroom',Number.isFinite(head)?`${fmt(head,2)}×`:'—');setText('#vmBuffer',`${fmt(buf,1)} s`);setText('#vmStartup',Number.isFinite(state.startupMs)?`${Math.round(state.startupMs)} ms`:'—');setText('#vmRebuffer',`${state.rebuffers}×`);setText('#vmRebufferTime',`${fmt(state.rebufferMs/1000,1)} s total`);setText('#vmDropped',Number.isFinite(drop)?`${fmt(drop,2)}%`:'—');setText('#vmDecoded',`${f.totalVideoFrames||0} decoded`);setText('#vmData','Native managed');setText('#vmCodec',state.track?.codecs?.split(',')[0]||'HLS native');setText('#vmAudio','audio native');setText('#vmChanges',String(state.networkChanges));
  let rec=actualH||state.target;if(Number.isFinite(base.value)&&state.tracks?.length){const safe=base.value*1e6/1.4,valid=state.tracks.filter(t=>Number.isFinite(t.bandwidth)&&t.bandwidth<=safe).sort((a,b)=>a.height-b.height);if(valid.length)rec=valid.at(-1).height}setText('#vmRecommended',rec?`${rec===2160?'4K':`${rec}p`}`:'—');
  const title=q('#videoAnalysisTitle'),text=q('#videoAnalysisText');if(state.rebuffers>0){if(title)title.textContent='Rebuffer terdeteksi';if(text)text.textContent=`Playback berhenti ${state.rebuffers} kali selama ${fmt(state.rebufferMs/1000,1)} detik.`}else if(buf>=5){if(title)title.textContent='Native HLS berjalan stabil';if(text)text.textContent=`Buffer ${fmt(buf,1)} detik${Number.isFinite(head)?` · headroom ${fmt(head,2)}×`:''}.`}else{if(title)title.textContent='Mengumpulkan data playback';if(text)text.textContent='Safari sedang membangun buffer dan statistik frame.'}paintVerdict(false);
}
function cleanup(){if(!state)return;clearInterval(state.timer);clearTimeout(state.timeout);state.connCleanup?.();state.listeners?.forEach(([el,name,fn])=>el.removeEventListener(name,fn));state=null}
function addListener(el,name,fn){el.addEventListener(name,fn);state.listeners.push([el,name,fn])}
async function startIOS(){
  cleanup();const video=q('#videoLabPlayer');if(!video)return;const target=selectedHeight(),duration=Number(q('#videoTestDuration')?.value)||30;setControls(true);resetMetrics();overlay('MENYIAPKAN','Memuat native HLS…','Safari akan mencoba variant resolusi terdekat, lalu master adaptive jika perlu.');setLive('LOAD');
  state={target,duration,started:performance.now(),playingAt:0,startupMs:NaN,rebuffers:0,rebufferMs:0,waitingAt:0,networkChanges:0,track:null,tracks:[],adaptiveFallback:false,listeners:[],timer:null,timeout:null};
  const conn=navigator.connection||navigator.mozConnection||navigator.webkitConnection,connChange=()=>{if(state)state.networkChanges++};conn?.addEventListener?.('change',connChange);state.connCleanup=()=>conn?.removeEventListener?.('change',connChange);
  try{
    video.pause();video.removeAttribute('src');video.load();video.muted=true;video.playsInline=true;
    const found=await discover();if(!state)return;state.tracks=found.tracks;state.track=chooseTrack(found.tracks,target);let primary=state.track?.url||found.url;if(!state.track)state.adaptiveFallback=true;
    const onWaiting=()=>{if(state?.playingAt&&!video.paused&&!state.waitingAt){state.waitingAt=performance.now();state.rebuffers++}};
    const onPlaying=()=>{if(!state)return;const now=performance.now();if(!state.playingAt){state.playingAt=now;state.startupMs=now-state.started}else if(state.waitingAt){state.rebufferMs+=now-state.waitingAt;state.waitingAt=0}setLive('LIVE');overlay('LIVE',`${video.videoHeight||state.track?.height||target}p native HLS`,'Playback Safari sedang dianalisis.',true)};
    addListener(video,'waiting',onWaiting);addListener(video,'playing',onPlaying);
    const candidates=[primary,...HLS_SOURCES.filter(x=>x!==primary)];let loaded=false,lastError=null;
    for(const src of candidates){
      if(!state)return;try{
        await new Promise((resolve,reject)=>{let done=false;const clear=()=>{video.removeEventListener('loadedmetadata',ok);video.removeEventListener('error',bad);clearTimeout(to)};const ok=()=>{if(done)return;done=true;clear();resolve()};const bad=()=>{if(done)return;done=true;clear();reject(new Error(`Media error ${video.error?.code||'unknown'}`))};const to=setTimeout(()=>{if(done)return;done=true;clear();reject(new Error('Timeout memuat HLS'))},8000);video.addEventListener('loadedmetadata',ok,{once:true});video.addEventListener('error',bad,{once:true});video.src=src;video.load()});loaded=true;if(src!==primary)state.adaptiveFallback=true;break
      }catch(e){lastError=e;console.warn('[video-ios] source fallback',src,e)}
    }
    if(!loaded)throw lastError||new Error('Semua sumber HLS gagal dimuat.');
    try{await video.play()}catch(e){overlay('TEKAN PLAY','Safari menunggu interaksi','Tekan tombol Play pada video. Tes mulai saat video benar-benar berjalan.');setLive('PAUSED')}
    state.timeout=setTimeout(()=>{if(state&&!state.playingAt){overlay('BELUM BERJALAN','Tekan Play pada video','Safari belum mengirim event playing.');setLive('PAUSED')}},5000);
    state.timer=setInterval(()=>{if(!state)return;if(state.waitingAt&&video.readyState>=3){state.rebufferMs+=performance.now()-state.waitingAt;state.waitingAt=0}paint();if(!state.playingAt)return;const elapsed=(performance.now()-state.playingAt)/1000,p=clamp(elapsed/duration,0,1);const bar=q('#videoProgressBar');if(bar)bar.style.width=`${p*100}%`;setText('#videoProgressText',`${Math.min(duration,elapsed).toFixed(0)} / ${duration} detik · native HLS`);if(p>=1)finishIOS('complete')},500);
  }catch(e){console.error('[video-ios]',e);overlay('GAGAL','Video HLS tidak dapat diputar',e.message||'Periksa koneksi dan coba lagi.');setLive('ERROR');setText('#videoProgressText','Test gagal');setControls(false);paintVerdict(true);cleanup()}
}
function finishIOS(reason='stopped'){if(!state)return;const snapshot=state;if(snapshot.waitingAt)snapshot.rebufferMs+=performance.now()-snapshot.waitingAt;paint();paintVerdict(true);const video=q('#videoLabPlayer');try{video?.pause()}catch{}const bar=q('#videoProgressBar');if(reason==='complete'&&bar)bar.style.width='100%';setText('#videoProgressText',reason==='complete'?'Test selesai':'Test dihentikan');setLive('DONE');setControls(false);clearInterval(snapshot.timer);clearTimeout(snapshot.timeout);snapshot.connCleanup?.();snapshot.listeners?.forEach(([el,name,fn])=>el.removeEventListener(name,fn));state=null}

if(isIOSFamily()){
  document.addEventListener('click',e=>{const start=e.target.closest?.('#startVideoTest');if(start){e.preventDefault();e.stopImmediatePropagation();startIOS();return}const stop=e.target.closest?.('#stopVideoTest');if(stop){e.preventDefault();e.stopImmediatePropagation();finishIOS('stopped');return}if(e.target.closest?.('[data-video-close]'))cleanup()},true);
  window.addEventListener('keydown',e=>{if(e.key==='Escape')cleanup()},true);
  document.documentElement.dataset.videoIosMode='native-hls-v2';
}
window.wifiVideoIOSFix={enabled:isIOSFamily(),sources:HLS_SOURCES.slice(),version:2};
