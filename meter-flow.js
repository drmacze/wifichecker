const q=(s)=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let unit='Mbps';

function waitForGauge(){
  return new Promise(resolve=>{
    let tries=0;
    const tick=()=>{
      const gauge=q('.clean-gauge'),oldNeedle=q('#gaugeNeedle'),oldProgress=q('#gaugeProgress');
      if(gauge&&oldNeedle&&oldProgress)return resolve({gauge,oldNeedle,oldProgress});
      if(++tries<120)setTimeout(tick,50);
    };
    tick();
  });
}
function prettyScale(v,kind){
  const baseline=kind==='upload'?100:200;
  const tiers=[100,200,300,500,750,1000,1500,2000,2500,5000,10000];
  const wanted=Math.max(baseline,v*1.14);
  return tiers.find(x=>x>=wanted)||Math.ceil(wanted/5000)*5000;
}
function displayValue(mbps){
  const select=q('#speedUnitSelect');const mode=select?.value||'auto';
  if(mode==='gbps'||(mode==='auto'&&mbps>=1000))return{v:mbps/1000,u:'Gbps',d:2};
  if(mode==='kbps'||(mode==='auto'&&mbps<1))return{v:mbps*1000,u:'Kbps',d:mbps<.1?1:0};
  if(mode==='MBps')return{v:mbps/8,u:'MB/s',d:2};
  return{v:mbps,u:'Mbps',d:mbps>=100?0:1};
}

