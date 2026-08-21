const q=(s)=>document.querySelector(s);
const qualityClasses=['quality-green','quality-yellow','quality-orange','quality-red'];
let initialized=false;

function setQuality(el,level,chip=false){
  if(!el)return;
  el.classList.remove(...qualityClasses,'quality-value','quality-chip');
  if(level)el.classList.add(`quality-${level}`,chip?'quality-chip':'quality-value');
}
function speedLevel(v,kind='download'){
  if(!Number.isFinite(v))return null;
  if(kind==='upload')return v>=20?'green':v>=10?'yellow':v>=3?'orange':'red';
  return v>=50?'green':v>=25?'yellow':v>=10?'orange':'red';
}
function pingLevel(v){return !Number.isFinite(v)?null:v<=25?'green':v<=50?'yellow':v<=100?'orange':'red'}
function jitterLevel(v){return !Number.isFinite(v)?null:v<=5?'green':v<=12?'yellow':v<=25?'orange':'red'}
function loadedLatencyLevel(v){return !Number.isFinite(v)?null:v<=15?'green':v<=40?'yellow':v<=80?'orange':'red'}
function bufferLevel(text){const t=(text||'').trim().toUpperCase();return t==='A'?'green':t==='B'?'yellow':t==='C'?'orange':/D|F/.test(t)?'red':null}
function confidenceLevel(text){const t=(text||'').toLowerCase();return t.includes('tinggi')?'green':t.includes('baik')?'green':t.includes('sedang')?'yellow':t.includes('rendah')?'orange':null}

function replaceGaugeGradient(){
  const grad=q('#gaugeGradient');if(!grad)return false;
  grad.innerHTML='<stop offset="0%" stop-color="#ef4444"/><stop offset="28%" stop-color="#f97316"/><stop offset="52%" stop-color="#eab308"/><stop offset="74%" stop-color="#84cc16"/><stop offset="100%" stop-color="#22c55e"/>';
  return true;
}
function installLegend(){
  const card=q('.meter-card');if(!card||q('.quality-legend'))return;
  const el=document.createElement('div');el.className='quality-legend';
  el.innerHTML='<div class="legend-rule"><b>Speed</b><span class="bad"><i></i>Rendah</span><span class="warn"><i></i>Cukup</span><span class="normal"><i></i>Baik</span><span class="good"><i></i>Tinggi</span></div><div class="legend-rule inverse"><b>Latency</b><span class="good"><i></i>Rendah</span><span class="normal"><i></i>Normal</span><span class="warn"><i></i>Tinggi</span><span class="bad"><i></i>Buruk</span></div>';
  const readouts=q('.meter-readouts');if(readouts)readouts.after(el);else card.append(el);
}
function activeNeedle(){return q('#flowGaugeNeedle')||q('#gaugeNeedle')}
function setGaugeQuality(kind,value){
  const gauge=q('.clean-gauge');if(!gauge||!['download','upload'].includes(kind))return;
  const level=speedLevel(value,kind);if(!level)return;
  gauge.dataset.metric=kind;
  gauge.dataset.quality=level;
  gauge.classList.remove(...qualityClasses);gauge.classList.add(`quality-${level}`);
}
function updateValues(){
  const ping=Number.parseFloat(q('#pingValue')?.textContent),jitter=Number.parseFloat(q('#jitterValue')?.textContent),down=Number.parseFloat(q('#downloadValue')?.textContent),up=Number.parseFloat(q('#uploadValue')?.textContent);
  if(Number.isFinite(ping))setQuality(q('#meterPing'),pingLevel(ping));
  if(Number.isFinite(jitter))setQuality(q('#jitterValue')?.closest('.metric-number')||q('#jitterValue'),jitterLevel(jitter));
  if(Number.isFinite(down)){setQuality(q('#meterDown'),speedLevel(down,'download'));if((q('#gaugeLabel')?.textContent||'').toUpperCase().includes('DOWNLOAD'))setGaugeQuality('download',down)}
  if(Number.isFinite(up)){setQuality(q('#meterUp'),speedLevel(up,'upload'));if((q('#gaugeLabel')?.textContent||'').toUpperCase().includes('UPLOAD'))setGaugeQuality('upload',up)}
  const downLoaded=Number.parseFloat(q('#downLoadedLatency')?.textContent),upLoaded=Number.parseFloat(q('#upLoadedLatency')?.textContent);
  if(Number.isFinite(downLoaded))setQuality(q('#downLoadedLatency'),loadedLatencyLevel(Math.max(0,downLoaded-(Number.isFinite(ping)?ping:0))));
  if(Number.isFinite(upLoaded))setQuality(q('#upLoadedLatency'),loadedLatencyLevel(Math.max(0,upLoaded-(Number.isFinite(ping)?ping:0))));
  const buffer=q('#bufferbloatGrade');setQuality(buffer,bufferLevel(buffer?.textContent),true);
  const confidence=q('#planConfidence');setQuality(confidence,confidenceLevel(confidence?.textContent),true);
}
function observeText(selector){const el=q(selector);if(el)new MutationObserver(updateValues).observe(el,{childList:true,characterData:true,subtree:true})}
function observeNeedle(){const n=activeNeedle();if(!n)return false;return true}
function initialize(){
  if(initialized||!q('#gaugeNeedle')||!q('#meterPing'))return false;
  initialized=true;replaceGaugeGradient();installLegend();updateValues();
  ['#pingValue','#jitterValue','#downloadValue','#uploadValue','#downLoadedLatency','#upLoadedLatency','#bufferbloatGrade','#planConfidence'].forEach(observeText);
  observeNeedle();return true;
}
window.addEventListener('wifi-test-phase',e=>{
  const d=e.detail||{},v=Number(d.value);if(!Number.isFinite(v))return;
  if(d.phase==='ping')setQuality(q('#meterPing'),pingLevel(v));
  if(d.phase==='download'){setQuality(q('#meterDown'),speedLevel(v,'download'));setGaugeQuality('download',v)}
  if(d.phase==='upload'){setQuality(q('#meterUp'),speedLevel(v,'upload'));setGaugeQuality('upload',v)}
});
window.addEventListener('wifi-engine-ready',()=>setTimeout(()=>{replaceGaugeGradient();observeNeedle()},180));
let attempts=0;const timer=setInterval(()=>{attempts++;if(initialize()||attempts>=60)clearInterval(timer)},100);initialize();
