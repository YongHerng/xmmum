'use client';

import {useEffect, type RefObject} from 'react';
import {gsap} from 'gsap';
import {ScrollTrigger} from 'gsap/ScrollTrigger';
import {useReducedMotionPreference} from '@/lib/use-reduced-motion';

/** Native scrolling drives the choreography. All effects belong to this page. */
export function useLandingMotion(root:RefObject<HTMLDivElement|null>) {
  const reduced=useReducedMotionPreference();
  useEffect(()=>{
    const scope=root.current;
    if(!scope||reduced)return;
    gsap.registerPlugin(ScrollTrigger);
    const media=gsap.matchMedia();
    const context=gsap.context(()=>{
      gsap.from('[data-hero-word]',{yPercent:115,rotation:3,duration:1,stagger:.12,ease:'power4.out',clearProps:'transform'});
      gsap.from('[data-hero-support]',{y:20,opacity:0,duration:.7,stagger:.1,delay:.25,ease:'power3.out',clearProps:'transform,opacity'});

      media.add({desktop:'(min-width: 960px)',mobile:'(max-width: 959px)'},conditions=>{
        const desktop=Boolean(conditions.conditions?.desktop);
        const preview=scope.querySelector('[data-showcase-panel]');
        if(preview)gsap.fromTo(preview,
          {rotationX:desktop?19:0,rotationY:desktop?-12:0,rotationZ:desktop?-5:-1.5,scale:desktop?.83:.97,y:desktop?70:24},
          {rotationX:0,rotationY:0,rotationZ:0,scale:1,y:0,ease:'none',scrollTrigger:{trigger:preview,start:'top 92%',end:'top 18%',scrub:.8}});

        const facts=gsap.utils.toArray<HTMLElement>('[data-fact]',scope);
        facts.forEach((card,i)=>gsap.from(card,{y:desktop?90:32,rotation:desktop?[-6,5,-3][i]:0,opacity:.35,
          ease:'power2.out',scrollTrigger:{trigger:card,start:'top 98%',end:'top 68%',scrub:.5}}));

        const chapters=gsap.utils.toArray<HTMLElement>('[data-journey-card]',scope);
        chapters.forEach((card,i)=>{
          gsap.from(card,{y:desktop?80:30,rotation:desktop?(i%2?4:-4):1.5,transformOrigin:'center top',
            ease:'none',scrollTrigger:{trigger:card,start:'top 95%',end:desktop?'top 48%':'top 65%',scrub:.65}});
          if(desktop&&chapters[i+1])gsap.to(card,{scale:.94,transformOrigin:'center top',ease:'none',
            scrollTrigger:{trigger:chapters[i+1],start:'top 80%',end:'top 30%',scrub:.6}});
        });

        gsap.utils.toArray<HTMLElement>('[data-feature-card]',scope).forEach((card,i)=>{
          gsap.from(card,{y:desktop?100:35,x:desktop?(i%2?35:-35):0,rotation:desktop?(i%2?3:-3):0,opacity:.3,
            ease:'power2.out',scrollTrigger:{trigger:card,start:'top 98%',end:'top 55%',scrub:.65}});
        });

        gsap.utils.toArray<HTMLElement>('[data-persona]',scope).forEach((card,i)=>{
          gsap.from(card,{y:desktop?(i?110:60):30,rotation:desktop?(i?4:-4):0,opacity:.5,
            ease:'power2.out',scrollTrigger:{trigger:card,start:'top 95%',end:'top 58%',scrub:.6}});
        });
      },scope);

      gsap.utils.toArray<HTMLElement>('[data-heading-reveal]',scope).forEach(heading=>{
        gsap.from(heading,{y:38,opacity:.25,duration:.85,ease:'power3.out',
          scrollTrigger:{trigger:heading,start:'top 92%',toggleActions:'play none none reverse'}});
      });
      // Keyboard navigation must reveal focused controls immediately, even if a
      // scroll-linked entrance has not completed. CSS also raises stacked cards.
      const focus=(event:FocusEvent)=>{
        const card=(event.target as HTMLElement).closest<HTMLElement>('[data-journey-card],[data-feature-card],[data-persona]');
        if(card)gsap.set(card,{opacity:1});
      };
      scope.addEventListener('focusin',focus);
      return()=>scope.removeEventListener('focusin',focus);
    },scope);
    return()=>{media.revert();context.revert()};
  },[root,reduced]);
}
