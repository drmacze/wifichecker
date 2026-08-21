const UNIT_KEY='wifi-checker-speed-unit-v1';
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
.speed-dial{transition:--meter .9s cubic-bezier(.16,1,.3,1),--needle .9s cubic-bezier(.16,1,.3,1)!important}
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
let rawDownload=NaN,rawUpload=NaN;

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
new MutationObserver(()=>paintBandwidth(downloadSource,downloadDisplay,downloadUnit)).observe(downloadSource,{childList:true,characterData:true,subtree:true});
new MutationObserver(()=>paintBandwidth(uploadSource,uploadDisplay,uploadUnit)).observe(uploadSource,{childList:true,characterData:true,subtree:true});

function prettyScale(mbps){
  const thresholds=[1,2.5,5,10,25,50,100,200,250,500,1000,2500,5000,10000,25000];
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
  const isBandwidth=/DOWNLOAD|UPLOAD/i.test(label);
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

if(typeof window.setDial==='function')window.setDial=smoothDial;

function rerenderLiveMeter(){if(lastMeter.isBandwidth)smoothDial(lastMeter.value,lastMeter.label,'Mbps',lastMeter.max)}
unitSelect.addEventListener('change',()=>{
  unit=unitSelect.value;
  localStorage.setItem(UNIT_KEY,unit);
  repaintBandwidth();
  rerenderLiveMeter();
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

['runTestBtn','quickCheckBtn'].forEach(id=>q('#'+id)?.addEventListener('click',()=>activatePanel('network',false)));
activatePanel('network',false);
