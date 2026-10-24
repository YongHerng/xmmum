'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { useReducedMotionPreference } from '@/lib/use-reduced-motion';

/** Re-enters from the viewport edge in either direction; never hides active controls. */
export function ScrollReveal({children,className='',subtle=false}:{children:ReactNode;className?:string;subtle?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  const controls=useAnimationControls();
  const reduced=useReducedMotionPreference();
  useEffect(()=>{
    const node=ref.current;
    if(!node||reduced||!('IntersectionObserver' in window)) {
      controls.set({y:0,opacity:1});
      if(node)node.dataset.revealState='static';
      return;
    }
    const distance=subtle?12:28;
    let outside=false;
    const reset=()=>controls.set({y:0,opacity:1});
    // No scroll listener or per-frame React state. Observe only viewport crossings.
    const observer=new IntersectionObserver(entries=>{
      for(const entry of entries){
        if(node.contains(document.activeElement)){reset();continue}
        if(entry.isIntersecting){
          if(outside)void controls.start({y:0,opacity:1,transition:{duration:subtle?.22:.36,ease:[.22,1,.36,1]}});
          outside=false;
          node.dataset.revealState='visible';
        }else{
          outside=true;
          // Move away only AFTER the element leaves view. Never fade out readable content.
          const below=entry.boundingClientRect.top>=(entry.rootBounds?.bottom??window.innerHeight);
          controls.set({y:below?distance:-distance,opacity:subtle?.94:.82});
          node.dataset.revealState=below?'below':'above';
        }
      }
    },{threshold:0});
    observer.observe(node);
    node.addEventListener('focusin',reset);
    return()=>{observer.disconnect();node.removeEventListener('focusin',reset);controls.stop()};
  },[controls,reduced,subtle]);
  return <motion.div ref={ref} className={className} data-reveal data-reveal-tone={subtle?'subtle':'expressive'} initial={false} animate={controls}>{children}</motion.div>;
}
