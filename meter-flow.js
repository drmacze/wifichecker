const q=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

function waitForGauge(){return new Promise(resolve=>{let tries=0;const tick=()=>{const gauge=q('.clean-gauge'),oldNeedle=q('#gaugeNeedle'),oldProgress=q('#gaugeProgress'),oldCenter=q('.clean-gauge .gauge-center'),oldLabels=q('.clean-gauge .gauge-labels');if(gauge&&oldNeedle&&oldProgress&&oldCenter&&oldLabels)return resolve({gauge,oldNeedle,oldProgress,oldCenter,oldLabels});if(++tries<160)setTimeout(tick,50)};tick()})}
function prettyScale(v){const tiers=[10,25,50,75,100,150,200,300,500,750,1000,1500,2000,2500,5000,10000],wanted=Math.max(10,v*1.22);return tiers.find(x=>x>=wanted)||Math.ceil(wanted/5000)*5000}
let unitMode='auto';
function displayValue(mbps){const mode=unitMode;if(mode==='gbps'||(mode==='auto'&&mbps>=1000))return{v:mbps/1000,u:'Gbps',d:2};if(mode==='kbps'||(mode==='auto'&&mbps<1))return{v:mbps*1000,u:'Kbps',d:mbps<.1?1:0};if(mode==='MBps')return{v:mbps/8,u:'MB/s',d:2};return{v:mbps,u:'Mbps',d:mbps>=100?0:1}}
function sessionValue(kind){const p=window.wifiMeasurementSession?.phases?.[kind],v=Number(p?.value ?? (kind==='ping'?p?.ping:NaN));return Number.isFinite(v)?v:NaN}

