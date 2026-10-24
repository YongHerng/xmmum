'use client';

import {useRouter} from 'next/navigation';
import {useMutation} from '@tanstack/react-query';
import {ArrowRight,CheckCircle2,Compass,GraduationCap,Leaf,Loader2,MessagesSquare,Newspaper} from 'lucide-react';
import {api} from '@/lib/api';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import s from './workspace-introduction.module.css';

const functions=[
  {path:'/app/results',title:'Career matches',description:'Explore career directions matched to your skills, interests and preferences.',icon:Compass},
  {path:'/app/pathway',title:'Learning pathway',description:'Find courses, build skills and track your learning progress.',icon:GraduationCap},
  {path:'/app/sdg',title:'SDG impact',description:'Explore how your skills and projects connect to sustainable development.',icon:Leaf},
  {path:'/app/community',title:'Community',description:'Share reflections and projects, and learn from other people.',icon:MessagesSquare},
  {path:'/app/news',title:'News',description:'Read recent career and sustainability headlines for your direction.',icon:Newspaper},
];

export function WorkspaceIntroduction(){
  const {reload,link}=useWorkspace();const router=useRouter();
  const choice=useMutation({mutationFn:async(path:string)=>{
    await api('/onboarding/guide/complete','POST');
    await reload();
    router.push(link(path));
  }});
  return <section className={s.guide} aria-labelledby="introduction-title" aria-busy={choice.isPending}>
    <div className="page-title"><div><span className="section-label">READY FOR YOUR NEXT STEP</span><h1 id="introduction-title">Your profile is ready. Where next?</h1><p>Choose a place to begin. Here’s what you can do in your workspace.</p></div></div>
    <div className={`notice ${s.saved}`}><CheckCircle2 size={19}/><p>Your CV and Discover Yourself answers are saved. Use the profile icon at the top right to review or update them anytime.</p></div>
    <div className={s.grid}>{functions.map(({path,title,description,icon:Icon})=><article className={`card ${s.function}`} key={path}><span className="icon-tile"><Icon size={22}/></span><h2>{title}</h2><p>{description}</p><Button variant="secondary" disabled={choice.isPending} onClick={()=>choice.mutate(path)}>Open {title.toLowerCase()} <ArrowRight size={15}/></Button></article>)}</div>
    {choice.error&&<p className="error-box" role="alert">We couldn’t save the introduction as finished. {choice.error.message} Please try again.</p>}
    <footer className={s.footer}><p>You can also start at Overview and use the sidebar to explore.</p><Button disabled={choice.isPending} onClick={()=>choice.mutate('/app/dashboard')}>{choice.isPending?<Loader2 size={15} className="spin"/>:null}Go to my overview <ArrowRight size={15}/></Button></footer>
  </section>;
}
