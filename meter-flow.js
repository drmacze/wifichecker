const q=s=>document.querySelector(s);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

function waitForGauge(){return new Promise(resolve=>{let n=0;const tick=()=>{const gauge=q('.clean-gauge'),needle=q('#gaugeNeedle'),progress=q('#gaugeProgress'),center=q('.clean-gauge .gauge-center'),labels=q('.clean-gauge .gauge-labels');if(gauge&&needle&&progress&&center&&labels)return resolve({gauge,needle,progress,center,labels});if(++n<160)setTimeout(tick,50)};tick()})}
function scaleFor(v){const tiers=[10,25,50,75,100,150,200,300,500,750,1000,1500,2000,2500,5000,10000],need=Math.max(10,v);return tiers.find(x=>x>=need)||Math.ceil(need/5000)*5000}
let unitMode='auto';
function displayValue(mbps){const mode=unitMode;if(mode==='gbps'||(mode==='auto'&&mbps>=1000))return{v:mbps/1000,u:'Gbps',d:2};if(mode==='kbps'||(mode==='auto'&&mbps<1))return{v:mbps*1000,u:'Kbps',d:mbps<.1?1:0};if(mode==='MBps')return{v:mbps/8,u:'MB/s',d:2};return{v:mbps,u:'Mbps',d:mbps>=100?0:1}}
function finalSessionValue(kind){const p=window.wifiMeasurementSession?.phases?.[kind],v=Number(p?.value??(kind==='ping'?p?.ping:NaN));return Number.isFinite(v)?v:NaN}

