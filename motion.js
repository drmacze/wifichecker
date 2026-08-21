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
  const topbar=document.querySelector('.topbar');
  addEventListener('scroll',()=>topbar?.classList.toggle('motion-scrolled',scrollY>8),{passive:true});
  if(!reduced){
    const items=['.topbar','.command-strip','.meter-card','.compact-console','.intel-dock'];
    const targets=items.flatMap(sel=>[...document.querySelectorAll(sel)]);
    gsap.fromTo(targets,{y:14,autoAlpha:0},{y:0,autoAlpha:1,duration:.5,stagger:.055,ease:'power2.out',clearProps:'transform,opacity,visibility'});
    document.querySelectorAll('.modal').forEach(modal=>{const card=modal.querySelector('.modal-card');new MutationObserver(()=>{const open=modal.classList.contains('open');if(open){lenis?.stop();gsap.fromTo(card,{y:18,scale:.98,autoAlpha:0},{y:0,scale:1,autoAlpha:1,duration:.26,ease:'power2.out'})}else if(!document.querySelector('.modal.open'))lenis?.start()}).observe(modal,{attributes:true,attributeFilter:['class']})});
  }
  setTimeout(()=>ScrollTrigger.refresh(),120);
}).catch(err=>{console.warn('[motion] fallback',err);document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'))});

import('./engine-v3.js').catch(err=>console.warn('[engine-v3] fallback',err));
import('./quality.js').catch(err=>console.warn('[quality] fallback',err));
import('./meter-flow.js').catch(err=>console.warn('[meter-flow] fallback',err));
import('./intelligence.js').catch(err=>console.warn('[intelligence] fallback',err));