waitForGauge().then(({gauge,oldNeedle,oldProgress})=>{
  oldNeedle.style.opacity='0';
  oldProgress.style.opacity='0';
  const progress=oldProgress.cloneNode(true);progress.id='flowGaugeProgress';progress.classList.add('flow-gauge-progress');progress.style.opacity='1';oldProgress.after(progress);
  const needle=oldNeedle.cloneNode(true);needle.id='flowGaugeNeedle';needle.classList.add('flow-gauge-needle');needle.style.opacity='1';oldNeedle.after(needle);

  const card=q('.meter-card');
  const steps=document.createElement('div');steps.className='phase-steps';steps.innerHTML='<span data-phase="ping"><i></i>Ping</span><span data-phase="download"><i></i>Download</span><span data-phase="upload"><i></i>Upload</span>';
  const top=card?.querySelector('.instrument-top');top?.after(steps);

  const transition=document.createElement('div');transition.className='phase-transition';transition.innerHTML='<span id="phaseTransitionLabel">SIAP</span><strong id="phaseTransitionValue">Tekan GO untuk mulai</strong><small id="phaseTransitionMeta">Pengukuran menggunakan traffic nyata ke Cloudflare edge.</small>';
  const readouts=q('.meter-readouts');if(readouts)readouts.before(transition);else card?.append(transition);

  const state={angle:135,targetAngle:135,raw:0,targetRaw:0,max:200,kind:'idle',label:'SPEED TEST',last:performance.now()};
  const valueEl=q('#gaugeValue'),unitEl=q('#gaugeUnit'),labelEl=q('#gaugeLabel');

  function setScale(){
    const half=displayValue(state.max/2),full=displayValue(state.max);
    const mid=q('#gaugeMid'),max=q('#gaugeMax');if(mid)mid.textContent=String(Number(half.v.toFixed(half.d)));if(max)max.textContent=`${Number(full.v.toFixed(full.d))} ${full.u}`;
  }
  function setTarget(raw,kind,label){
    if(!Number.isFinite(raw))return;
    if(kind!==state.kind){state.kind=kind;state.max=kind==='upload'?100:200;state.targetRaw=0;state.targetAngle=135;}
    state.max=Math.max(state.max,prettyScale(raw,kind));state.targetRaw=raw;state.targetAngle=135+clamp(raw/state.max,0,1)*270;state.label=label||kind.toUpperCase();setScale();
  }
  function frame(now){
    const dt=Math.min(50,now-state.last);state.last=now;
    const response=reduced?1:1-Math.exp(-dt/145);
    const numberResponse=reduced?1:1-Math.exp(-dt/115);
    state.angle+=(state.targetAngle-state.angle)*response;state.raw+=(state.targetRaw-state.raw)*numberResponse;
    needle.setAttribute('transform',`rotate(${state.angle.toFixed(3)} 160 160)`);
    const ratio=clamp((state.angle-135)/270,0,1);progress.style.strokeDashoffset=String(100-ratio*100);
    const shown=displayValue(Math.max(0,state.raw));if(valueEl)valueEl.textContent=shown.v.toFixed(shown.d);if(unitEl)unitEl.textContent=shown.u;if(labelEl)labelEl.textContent=state.label;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function setStep(phase,status){
    q('.phase-steps')?.querySelectorAll('span').forEach(el=>{
      const same=el.dataset.phase===phase;
      if(same&&status==='running'){el.classList.add('active');el.classList.remove('done')}
      if(same&&status==='result'){el.classList.remove('active');el.classList.add('done')}
    });
  }
  function showTransition(label,value,meta,tone='neutral'){
    const box=q('.phase-transition');if(!box)return;
    box.classList.remove('show','tone-green','tone-yellow','tone-orange','tone-red');
    void box.offsetWidth;
    if(tone!=='neutral')box.classList.add(`tone-${tone}`);
    q('#phaseTransitionLabel').textContent=label;q('#phaseTransitionValue').textContent=value;q('#phaseTransitionMeta').textContent=meta||'';box.classList.add('show');
  }
  function latencyTone(v){return v<=30?'green':v<=60?'yellow':v<=100?'orange':'red'}
  function speedTone(v,kind){if(kind==='upload')return v>=20?'green':v>=10?'yellow':v>=3?'orange':'red';return v>=50?'green':v>=25?'yellow':v>=10?'orange':'red'}

  window.addEventListener('wifi-test-phase',e=>{
    const d=e.detail||{};if(!d.phase)return;
    setStep(d.phase,d.status);
    if(d.status==='running'){
      const names={ping:'PING',download:'DOWNLOAD',upload:'UPLOAD'};
      showTransition(names[d.phase]||'MENGUKUR','Sedang mengukur…',d.phase==='ping'?'Mengambil beberapa sampel latency nyata.':'Meter mengikuti setiap sampel transfer secara kontinu.');
    }
    if(d.status==='result'){
      if(d.phase==='ping')showTransition('PING SELESAI',`${Number(d.value).toFixed(1)} ms`,'Latency idle sudah terkunci. Berikutnya mengukur download.',latencyTone(Number(d.value)));
      else showTransition(`${d.phase.toUpperCase()} SELESAI`,`${Number(d.value).toFixed(1)} Mbps`,d.message||'Hasil fase dikunci sebelum lanjut.',speedTone(Number(d.value),d.phase));
    }
    if(d.status==='sample'&&Number.isFinite(Number(d.value)))setTarget(Number(d.value),d.phase,d.phase.toUpperCase());
  });

  const legacyLabel=q('#dialLabel'),legacyValue=q('#dialValue');
  function syncLegacy(){
    const label=(legacyLabel?.textContent||'').toUpperCase(),raw=parseFloat(legacyValue?.textContent);if(!Number.isFinite(raw))return;
    if(label.includes('LIVE DOWNLOAD'))setTarget(raw,'download','DOWNLOAD');
    if(label.includes('LIVE UPLOAD'))setTarget(raw,'upload','UPLOAD');
  }
  [legacyLabel,legacyValue].filter(Boolean).forEach(el=>new MutationObserver(syncLegacy).observe(el,{childList:true,characterData:true,subtree:true}));

  const engine=q('#engineState');
  if(engine)new MutationObserver(()=>{
    const s=engine.textContent.trim().toUpperCase();
    if(s==='RUNNING'){q('.phase-steps')?.querySelectorAll('span').forEach(el=>el.classList.remove('done','active'))}
    if(s==='COMPLETE'){
      q('.phase-steps')?.querySelectorAll('span').forEach(el=>{el.classList.remove('active');el.classList.add('done')});
      const down=parseFloat(q('#downloadValue')?.textContent);if(Number.isFinite(down))setTarget(down,'download','HASIL DOWNLOAD');
      showTransition('TES SELESAI','Semua pengukuran selesai','Ping, download, upload, loaded latency, dan DNS telah diproses.','green');
    }
  }).observe(engine,{childList:true,characterData:true,subtree:true});

  q('#speedUnitSelect')?.addEventListener('change',()=>{setScale()});
}).catch(()=>{});
