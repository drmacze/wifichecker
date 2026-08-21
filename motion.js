const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover: hover) and (pointer: fine)').matches;

function renderIcons(){
  const draw=()=>{try{if(window.lucide?.createIcons){window.lucide.createIcons({attrs:{'stroke-width':1.75}});return true}}catch(e){console.warn('[signal-os] icons',e)}return false};
  if(!draw())addEventListener('load',draw,{once:true});
}
renderIcons();

async function loadMotionLibraries(){
  const [lenisMod,gsapMod,stMod]=await Promise.all([
    import('https://cdn.jsdelivr.net/npm/lenis@1.3.26/+esm'),
    import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/ScrollTrigger/+esm')
  ]);
  const Lenis=lenisMod.default;
  const gsap=gsapMod.gsap||gsapMod.default;
  const ScrollTrigger=stMod.ScrollTrigger||stMod.default;
  if(!Lenis||!gsap||!ScrollTrigger)throw new Error('Motion libraries unavailable');
  gsap.registerPlugin(ScrollTrigger);
  return{Lenis,gsap,ScrollTrigger};
}

function installLenis(Lenis,gsap,ScrollTrigger){
  if(reduced){document.body.classList.add('motion-reduced');return null}
  const lenis=new Lenis({duration:1.05,lerp:.09,smoothWheel:true,syncTouch:false,wheelMultiplier:.88,touchMultiplier:1,anchors:{offset:-18},autoRaf:false});
  lenis.on('scroll',ScrollTrigger.update);
  gsap.ticker.add(time=>lenis.raf(time*1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('.modal-card').forEach(el=>el.setAttribute('data-lenis-prevent',''));
  window.wifiCheckerLenis=lenis;
  return lenis;
}

function installScrollChrome(gsap,ScrollTrigger){
  const bar=document.createElement('div');
  bar.className='motion-scroll-indicator';
  document.body.append(bar);
  gsap.to(bar,{scaleX:1,ease:'none',scrollTrigger:{start:0,end:'max',scrub:.25}});

  const topbar=document.querySelector('.topbar');
  ScrollTrigger.create({start:18,onUpdate:self=>topbar?.classList.toggle('motion-scrolled',self.scroll()>18)});

  if(!reduced){
    gsap.to('.ambient-a',{yPercent:28,xPercent:8,ease:'none',scrollTrigger:{start:0,end:'max',scrub:1.1}});
    gsap.to('.ambient-b',{yPercent:-22,xPercent:-6,ease:'none',scrollTrigger:{start:0,end:'max',scrub:1.3}});
  }
}

function heroSequence(gsap){
  if(reduced)return;
  const tl=gsap.timeline({defaults:{ease:'power3.out'}});
  tl.from('.topbar',{y:-22,autoAlpha:0,duration:.7})
    .from('.kicker',{x:-24,autoAlpha:0,duration:.55},-.3)
    .from('.hero-copy h1',{y:70,autoAlpha:0,rotate:.8,duration:1.05},-.3)
    .from('.hero-lead',{y:22,autoAlpha:0,duration:.65},-.63)
    .from('.hero-actions>*',{y:18,autoAlpha:0,duration:.55,stagger:.08},-.46)
    .from('.trust-row>*',{y:12,autoAlpha:0,duration:.45,stagger:.055},-.35)
    .from('.hero-instrument',{clipPath:'inset(12% 0 12% 100% round 24px)',x:46,autoAlpha:0,duration:1.05,ease:'power4.inOut'},-.92)
    .from('.status-rail',{y:20,autoAlpha:0,duration:.55},-.38);
}

function sectionReveals(gsap,ScrollTrigger){
  if(reduced){document.querySelectorAll('.reveal').forEach(el=>{el.style.opacity='';el.style.transform='' });return}
  const sections=gsap.utils.toArray('.reveal').filter(el=>!el.matches('[data-motion="hero"]'));
  sections.forEach((section,index)=>{
    const children=section.matches('.metrics-grid,.detail-grid,.wide-grid,.insight-grid')?[...section.children]:[section];
    gsap.fromTo(children,{y:34,autoAlpha:0,clipPath:'inset(0 0 12% 0)'},{y:0,autoAlpha:1,clipPath:'inset(0 0 0% 0)',duration:.72,stagger:.075,ease:'power3.out',scrollTrigger:{trigger:section,start:'top 86%',once:true}});
  });

  gsap.utils.toArray('.section-head').forEach(head=>{
    gsap.from(head.querySelectorAll('.overline,h2,.tiny-badge'),{y:15,autoAlpha:0,duration:.55,stagger:.065,ease:'power3.out',scrollTrigger:{trigger:head,start:'top 90%',once:true}});
  });
}

function instrumentMotion(gsap){
  if(reduced)return;
  gsap.to('.r1',{scale:1.07,opacity:.15,duration:2.2,repeat:-1,yoyo:true,ease:'sine.inOut'});
  gsap.to('.r2',{scale:.95,opacity:.38,duration:2.7,repeat:-1,yoyo:true,ease:'sine.inOut',delay:.25});
  gsap.to('.r3',{scale:1.04,opacity:.25,duration:2,repeat:-1,yoyo:true,ease:'sine.inOut',delay:.5});
  document.querySelectorAll('.signal-strip span').forEach((bar,i)=>{
    gsap.to(bar,{scaleY:gsap.utils.random(.35,1.55),opacity:gsap.utils.random(.35,.95),duration:gsap.utils.random(.45,.9),repeat:-1,yoyo:true,ease:'sine.inOut',delay:i*.035});
  });

  const instrument=document.querySelector('.hero-instrument');
  if(fine&&instrument){
    const rx=gsap.quickTo(instrument,'rotationX',{duration:.7,ease:'power3.out'});
    const ry=gsap.quickTo(instrument,'rotationY',{duration:.7,ease:'power3.out'});
    instrument.addEventListener('pointermove',e=>{const r=instrument.getBoundingClientRect();const x=(e.clientX-r.left)/r.width-.5;const y=(e.clientY-r.top)/r.height-.5;rx(-y*2.2);ry(x*2.6)});
    instrument.addEventListener('pointerleave',()=>{rx(0);ry(0)});
  }
}

function pointerSystem(gsap){
  if(reduced||!fine)return;
  const cross=document.createElement('div');
  cross.className='motion-crosshair';
  document.body.append(cross);
  const cx=gsap.quickTo(cross,'x',{duration:.32,ease:'power3.out'});
  const cy=gsap.quickTo(cross,'y',{duration:.32,ease:'power3.out'});
  addEventListener('pointermove',e=>{document.documentElement.style.setProperty('--mx',e.clientX+'px');document.documentElement.style.setProperty('--my',e.clientY+'px');cx(e.clientX);cy(e.clientY)},{passive:true});

  document.querySelectorAll('.cta,.soft-btn,.ghost-icon,.mini-btn,.text-btn').forEach(el=>{
    const xTo=gsap.quickTo(el,'x',{duration:.35,ease:'power3.out'}),yTo=gsap.quickTo(el,'y',{duration:.35,ease:'power3.out'});
    el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();xTo((e.clientX-r.left-r.width/2)*.09);yTo((e.clientY-r.top-r.height/2)*.12)});
    el.addEventListener('pointerleave',()=>{xTo(0);yTo(0)});
  });
}

