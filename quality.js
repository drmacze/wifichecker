const q=(s)=>document.querySelector(s);
const qualityClasses=['quality-green','quality-yellow','quality-orange','quality-red'];
let initialized=false;

function setQuality(el,level,chip=false){
  if(!el)return;
  el.classList.remove(...qualityClasses,'quality-value','quality-chip');
  if(level)el.classList.add(`quality-${level}`,chip?'quality-chip':'quality-value');
}
function pingLevel(v){return v<=30?'green':v<=60?'yellow':v<=100?'orange':'red'}
function jitterLevel(v){return v<=5?'green':v<=15?'yellow':v<=30?'orange':'red'}
function downloadLevel(v){return v>=50?'green':v>=25?'yellow':v>=10?'orange':'red'}
function uploadLevel(v){return v>=20?'green':v>=10?'yellow':v>=3?'orange':'red'}
function bufferLevel(text){const t=(text||'').trim().toUpperCase();return t==='A'?'green':t==='B'?'yellow':t==='C'?'orange':/D|F/.test(t)?'red':null}
function confidenceLevel(text){const t=(text||'').toLowerCase();return t.includes('tinggi')?'green':t.includes('sedang')?'yellow':t.includes('rendah')?'orange':null}

function replaceGaugeGradient(){
  const grad=q('#gaugeGradient');if(!grad)return false;
  grad.innerHTML='<stop offset="0%" stop-color="#ef4444"/><stop offset="35%" stop-color="#f97316"/><stop offset="62%" stop-color="#eab308"/><stop offset="100%" stop-color="#22c55e"/>';
  return true;
}
function installLegend(){
  const card=q('.meter-card');if(!card||q('.quality-legend'))return;
  const el=document.createElement('div');el.className='quality-legend';
  el.innerHTML='<span class="good"><i></i>Bagus</span><span class="normal"><i></i>Normal</span><span class="warn"><i></i>Tinggi</span><span class="bad"><i></i>Buruk</span>';
  const readouts=q('.meter-readouts');if(readouts)readouts.after(el);else card.append(el);
}
function activeNeedle(){return q('#flowGaugeNeedle')||q('#gaugeNeedle')}
function updateGaugeQuality(){
  const gauge=q('.clean-gauge'),needle=activeNeedle();if(!gauge||!needle)return;
  const m=(needle.getAttribute('transform')||'').match(/rotate\(([-\d.]+)/);if(!m)return;
  const ratio=Math.max(0,Math.min(1,(Number(m[1])-135)/270));
  const level=ratio<.25?'red':ratio<.5?'orange':ratio<.72?'yellow':'green';
  gauge.classList.remove(...qualityClasses);gauge.classList.add(`quality-${level}`);
}
function updateValues(){
  const ping=Number.parseFloat(q('#pingValue')?.textContent),jitter=Number.parseFloat(q('#jitterValue')?.textContent),down=Number.parseFloat(q('#downloadValue')?.textContent),up=Number.parseFloat(q('#uploadValue')?.textContent);
  if(Number.isFinite(ping))setQuality(q('#meterPing'),pingLevel(ping));
  if(Number.isFinite(jitter))setQuality(q('#jitterValue')?.closest('.metric-number')||q('#jitterValue'),jitterLevel(jitter));
  if(Number.isFinite(down))setQuality(q('#meterDown'),downloadLevel(down));
  if(Number.isFinite(up))setQuality(q('#meterUp'),uploadLevel(up));
  const buffer=q('#bufferbloatGrade');setQuality(buffer,bufferLevel(buffer?.textContent),true);
  const confidence=q('#planConfidence');setQuality(confidence,confidenceLevel(confidence?.textContent),true);
}
function observeText(selector){const el=q(selector);if(el)new MutationObserver(updateValues).observe(el,{childList:true,characterData:true,subtree:true})}
function observeNeedle(){const n=activeNeedle();if(!n)return false;new MutationObserver(updateGaugeQuality).observe(n,{attributes:true,attributeFilter:['transform']});return true}
function initialize(){
  if(initialized||!q('#gaugeNeedle')||!q('#meterPing'))return false;
  initialized=true;replaceGaugeGradient();installLegend();updateValues();updateGaugeQuality();
  ['#pingValue','#jitterValue','#downloadValue','#uploadValue','#bufferbloatGrade','#planConfidence'].forEach(observeText);
  if(!observeNeedle())setTimeout(observeNeedle,120);
  return true;
}
window.addEventListener('wifi-test-phase',e=>{const d=e.detail||{},v=Number(d.value);if(!Number.isFinite(v))return;if(d.phase==='ping')setQuality(q('#meterPing'),pingLevel(v));if(d.phase==='download')setQuality(q('#meterDown'),downloadLevel(v));if(d.phase==='upload')setQuality(q('#meterUp'),uploadLevel(v))});
window.addEventListener('wifi-engine-ready',()=>setTimeout(()=>{replaceGaugeGradient();observeNeedle()},180));
let attempts=0;const timer=setInterval(()=>{attempts++;if(initialize()||attempts>=60)clearInterval(timer)},100);initialize();
