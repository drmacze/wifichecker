const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine=matchMedia('(hover: hover) and (pointer: fine)').matches;

function icons(){
  const draw=()=>{try{if(window.lucide?.createIcons){lucide.createIcons({attrs:{'stroke-width':1.85}});return true}}catch(e){console.warn('[motion] icons',e)}return false};
  if(!draw()) addEventListener('load',draw,{once:true});
}
icons();

async function libraries(){
  const [l,g,s]=await Promise.all([
    import('https://cdn.jsdelivr.net/npm/lenis@1.3.26/+esm'),
    import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/+esm'),
    import('https://cdn.jsdelivr.net/npm/gsap@3.15.0/ScrollTrigger/+esm')
  ]);
  const Lenis=l.default,gsap=g.gsap||g.default,ScrollTrigger=s.ScrollTrigger||s.default;
  if(!Lenis||!gsap||!ScrollTrigger) throw Error('Motion libraries unavailable');
  return{Lenis,gsap,ScrollTrigger};
}

function smooth(Lenis,gsap,ScrollTrigger){
  if(reduced){document.body.classList.add('motion-reduced');return null}
  const lenis=new Lenis({duration:1.08,lerp:.085,smoothWheel:true,syncTouch:false,wheelMultiplier:.92,touchMultiplier:1.05,anchors:{offset:-12},autoRaf:false});
  lenis.on('scroll',ScrollTrigger.update);
  gsap.ticker.add(t=>lenis.raf(t*1000));
  gsap.ticker.lagSmoothing(0);
  document.querySelectorAll('.modal-card').forEach(el=>el.setAttribute('data-lenis-prevent',''));
  window.wifiCheckerLenis=lenis;
  return lenis;
}

function cursorFX(gsap){
  if(reduced)return;
  const orb=document.createElement('div');orb.className='motion-orb';document.body.append(orb);
  if(fine){
    const ox=gsap.quickTo(orb,'x',{duration:1.1,ease:'power3.out'}),oy=gsap.quickTo(orb,'y',{duration:1.1,ease:'power3.out'});
    addEventListener('pointermove',e=>{document.documentElement.style.setProperty('--mx',e.clientX+'px');document.documentElement.style.setProperty('--my',e.clientY+'px');ox(e.clientX);oy(e.clientY)},{passive:true});
  }else gsap.set(orb,{x:innerWidth*.74,y:innerHeight*.26});
}

function scrollBar(gsap,ScrollTrigger){
  const bar=document.createElement('div');bar.className='motion-scroll-indicator';document.body.append(bar);
  gsap.to(bar,{scaleX:1,ease:'none',scrollTrigger:{trigger:document.documentElement,start:'top top',end:'bottom bottom',scrub:.15}});
}

function hero(gsap){
  if(reduced)return;
  gsap.timeline({defaults:{ease:'power3.out'}})
    .from('.topbar',{y:-20,opacity:0,duration:.7})
    .from('.hero-copy .kicker',{y:16,opacity:0,duration:.5},'-=.38')
    .from('.hero-copy h1',{y:38,opacity:0,clipPath:'inset(0 0 100% 0)',duration:1},'-=.3')
    .from('.hero-lead',{y:22,opacity:0,duration:.65},'-=.62')
    .from('.hero-actions>*',{y:18,opacity:0,duration:.5,stagger:.1},'-=.48')
    .from('.trust-row>*',{y:12,opacity:0,duration:.42,stagger:.065},'-=.32')
    .from('.hero-instrument',{x:34,y:20,scale:.96,rotateY:-6,opacity:0,duration:1},'-=.9')
    .from('.status-rail>*',{y:14,opacity:0,stagger:.05,duration:.4},'-=.45');
}

function reveals(gsap,ScrollTrigger){
  if(reduced)return;
  [['.metrics-grid .metric',42],['.detail-grid .panel',38],['.wide-grid .panel',38],['.insight-grid .panel',38]].forEach(([sel,y])=>{
    const els=gsap.utils.toArray(sel);if(!els.length)return;
    gsap.from(els,{y,opacity:0,scale:.985,duration:.82,ease:'power3.out',stagger:.08,scrollTrigger:{trigger:els[0].parentElement,start:'top 86%',once:true}})
  });
  gsap.utils.toArray('[data-motion="section-head"]').forEach(el=>gsap.from(el.children,{y:24,opacity:0,duration:.7,stagger:.08,ease:'power3.out',scrollTrigger:{trigger:el,start:'top 90%',once:true}}));
  gsap.from('.test-console',{y:34,opacity:0,scaleX:.985,duration:.86,ease:'power3.out',scrollTrigger:{trigger:'.test-console',start:'top 90%',once:true}});
  gsap.from('.export-bar',{y:36,opacity:0,scale:.985,duration:.86,ease:'power3.out',scrollTrigger:{trigger:'.export-bar',start:'top 92%',once:true}});
  gsap.to('.ambient-a',{yPercent:22,xPercent:8,ease:'none',scrollTrigger:{trigger:document.documentElement,start:'top top',end:'bottom bottom',scrub:1.2}});
  gsap.to('.ambient-b',{yPercent:-18,xPercent:-10,ease:'none',scrollTrigger:{trigger:document.documentElement,start:'top top',end:'bottom bottom',scrub:1.5}});
}