waitForGauge().then(({gauge,needle:oldNeedle,progress:oldProgress,center:oldCenter,labels:oldLabels})=>{
  const unitSelect=q('#speedUnitSelect');unitMode=unitSelect?.value||'auto';
  oldNeedle.style.opacity='0';oldProgress.style.opacity='0';oldCenter.style.opacity='0';oldLabels.style.opacity='0';
  const progress=oldProgress.cloneNode(true);progress.id='flowGaugeProgress';progress.classList.add('flow-gauge-progress');progress.style.opacity='1';oldProgress.after(progress);
  const needle=oldNeedle.cloneNode(true);needle.id='flowGaugeNeedle';needle.classList.add('flow-gauge-needle');needle.style.opacity='1';oldNeedle.after(needle);
  const center=oldCenter.cloneNode(true);center.classList.add('flow-gauge-center');center.style.opacity='1';center.querySelector('#gaugeLabel').id='flowGaugeLabel';center.querySelector('#gaugeValue').id='flowGaugeValue';center.querySelector('#gaugeUnit').id='flowGaugeUnit';oldCenter.after(center);
  const labels=oldLabels.cloneNode(true);labels.classList.add('flow-gauge-labels');labels.style.opacity='1';labels.querySelector('#gaugeMid').id='flowGaugeMid';labels.querySelector('#gaugeMax').id='flowGaugeMax';oldLabels.after(labels);

  const card=q('.meter-card');let steps=q('.phase-steps');
  if(!steps){steps=document.createElement('div');steps.className='phase-steps';steps.innerHTML='<span data-phase="ping"><i></i>Ping</span><span data-phase="download"><i></i>Download</span><span data-phase="upload"><i></i>Upload</span>';card?.querySelector('.instrument-top')?.after(steps)}
  let transition=q('.phase-transition');
  if(!transition){transition=document.createElement('div');transition.className='phase-transition show';transition.innerHTML='<span id="phaseTransitionLabel">SIAP</span><strong id="phaseTransitionValue">Tekan GO untuk mulai</strong><small id="phaseTransitionMeta">Pengukuran menggunakan traffic nyata ke Cloudflare edge.</small>';const readouts=q('.meter-readouts');if(readouts)readouts.before(transition);else card?.append(transition)}

  const els={value:q('#flowGaugeValue'),unit:q('#flowGaugeUnit'),label:q('#flowGaugeLabel'),mid:q('#flowGaugeMid'),max:q('#flowGaugeMax'),down:q('#meterDown'),up:q('#meterUp'),ping:q('#meterPing'),phaseLabel:q('#phaseTransitionLabel'),phaseValue:q('#phaseTransitionValue'),phaseMeta:q('#phaseTransitionMeta')};
  const stepEls={ping:steps?.querySelector('[data-phase="ping"]'),download:steps?.querySelector('[data-phase="download"]'),upload:steps?.querySelector('[data-phase="upload"]')};
  const s={kind:'idle',label:'SPEED TEST',raw:0,target:0,angle:135,displayMax:100,targetMax:100,estimator:NaN,samples:[],scaleLocked:false,final:false,last:performance.now(),lastCenter:0,lastReadout:0,lastSampleUi:0,lastValue:'',lastUnit:'',lastLabel:'',lastTransform:'',lastDash:''};

  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text};
  function paintReadout(kind,value,force=false){const now=performance.now();if(!force&&now-s.lastReadout<70)return;s.lastReadout=now;const c=displayValue(value),el=kind==='download'?els.down:els.up;if(!el)return;const text=`${c.v.toFixed(c.d)} `,small=el.querySelector('small');if(el.firstChild?.nodeType===3){if(el.firstChild.nodeValue!==text)el.firstChild.nodeValue=text}else{el.textContent=text;const x=document.createElement('small');x.textContent=c.u;el.append(x);return}if(small)setText(small,c.u)}
  function setScale(max){s.targetMax=Math.max(10,max);const half=displayValue(s.targetMax/2),full=displayValue(s.targetMax);setText(els.mid,String(Number(half.v.toFixed(half.d))));setText(els.max,`${Number(full.v.toFixed(full.d))} ${full.u}`)}
  function beginPhase(kind,label,seed=0){if(kind===s.kind)return;s.kind=kind;s.label=label||kind.toUpperCase();s.samples=[];s.estimator=NaN;s.scaleLocked=false;s.final=false;s.target=Math.max(0,seed);setScale(scaleFor(Math.max(kind==='upload'?25:50,seed*1.6)));gauge.dataset.metric=kind}
  function ensureScale(v,margin=1.5){if(!Number.isFinite(v)||v<=0)return;if(!s.scaleLocked){setScale(scaleFor(Math.max(v*margin,s.kind==='upload'?25:50)));s.scaleLocked=true}else if(v>s.targetMax*.92)setScale(scaleFor(v*1.38))}
  function liveEstimate(d){const raw=Number(d.value),med=Number(d.runningMedian),candidate=Number.isFinite(med)&&med>0?med:raw;if(!Number.isFinite(candidate))return NaN;s.samples.push(raw);if(s.samples.length>12)s.samples.shift();if(!Number.isFinite(s.estimator))s.estimator=candidate;else{const rel=Math.abs(candidate-s.estimator)/Math.max(1,s.estimator),alpha=rel>.45?.22:rel>.20?.30:.38;s.estimator+=(candidate-s.estimator)*alpha}return s.estimator}
  function setLive(v,kind,label){if(!Number.isFinite(v))return;if(kind!==s.kind)beginPhase(kind,label,v);ensureScale(v);s.final=false;s.target=Math.max(0,v);s.label=label||kind.toUpperCase();gauge.dataset.metric=kind}
  function setFinal(v,kind,label){if(!Number.isFinite(v))return;if(kind!==s.kind)beginPhase(kind,label,v);ensureScale(v,1.38);s.final=true;s.estimator=v;s.target=Math.max(0,v);s.label=label||`${kind.toUpperCase()} HASIL`;gauge.dataset.metric=kind}
  function approach(current,target,dt,rate){const diff=target-current;if(Math.abs(diff)<.0001)return target;const tau=s.final?.30:.62,response=1-Math.exp(-dt/tau),step=diff*response,maxStep=Math.max(.025,rate*dt);return current+clamp(step,-maxStep,maxStep)}

  function frame(now){
    const dt=Math.min(.05,Math.max(.001,(now-s.last)/1000));s.last=now;
    const basis=Math.max(8,s.raw,s.target),rate=reduced?1e9:Math.max(4,basis*(s.final?1.35:.46));
    s.raw=reduced?s.target:approach(s.raw,s.target,dt,rate);
    const maxResponse=reduced?1:1-Math.exp(-dt/.58);s.displayMax+=(s.targetMax-s.displayMax)*maxResponse;s.displayMax=Math.max(10,s.displayMax);
    const desired=135+clamp(s.raw/s.displayMax,0,1)*270,angleResponse=reduced?1:1-Math.exp(-dt/.13);s.angle+=(desired-s.angle)*angleResponse;
    if(s.final&&Math.abs(s.target-s.raw)<.025)s.raw=s.target;
    const tr=`rotate(${s.angle.toFixed(3)} 160 160)`;if(tr!==s.lastTransform){needle.setAttribute('transform',tr);s.lastTransform=tr}
    const dash=String((100-clamp((s.angle-135)/270,0,1)*100).toFixed(3));if(dash!==s.lastDash){progress.style.strokeDashoffset=dash;s.lastDash=dash}
    if(now-s.lastCenter>=33||(s.final&&s.raw===s.target)){s.lastCenter=now;const shown=displayValue(Math.max(0,s.raw)),value=shown.v.toFixed(shown.d);if(value!==s.lastValue){setText(els.value,value);s.lastValue=value}if(shown.u!==s.lastUnit){setText(els.unit,shown.u);s.lastUnit=shown.u}if(s.label!==s.lastLabel){setText(els.label,s.label);s.lastLabel=s.label}if(s.kind==='download'||s.kind==='upload')paintReadout(s.kind,s.raw,s.final&&s.raw===s.target)}
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame);

  function step(phase,status){const el=stepEls[phase];if(!el)return;if(status==='running'){el.classList.add('active');el.classList.remove('done')}if(status==='result'){el.classList.remove('active');el.classList.add('done')}}
  function show(label,value,meta,tone='neutral'){transition.classList.remove('tone-green','tone-yellow','tone-orange','tone-red');if(tone!=='neutral')transition.classList.add(`tone-${tone}`);setText(els.phaseLabel,label);setText(els.phaseValue,value);setText(els.phaseMeta,meta||'');transition.classList.add('show')}
  function sampleUi(d,visual){const now=performance.now();if(now-s.lastSampleUi<220)return;s.lastSampleUi=now;const conv=Number(d.convergence),ext=Number(d.autoExtended)||0;setText(els.phaseLabel,d.phase.toUpperCase());setText(els.phaseValue,`${visual.toFixed(1)} Mbps`);setText(els.phaseMeta,`live stabil · ${Number(d.streams)||1} stream · convergence ${Number.isFinite(conv)?Math.round(conv)+'%':'—'}${ext?` · +${ext} burst`:''}`)}
  const latencyTone=v=>v<=25?'green':v<=50?'yellow':v<=100?'orange':'red';
  const speedTone=(v,kind)=>kind==='upload'?(v>=20?'green':v>=10?'yellow':v>=3?'orange':'red'):(v>=50?'green':v>=25?'yellow':v>=10?'orange':'red');

  window.addEventListener('wifi-test-phase',e=>{
    const d=e.detail||{};if(!d.phase)return;step(d.phase,d.status);
    if(d.status==='running'){const names={ping:'PING',download:'DOWNLOAD',upload:'UPLOAD'};if(d.phase==='download'||d.phase==='upload')beginPhase(d.phase,names[d.phase],0);show(names[d.phase]||'MENGUKUR','Sedang mengukur…',d.phase==='ping'?'Latency: semakin rendah semakin baik.':'Engine v6 memakai burst nyata; meter menampilkan estimator live yang kontinu.')}
    if(d.status==='calibration'&&Number.isFinite(Number(d.value))){const v=Number(d.value);if(d.phase!==s.kind)beginPhase(d.phase,'KALIBRASI',v);ensureScale(v,1.65);s.estimator=Number.isFinite(s.estimator)?s.estimator+(v-s.estimator)*.34:v;s.target=s.estimator;s.label='KALIBRASI';show('KALIBRASI',`${v.toFixed(1)} Mbps`,'Warm-up nyata untuk menentukan saturasi. Sampel ini tidak menjadi hasil final.')}
    if(d.status==='sample'&&Number.isFinite(Number(d.value))&&(d.phase==='download'||d.phase==='upload')){const visual=liveEstimate(d);if(Number.isFinite(visual)){setLive(visual,d.phase,d.phase.toUpperCase());sampleUi(d,visual)}}
    if(d.status==='result'){
      if(d.phase==='ping'){const ping=Number(d.value);if(els.ping){const small=els.ping.querySelector('small');if(els.ping.firstChild?.nodeType===3)els.ping.firstChild.nodeValue=`${ping.toFixed(1)} `;if(small)setText(small,'ms')}const p95=Number(d.stats?.p95);show('PING SELESAI',`${ping.toFixed(1)} ms`,Number.isFinite(p95)?`P95 ${p95.toFixed(1)} ms · semakin rendah semakin baik.`:'Semakin rendah semakin baik.',latencyTone(ping))}
      else{const v=Number(d.value),stats=d.stats||{},streams=Number(stats.maxStreams);setFinal(v,d.phase,`${d.phase.toUpperCase()} HASIL`);const range=Number.isFinite(stats.ci90Low)&&Number.isFinite(stats.ci90High)?`range ${stats.ci90Low.toFixed(1)}–${stats.ci90High.toFixed(1)} · `:'';show(`${d.phase.toUpperCase()} SELESAI`,`${v.toFixed(1)} Mbps`,`${Number.isFinite(streams)?`${streams} stream · `:''}${range}convergence ${Math.round(stats.convergence||0)}%`,speedTone(v,d.phase))}
    }
  },{passive:true});

  window.addEventListener('wifi-measurement-session',e=>{const session=e.detail||window.wifiMeasurementSession;if(session?.status!=='complete')return;const down=Number(session?.phases?.download?.value),up=Number(session?.phases?.upload?.value),ping=Number(session?.phases?.ping?.ping);if(Number.isFinite(ping)&&els.ping){const small=els.ping.querySelector('small');if(els.ping.firstChild?.nodeType===3)els.ping.firstChild.nodeValue=`${ping.toFixed(1)} `;if(small)setText(small,'ms')}if(Number.isFinite(up)){const c=displayValue(up),small=els.up?.querySelector('small');if(els.up?.firstChild?.nodeType===3)els.up.firstChild.nodeValue=`${c.v.toFixed(c.d)} `;if(small)setText(small,c.u)}if(Number.isFinite(down))setFinal(down,'download','HASIL DOWNLOAD')});

  const stage=q('#testStage');if(stage)new MutationObserver(()=>{const text=stage.textContent.toLowerCase();if(text.includes('loaded latency'))show('ANALISIS JARINGAN','Mengukur loaded latency…','Latency tambahan saat koneksi sibuk: semakin rendah semakin baik.');else if(text.includes('dns'))show('DNS CHECK','Menguji resolver…','Tahap akhir diagnostik sebelum hasil dikunci.')}).observe(stage,{childList:true,characterData:true,subtree:true});
  const engine=q('#engineState');if(engine)new MutationObserver(()=>{const status=engine.textContent.trim().toUpperCase();if(status==='RUNNING'){Object.values(stepEls).filter(Boolean).forEach(el=>el.classList.remove('done','active'));s.kind='idle';s.samples=[];s.estimator=NaN;s.scaleLocked=false;s.final=false;s.target=0;s.targetMax=100;s.label='PING';setScale(100)}if(status==='COMPLETE'){Object.values(stepEls).filter(Boolean).forEach(el=>{el.classList.remove('active');el.classList.add('done')});const exact=finalSessionValue('download');if(Number.isFinite(exact))setFinal(exact,'download','HASIL DOWNLOAD');show('TES SELESAI','Semua pengukuran selesai','Hasil final memakai sustained result Engine v6; smoothing hanya untuk tampilan live.','green')}}).observe(engine,{childList:true,characterData:true,subtree:true});
  unitSelect?.addEventListener('change',()=>{unitMode=unitSelect.value||'auto';s.lastValue='';s.lastUnit='';setScale(s.targetMax)});
  setScale(100);
  window.wifiSmoothMeter={version:3,continuousEstimator:true,usesRunningMedian:true,scaleInterpolation:true,finalResultUnsmoothened:true};
}).catch(()=>{});
