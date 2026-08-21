const UNIT_KEY='wifi-checker-speed-unit-v1';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let gsap=null;
try{const mod=await import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm');gsap=mod.gsap||mod.default}catch(e){console.warn('[workspace] GSAP fallback',e)}

const q=(s)=>document.querySelector(s);
const qa=(s)=>[...document.querySelectorAll(s)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

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
let rawDownload=NaN,rawUpload=NaN;

function convertMbps(mbps,requested=unit){
  if(!Number.isFinite(mbps))return{value:NaN,unit:requested==='auto'?'Mbps':requested==='MBps'?'MB/s':requested.toUpperCase(),digits:1};
  let mode=requested;
  if(mode==='auto') mode=mbps>=1000?'gbps':mbps>=1?'mbps':'kbps';
  if(mode==='gbps')return{value:mbps/1000,unit:'Gbps',digits:mbps>=10000?1:2};
  if(mode==='kbps')return{value:mbps*1000,unit:'Kbps',digits:mbps<.1?1:0};
  if(mode==='MBps')return{value:mbps/8,unit:'MB/s',digits:2};
  return{value:mbps,unit:'Mbps',digits:mbps>=100?0:1};
}
function formatConverted(mbps,requested=unit){const c=convertMbps(mbps,requested);return Number.isFinite(c.value)?c.value.toFixed(c.digits):'—'}
function paintBandwidth(source,display,unitEl){
  const raw=parseFloat(source.textContent);
  if(Number.isFinite(raw)){if(source===downloadSource)rawDownload=raw;else rawUpload=raw}
  const base=source===downloadSource?rawDownload:rawUpload;
  const c=convertMbps(base);
  display.textContent=Number.isFinite(c.value)?c.value.toFixed(c.digits):'—';unitEl.textContent=c.unit;
}
function repaintBandwidth(){paintBandwidth(downloadSource,downloadDisplay,downloadUnit);paintBandwidth(uploadSource,uploadDisplay,uploadUnit)}
new MutationObserver(()=>paintBandwidth(downloadSource,downloadDisplay,downloadUnit)).observe(downloadSource,{childList:true,characterData:true,subtree:true});
new MutationObserver(()=>paintBandwidth(uploadSource,uploadDisplay,uploadUnit)).observe(uploadSource,{childList:true,characterData:true,subtree:true});

function prettyScale(mbps){
  const thresholds=[1,2.5,5,10,25,50,100,250,500,1000,2500,5000,10000,25000];
  const wanted=Math.max(1,mbps*1.18);
  return thresholds.find(v=>v>=wanted)||Math.ceil(wanted/10000)*10000;
}
let meterState={deg:0,value:0};
let lastMeter={value:NaN,label:'NETWORK SCORE',max:100,isBandwidth:false};
function setScale(max,isBandwidth){
  if(!isBandwidth){meterScaleMid.textContent='50';meterScaleMax.textContent='100';return}
  const half=convertMbps(max/2),full=convertMbps(max);
  meterScaleMid.textContent=`${Number(half.value.toFixed(half.digits))}`;
  meterScaleMax.textContent=`${Number(full.value.toFixed(full.digits))} ${full.unit}`;
}
function smoothDial(value,label='NETWORK SCORE',incomingUnit='/ 100',incomingMax=100){
  const isBandwidth=/DOWNLOAD|UPLOAD/i.test(label);
  const finite=Number.isFinite(value);
  const raw=finite?value:0;
  const max=isBandwidth?prettyScale(Math.max(raw,1)):Math.max(1,incomingMax||100);
  const targetDeg=clamp(raw/max,0,1)*290;
  lastMeter={value:finite?value:NaN,label,max,isBandwidth};
  setScale(max,isBandwidth);
  const dial=q('#speedDial'),valueEl=q('#dialValue'),unitEl=q('#dialUnit'),labelEl=q('#dialLabel');
  labelEl.textContent=label;
  const converted=isBandwidth?convertMbps(raw):{value:raw,unit:incomingUnit,digits:raw>=100?0:1};
  unitEl.textContent=isBandwidth?converted.unit:incomingUnit;
  if(!finite)valueEl.textContent='—';
  if(reduced||!gsap){meterState.deg=targetDeg;meterState.value=converted.value;dial.style.setProperty('--meter',`${targetDeg}deg`);dial.style.setProperty('--needle',`${targetDeg}deg`);if(finite)valueEl.textContent=converted.value.toFixed(converted.digits);return}
  gsap.killTweensOf(meterState);
  const targetValue=converted.value;
  gsap.to(meterState,{deg:targetDeg,value:targetValue,duration:.92,ease:'expo.out',onUpdate:()=>{
    dial.style.setProperty('--meter',`${meterState.deg}deg`);dial.style.setProperty('--needle',`${meterState.deg}deg`);
    if(finite)valueEl.textContent=meterState.value.toFixed(converted.digits);
  }});
}

if(typeof window.setDial==='function')window.setDial=smoothDial;

function rerenderLiveMeter(){
  if(!lastMeter.isBandwidth)return;
  smoothDial(lastMeter.value,lastMeter.label,'Mbps',lastMeter.max);
}
unitSelect.addEventListener('change',()=>{unit=unitSelect.value;localStorage.setItem(UNIT_KEY,unit);repaintBandwidth();rerenderLiveMeter()});
repaintBandwidth();

const testMessage=q('#testMessage');
function rewriteStatusUnit(){
  const text=testMessage.textContent;
  const next=text.replace(/(\d+(?:\.\d+)?)\sMbps\b/g,(_,n)=>{const c=convertMbps(Number(n));return`${Number(c.value.toFixed(c.digits))} ${c.unit}`});
  if(next!==text)testMessage.textContent=next;
}
new MutationObserver(rewriteStatusUnit).observe(testMessage,{childList:true,characterData:true,subtree:true});

['runTestBtn','quickCheckBtn'].forEach(id=>q('#'+id)?.addEventListener('click',()=>activatePanel('network',false)));

// If the classic app captured its original global binding before this module loaded,
// observe dial mutations and smooth the final visual state as a safety net.
const dial=q('#speedDial');
let lastObservedStyle='';
new MutationObserver(()=>{
  const label=q('#dialLabel').textContent;
  const raw=parseFloat(q('#dialValue').textContent);
  const style=dial.getAttribute('style')||'';
  if(style===lastObservedStyle)return;
  lastObservedStyle=style;
  if(Number.isFinite(raw)&&(/DOWNLOAD|UPLOAD/i.test(label)||/NETWORK SCORE/i.test(label))){
    const targetMax=/NETWORK SCORE/i.test(label)?100:prettyScale(raw);
    const isBandwidth=/DOWNLOAD|UPLOAD/i.test(label);
    const targetDeg=clamp(raw/targetMax,0,1)*290;
    if(Math.abs(targetDeg-meterState.deg)>.15){
      lastMeter={value:raw,label,max:targetMax,isBandwidth};setScale(targetMax,isBandwidth);
      if(gsap&&!reduced){gsap.killTweensOf(meterState);gsap.to(meterState,{deg:targetDeg,duration:.9,ease:'expo.out',onUpdate:()=>{dial.style.setProperty('--meter',`${meterState.deg}deg`);dial.style.setProperty('--needle',`${meterState.deg}deg`)}})}
    }
  }
}).observe(dial,{attributes:true,attributeFilter:['style']});

activatePanel('network',false);