function instrument(gsap){
  if(reduced)return;
  gsap.to('.radar-ring.r1',{rotation:360,duration:18,repeat:-1,ease:'none'});
  gsap.to('.radar-ring.r2',{rotation:-360,duration:24,repeat:-1,ease:'none'});
  gsap.to('.radar-ring.r3',{scale:1.035,opacity:.58,duration:2.4,yoyo:true,repeat:-1,ease:'sine.inOut'});
  gsap.to('.location-radar i',{scale:1.12,opacity:.28,duration:1.7,yoyo:true,repeat:-1,stagger:.28,ease:'sine.inOut'});
  gsap.to('.pulse-dot',{scale:1.35,opacity:.55,duration:.8,yoyo:true,repeat:-1,ease:'sine.inOut'});
  gsap.utils.toArray('.signal-strip span').forEach((b,i)=>gsap.to(b,{scaleY:()=>gsap.utils.random(.32,1.25),opacity:()=>gsap.utils.random(.45,1),duration:()=>gsap.utils.random(.55,1.05),delay:i*.035,repeat:-1,yoyo:true,repeatRefresh:true,ease:'sine.inOut'}));
  const dial=document.querySelector('.speed-dial'),box=document.querySelector('.hero-instrument');
  if(fine&&dial&&box){box.addEventListener('pointermove',e=>{const r=box.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;gsap.to(dial,{rotateY:x*4.5,rotateX:y*-4.5,duration:.6,ease:'power3.out'})});box.addEventListener('pointerleave',()=>gsap.to(dial,{rotateX:0,rotateY:0,duration:.75,ease:'elastic.out(1,.5)'}))}
}

function magnetic(gsap){
  if(!fine||reduced)return;
  document.querySelectorAll('.cta,.soft-btn,.ghost-icon,.mini-btn').forEach(el=>{el.addEventListener('pointermove',e=>{const r=el.getBoundingClientRect();gsap.to(el,{x:(e.clientX-r.left-r.width/2)*.1,y:(e.clientY-r.top-r.height/2)*.14,duration:.35,ease:'power3.out'})});el.addEventListener('pointerleave',()=>gsap.to(el,{x:0,y:0,duration:.65,ease:'elastic.out(1,.45)'}))});
}

function tilt(gsap){
  if(!fine||reduced)return;
  document.querySelectorAll('.metric,.detail-grid .panel,.wide-grid .panel,.insight-grid .panel').forEach(card=>{card.dataset.tilt='true';card.addEventListener('pointermove',e=>{const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width,y=(e.clientY-r.top)/r.height;card.style.setProperty('--card-x',x*100+'%');card.style.setProperty('--card-y',y*100+'%');gsap.to(card,{rotateX:(.5-y)*3.6,rotateY:(x-.5)*4.2,y:-3,duration:.38,transformPerspective:900,ease:'power2.out'})});card.addEventListener('pointerleave',()=>gsap.to(card,{rotateX:0,rotateY:0,y:0,duration:.7,ease:'elastic.out(1,.55)'}))});
}

function header(gsap,ScrollTrigger){
  const el=document.querySelector('.topbar');if(!el)return;
  ScrollTrigger.create({start:18,end:'max',onUpdate:self=>{el.classList.toggle('motion-scrolled',self.scroll()>20);if(!reduced&&self.scroll()>120)gsap.to(el,{y:self.direction>0?-92:0,duration:.38,ease:'power3.out',overwrite:true})}})
}

function values(gsap){
  ['downloadValue','uploadValue','pingValue','jitterValue','dialValue','testPercent','bufferbloatGrade'].forEach(id=>{const el=document.getElementById(id);if(!el)return;let prev=el.textContent;new MutationObserver(()=>{const next=el.textContent;if(next===prev)return;prev=next;if(reduced)return;gsap.fromTo(el,{y:7,scale:.94,opacity:.68},{y:0,scale:1,opacity:1,duration:.34,ease:'back.out(2)',overwrite:true});el.classList.add('motion-value-pop');gsap.delayedCall(.32,()=>el.classList.remove('motion-value-pop'))}).observe(el,{childList:true,characterData:true,subtree:true})})
}

function modals(gsap,lenis){
  document.querySelectorAll('.modal').forEach(modal=>{const card=modal.querySelector('.modal-card');if(!card)return;let before=modal.getAttribute('aria-hidden')==='false';const check=()=>{const open=modal.getAttribute('aria-hidden')==='false'||modal.classList.contains('open');if(open===before)return;before=open;if(open){lenis?.stop();if(!reduced)gsap.fromTo(card,{y:30,scale:.95,opacity:0},{y:0,scale:1,opacity:1,duration:.48,ease:'back.out(1.5)'})}else lenis?.start()};new MutationObserver(check).observe(modal,{attributes:true,attributeFilter:['aria-hidden','class']})})
}

async function init(){
  try{
    const{Lenis,gsap,ScrollTrigger}=await libraries();gsap.registerPlugin(ScrollTrigger);document.documentElement.classList.add('motion-ready');
    const lenis=smooth(Lenis,gsap,ScrollTrigger);cursorFX(gsap);scrollBar(gsap,ScrollTrigger);hero(gsap);reveals(gsap,ScrollTrigger);instrument(gsap);magnetic(gsap);tilt(gsap);header(gsap,ScrollTrigger);values(gsap);modals(gsap,lenis);
    let timer;addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(()=>ScrollTrigger.refresh(),120)},{passive:true});if(document.fonts?.ready)document.fonts.ready.then(()=>ScrollTrigger.refresh()).catch(()=>{});
    window.wifiCheckerMotion={gsap,ScrollTrigger,lenis,versions:{gsap:'3.15.0',lenis:'1.3.26',lucide:'1.33.0'}};
    dispatchEvent(new CustomEvent('wifi-checker:motion-ready'));
  }catch(e){document.documentElement.classList.add('motion-fallback');console.error('[motion] Advanced motion unavailable; diagnostics remain functional.',e)}
}

document.readyState==='loading'?addEventListener('DOMContentLoaded',init,{once:true}):init();
