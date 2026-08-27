const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function renderIcons(){const draw=()=>{try{if(window.lucide?.createIcons){window.lucide.createIcons({attrs:{'stroke-width':1.8}});return true}}catch{}return false};if(!draw())addEventListener('load',draw,{once:true})}
renderIcons();

async function loadLibraries(){
  const [lenisMod,gsapMod,stMod]=await Promise.all([
    import('https://cdn.jsdelivr.net/npm/lenis@1.3.26/+esm'),
    import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/ScrollTrigger/+esm')
  ]);
  const Lenis=lenisMod.default,gsap=gsapMod.gsap||gsapMod.default,ScrollTrigger=stMod.ScrollTrigger||stMod.default;
  gsap.registerPlugin(ScrollTrigger);return{Lenis,gsap,ScrollTrigger};
}

loadLibraries().then(({Lenis,gsap,ScrollTrigger})=>{
  let lenis=null;
  if(!reduced){
    lenis=new Lenis({duration:.9,lerp:.1,smoothWheel:true,syncTouch:false,autoRaf:false});
    lenis.on('scroll',ScrollTrigger.update);gsap.ticker.add(t=>lenis.raf(t*1000));gsap.ticker.lagSmoothing(0);
    document.querySelectorAll('.modal-card,.dock-panel').forEach(el=>el.setAttribute('data-lenis-prevent',''));
  }
  const topbar=document.querySelector('.topbar');addEventListener('scroll',()=>topbar?.classList.toggle('motion-scrolled',scrollY>8),{passive:true});
  if(!reduced){
    const items=['.topbar','.command-strip','.meter-card','.compact-console','.intel-dock'],targets=items.flatMap(sel=>[...document.querySelectorAll(sel)]);
    gsap.fromTo(targets,{y:14,autoAlpha:0},{y:0,autoAlpha:1,duration:.5,stagger:.055,ease:'power2.out',clearProps:'transform,opacity,visibility'});
    document.querySelectorAll('.modal').forEach(modal=>{const card=modal.querySelector('.modal-card');new MutationObserver(()=>{const open=modal.classList.contains('open');if(open){lenis?.stop();gsap.fromTo(card,{y:18,scale:.98,autoAlpha:0},{y:0,scale:1,autoAlpha:1,duration:.26,ease:'power2.out'})}else if(!document.querySelector('.modal.open'))lenis?.start()}).observe(modal,{attributes:true,attributeFilter:['class']})});
  }
  setTimeout(()=>ScrollTrigger.refresh(),120);
}).catch(err=>{console.warn('[motion] fallback',err);document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'))});

const testButtons=['runTestBtn','quickCheckBtn'].map(id=>document.getElementById(id)).filter(Boolean),initialButtonLabels=testButtons.map(btn=>btn.querySelector('b,span')?.textContent||'');
testButtons.forEach(btn=>{btn.disabled=true;btn.dataset.engineLoading='true'});
function syncEngineBadges(version=5){let tries=0;const timer=setInterval(()=>{tries++;document.querySelectorAll('#engineVersionPill').forEach(el=>el.textContent=`ENGINE v${version}`);if(tries>=30)clearInterval(timer)},100)}

const engineBoot=import('./engine-v5.js').then(()=>{
  if(!window.wifiCheckerEngineV5)throw new Error('Engine v5 tidak siap.');
  testButtons.forEach(btn=>{if(document.getElementById('engineState')?.textContent.trim().toUpperCase()!=='RUNNING')btn.disabled=false;delete btn.dataset.engineLoading});
  document.documentElement.dataset.engineVersion='5';syncEngineBadges(5);
}).catch(err=>{
  console.warn('[engine-v5] fallback',err);
  testButtons.forEach((btn,i)=>{btn.disabled=false;delete btn.dataset.engineLoading;const label=btn.querySelector('b,span');if(label&&initialButtonLabels[i])label.textContent=initialButtonLabels[i]});
});

Promise.allSettled([
  engineBoot,
  import('./quality.js'),
  import('./meter-flow.js'),
  import('./intelligence.js'),
  import('./accuracy.js'),
  import('./advanced-diagnostics.js'),
  import('./result-audit.js'),
  import('./video-test.js')
]).then(results=>{results.forEach((r,i)=>{if(r.status==='rejected')console.warn('[ui module] fallback',i,r.reason)});syncEngineBadges(window.wifiMeasurementSession?.version||5)});
