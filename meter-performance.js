const q=s=>document.querySelector(s);

function waitForModernGauge(){return new Promise(resolve=>{let n=0;const tick=()=>{if(q('#flowGaugeNeedle')&&q('.clean-gauge'))return resolve(true);if(++n<160)setTimeout(tick,50)};tick()})}
function detachLegacyTarget(id){const old=q(`#${id}`);if(!old||old.dataset.perfBridge==='1')return false;const clone=old.cloneNode(true);clone.dataset.perfBridge='1';old.replaceWith(clone);return true}
async function optimizeLegacyBridge(){
  await waitForModernGauge();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const a=detachLegacyTarget('dialLabel'),b=detachLegacyTarget('dialValue');
    if(a||b)document.documentElement.dataset.meterBridge='isolated';
  }));
}
function syncRunningState(){const running=(q('#engineState')?.textContent||'').trim().toUpperCase()==='RUNNING';document.documentElement.classList.toggle('speed-test-running',running)}
const engine=q('#engineState');if(engine)new MutationObserver(syncRunningState).observe(engine,{childList:true,characterData:true,subtree:true});syncRunningState();
optimizeLegacyBridge();
window.wifiMeterPerformance={version:1,legacyBridgeIsolation:true};