function cardResponse(gsap){
  if(reduced||!fine)return;
  document.querySelectorAll('.metric:not(:first-child),.panel').forEach(card=>{
    card.dataset.tilt='true';
    const x=gsap.quickTo(card,'rotationY',{duration:.5,ease:'power3.out'}),y=gsap.quickTo(card,'rotationX',{duration:.5,ease:'power3.out'});
    card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect();x(((e.clientX-r.left)/r.width-.5)*2.1);y(-((e.clientY-r.top)/r.height-.5)*1.65)});
    card.addEventListener('pointerleave',()=>{x(0);y(0)});
  });
}

function liveValueMotion(gsap){
  const ids=['downloadValue','uploadValue','pingValue','jitterValue','dialValue','testPercent','engineState','testStage','fastestDns'];
  ids.forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    let previous=el.textContent;
    new MutationObserver(()=>{const next=el.textContent;if(next===previous)return;previous=next;if(reduced)return;gsap.fromTo(el,{y:5,autoAlpha:.4,scale:.97},{y:0,autoAlpha:1,scale:1,duration:.28,ease:'power2.out',overwrite:true});el.classList.add('motion-value-pop');clearTimeout(el._motionTimer);el._motionTimer=setTimeout(()=>el.classList.remove('motion-value-pop'),320)}).observe(el,{childList:true,characterData:true,subtree:true});
  });
}

function modalMotion(gsap,lenis){
  document.querySelectorAll('.modal').forEach(modal=>{
    const card=modal.querySelector('.modal-card');
    new MutationObserver(()=>{
      const open=modal.classList.contains('open');
      if(open){lenis?.stop();if(!reduced){gsap.fromTo(card,{y:34,scale:.965,autoAlpha:0},{y:0,scale:1,autoAlpha:1,duration:.42,ease:'power3.out',overwrite:true});gsap.from(modal.querySelectorAll('.permission-row'),{x:18,autoAlpha:0,duration:.38,stagger:.045,ease:'power2.out',delay:.08})}}
      else{if(!document.querySelector('.modal.open'))lenis?.start()}
    }).observe(modal,{attributes:true,attributeFilter:['class']});
  });
}

loadMotionLibraries().then(({Lenis,gsap,ScrollTrigger})=>{
  document.body.classList.add('motion-ready');
  const lenis=installLenis(Lenis,gsap,ScrollTrigger);
  installScrollChrome(gsap,ScrollTrigger);
  heroSequence(gsap);
  sectionReveals(gsap,ScrollTrigger);
  instrumentMotion(gsap);
  pointerSystem(gsap);
  cardResponse(gsap);
  liveValueMotion(gsap);
  modalMotion(gsap,lenis);
  addEventListener('resize',()=>ScrollTrigger.refresh(),{passive:true});
  setTimeout(()=>ScrollTrigger.refresh(),250);
}).catch(error=>{
  console.warn('[signal-os] motion fallback',error);
  document.body.classList.add('motion-fallback');
  document.querySelectorAll('.reveal').forEach(el=>el.classList.add('visible'));
});