waitForGauge().then(({gauge,oldNeedle,oldProgress,oldCenter,oldLabels})=>{
  const unitSelect=q('#speedUnitSelect');unitMode=unitSelect?.value||'auto';
  oldNeedle.style.opacity='0';oldProgress.style.opacity='0';oldCenter.style.opacity='0';oldLabels.style.opacity='0';
  const progress=oldProgress.cloneNode(true);progress.id='flowGaugeProgress';progress.classList.add('flow-gauge-progress');progress.style.opacity='1';oldProgress.after(progress);
  const needle=oldNeedle.cloneNode(true);needle.id='flowGaugeNeedle';needle.classList.add('flow-gauge-needle');needle.style.opacity='1';oldNeedle.after(needle);
  const center=oldCenter.cloneNode(true);center.classList.add('flow-gauge-center');center.style.opacity='1';center.querySelector('#gaugeLabel').id='flowGaugeLabel';center.querySelector('#gaugeValue').id='flowGaugeValue';center.querySelector('#gaugeUnit').id='flowGaugeUnit';oldCenter.after(center);
  const labels=oldLabels.cloneNode(true);labels.classList.add('flow-gauge-labels');labels.style.opacity='1';labels.querySelector('#gaugeMid').id='flowGaugeMid';labels.querySelector('#gaugeMax').id='flowGaugeMax';oldLabels.after(labels);

  const card=q('.meter-card'),steps=document.createElement('div');steps.className='phase-steps';steps.innerHTML='<span data-phase="ping"><i></i>Ping</span><span data-phase="download"><i></i>Download</span><span data-phase="upload"><i></i>Upload</span>';card?.querySelector('.instrument-top')?.after(steps);
  const transition=document.createElement('div');transition.className='phase-transition show';transition.innerHTML='<span id="phaseTransitionLabel">SIAP</span><strong id="phaseTransitionValue">Tekan GO untuk mulai</strong><small id="phaseTransitionMeta">Pengukuran menggunakan traffic nyata ke Cloudflare edge.</small>';const readouts=q('.meter-readouts');if(readouts)readouts.before(transition);else card?.append(transition);

  const valueEl=q('#flowGaugeValue'),unitEl=q('#flowGaugeUnit'),labelEl=q('#flowGaugeLabel'),scaleMid=q('#flowGaugeMid'),scaleMax=q('#flowGaugeMax');
  const readoutDown=q('#meterDown'),readoutUp=q('#meterUp'),readoutPing=q('#meterPing'),phaseLabel=q('#phaseTransitionLabel'),phaseValue=q('#phaseTransitionValue'),phaseMeta=q('#phaseTransitionMeta');
  const state={angle:135,targetAngle:135,raw:0,targetRaw:0,max:100,kind:'idle',label:'SPEED TEST',last:performance.now(),lastValue:'',lastUnit:'',lastLabel:'',lastDash:'',lastTransform:'',lastScale:-1,lastReadoutAt:0,lastSampleUiAt:0};

  function setText(el,text){if(el&&el.textContent!==text)el.textContent=text}
  function writeLiveReadout(kind,raw,force=false){
    const now=performance.now();if(!force&&now-state.lastReadoutAt<120)return;state.lastReadoutAt=now;const c=displayValue(raw),el=kind==='download'?readoutDown:readoutUp;if(!el)return;const value=c.v.toFixed(c.d),small=el.querySelector('small');if(el.firstChild?.nodeType===3){const wanted=`${value} `;if(el.firstChild.nodeValue!==wanted)el.firstChild.nodeValue=wanted}else el.textContent=`${value} `;if(small)setText(small,c.u);else{const s=document.createElement('small');s.textContent=c.u;el.append(s)}}
  function setScale(force=false){if(!force&&state.lastScale===state.max)return;state.lastScale=state.max;const half=displayValue(state.max/2),full=displayValue(state.max);setText(scaleMid,String(Number(half.v.toFixed(half.d))));setText(scaleMax,`${Number(full.v.toFixed(full.d))} ${full.u}`)}
  function setTarget(raw,kind,label){if(!Number.isFinite(raw))return;const nextScale=prettyScale(raw),changedKind=kind!==state.kind;let scaleChanged=false;if(changedKind){state.kind=kind;state.max=nextScale;state.targetRaw=0;state.targetAngle=135;scaleChanged=true}else if(nextScale>state.max){state.max=nextScale;scaleChanged=true}state.targetRaw=raw;state.targetAngle=135+clamp(raw/state.max,0,1)*270;state.label=label||kind.toUpperCase();gauge.dataset.metric=kind;if(scaleChanged)setScale()}
  function frame(now){
    const dt=Math.min(40,Math.max(1,now-state.last));state.last=now;const moving=Math.abs(state.targetAngle-state.angle)>.002||Math.abs(state.targetRaw-state.raw)>.002;
    if(moving){const response=reduced?1:1-Math.exp(-dt/185),numberResponse=reduced?1:1-Math.exp(-dt/145);state.angle+=(state.targetAngle-state.angle)*response;state.raw+=(state.targetRaw-state.raw)*numberResponse;const transform=`rotate(${state.angle.toFixed(3)} 160 160)`;if(transform!==state.lastTransform){needle.setAttribute('transform',transform);state.lastTransform=transform}const dash=String((100-clamp((state.angle-135)/270,0,1)*100).toFixed(3));if(dash!==state.lastDash){progress.style.strokeDashoffset=dash;state.lastDash=dash}const shown=displayValue(Math.max(0,state.raw)),value=shown.v.toFixed(shown.d);if(value!==state.lastValue){setText(valueEl,value);state.lastValue=value}if(shown.u!==state.lastUnit){setText(unitEl,shown.u);state.lastUnit=shown.u}if(state.label!==state.lastLabel){setText(labelEl,state.label);state.lastLabel=state.label}}
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame);

  function setStep(phase,status){q('.phase-steps')?.querySelectorAll('span').forEach(el=>{const same=el.dataset.phase===phase;if(same&&status==='running'){el.classList.add('active');el.classList.remove('done')}if(same&&status==='result'){el.classList.remove('active');el.classList.add('done')}})}
  function showTransition(label,value,meta,tone='neutral'){const box=q('.phase-transition');if(!box)return;box.classList.remove('tone-green','tone-yellow','tone-orange','tone-red');if(tone!=='neutral')box.classList.add(`tone-${tone}`);setText(phaseLabel,label);setText(phaseValue,value);setText(phaseMeta,meta||'');box.classList.add('show')}
  function updateSampleTransition(d){const now=performance.now();if(now-state.lastSampleUiAt<180)return;state.lastSampleUiAt=now;const conv=Number(d.convergence),ext=Number(d.autoExtended)||0;setText(phaseLabel,d.phase.toUpperCase());setText(phaseValue,`${Number(d.value).toFixed(1)} Mbps`);setText(phaseMeta,`${Number(d.streams)||1} stream · convergence ${Number.isFinite(conv)?Math.round(conv)+'%':'—'}${ext?` · +${ext} burst validasi`:''}`)}
  function latencyTone(v){return v<=25?'green':v<=50?'yellow':v<=100?'orange':'red'}
  function speedTone(v,kind){return kind==='upload'?(v>=20?'green':v>=10?'yellow':v>=3?'orange':'red'):(v>=50?'green':v>=25?'yellow':v>=10?'orange':'red')}

  window.addEventListener('wifi-test-phase',e=>{
    const d=e.detail||{};if(!d.phase)return;setStep(d.phase,d.status);
    if(d.status==='running'){const names={ping:'PING',download:'DOWNLOAD',upload:'UPLOAD'};showTransition(names[d.phase]||'MENGUKUR','Sedang mengukur…',d.phase==='ping'?'Latency: semakin rendah semakin baik.':'Engine v5 menyesuaikan stream dan mencari hasil yang konvergen.')}
    if(d.status==='calibration'&&Number.isFinite(Number(d.value))){setTarget(Number(d.value),d.phase,'KALIBRASI');showTransition('KALIBRASI',`${Number(d.value).toFixed(1)} Mbps`,'Warm-up untuk memilih payload/stream. Sampel ini tidak dihitung sebagai hasil final.')}
    if(d.status==='sample'&&Number.isFinite(Number(d.value))&&(d.phase==='download'||d.phase==='upload')){const v=Number(d.value);setTarget(v,d.phase,d.phase.toUpperCase());writeLiveReadout(d.phase,v);updateSampleTransition(d)}
    if(d.status==='result'){
      if(d.phase==='ping'){const ping=Number(d.value);if(readoutPing){const small=readoutPing.querySelector('small');if(readoutPing.firstChild?.nodeType===3)readoutPing.firstChild.nodeValue=`${ping.toFixed(1)} `;if(small)setText(small,'ms')}const p95=Number(d.stats?.p95);showTransition('PING SELESAI',`${ping.toFixed(1)} ms`,Number.isFinite(p95)?`P95 ${p95.toFixed(1)} ms · semakin rendah semakin baik.`:'Semakin rendah semakin baik.',latencyTone(ping))}
      else{const speed=Number(d.value),stats=d.stats||{},streams=Number(stats.maxStreams);writeLiveReadout(d.phase,speed,true);setTarget(speed,d.phase,`${d.phase.toUpperCase()} HASIL`);const range=Number.isFinite(stats.ci90Low)&&Number.isFinite(stats.ci90High)?`range ${stats.ci90Low.toFixed(1)}–${stats.ci90High.toFixed(1)} · `:'';showTransition(`${d.phase.toUpperCase()} SELESAI`,`${speed.toFixed(1)} Mbps`,`${Number.isFinite(streams)?`${streams} stream · `:''}${range}convergence ${Math.round(stats.convergence||0)}%`,speedTone(speed,d.phase))}
    }
  },{passive:true});

  window.addEventListener('wifi-measurement-session',e=>{const session=e.detail||window.wifiMeasurementSession;if(session?.status!=='complete')return;const down=Number(session?.phases?.download?.value),up=Number(session?.phases?.upload?.value),ping=Number(session?.phases?.ping?.ping);if(Number.isFinite(ping)&&readoutPing){const small=readoutPing.querySelector('small');if(readoutPing.firstChild?.nodeType===3)readoutPing.firstChild.nodeValue=`${ping.toFixed(1)} `;if(small)setText(small,'ms')}if(Number.isFinite(up))writeLiveReadout('upload',up,true);if(Number.isFinite(down)){writeLiveReadout('download',down,true);setTarget(down,'download','HASIL DOWNLOAD')}});

  const stage=q('#testStage');if(stage)new MutationObserver(()=>{const text=stage.textContent.toLowerCase();if(text.includes('loaded latency'))showTransition('ANALISIS JARINGAN','Mengukur loaded latency…','Latency tambahan saat koneksi sibuk: semakin rendah semakin baik.');else if(text.includes('dns'))showTransition('DNS CHECK','Menguji resolver…','Tahap akhir diagnostik sebelum hasil dikunci.')}).observe(stage,{childList:true,characterData:true,subtree:true});
  const engine=q('#engineState');if(engine)new MutationObserver(()=>{const s=engine.textContent.trim().toUpperCase();if(s==='RUNNING'){q('.phase-steps')?.querySelectorAll('span').forEach(el=>el.classList.remove('done','active'));state.kind='idle';state.max=100;state.targetRaw=0;state.targetAngle=135;state.label='PING';setScale(true)}if(s==='COMPLETE'){q('.phase-steps')?.querySelectorAll('span').forEach(el=>{el.classList.remove('active');el.classList.add('done')});const exact=sessionValue('download');if(Number.isFinite(exact))setTarget(exact,'download','HASIL DOWNLOAD');showTransition('TES SELESAI','Semua pengukuran selesai','Hasil final memakai sustained result Engine v5 + convergence + integrity audit.','green')}}).observe(engine,{childList:true,characterData:true,subtree:true});
  unitSelect?.addEventListener('change',()=>{unitMode=unitSelect.value||'auto';state.lastValue='';state.lastUnit='';state.lastScale=-1;setScale(true)});
  setScale(true);
}).catch(()=>{});
