'use client';

import Link from 'next/link';
import Image from 'next/image';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useReducedMotionPreference } from '@/lib/use-reduced-motion';
import { useQuery } from '@tanstack/react-query';
import { learningRequest, type Course } from '@/lib/learning';
import {api} from '@/lib/api';
import { ArrowRight, BarChart3, Check, ChevronRight, Code2, Compass, FileText, GraduationCap, Sparkles } from 'lucide-react';
import { useWorkspace } from './workspace';
import { Button } from './ui/button';
import {hasCV} from '@/lib/cv-status';
import {WorkspaceIntroduction} from './workspace-introduction';

export function Dashboard() {
  const { data, demo, identity, link } = useWorkspace();
  const learning = useQuery({queryKey:['hosted-learning',identity,'courses'],queryFn:()=>learningRequest<Course[]>(demo,'/courses')});
  const reduced = useReducedMotionPreference();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, {stiffness:65, damping:24});
  const springY = useSpring(pointerY, {stiffness:65, damping:24});
  const live=useQuery({queryKey:['workspace',identity,'live-jobs',JSON.stringify([data.cv,data.questionnaire,data.skill_evidence])],queryFn:()=>api<{stale:boolean;search:{jobs:{id:string;title:string;company:string;location:string;assessment?:{score:number;explanation:string}}[]}|null}>('/jobs'),enabled:!demo,retry:false});
  const best = demo&&!data.demo_outcomes?data.matches[0]:undefined;
  const bestJob=demo?data.demo_outcomes?.career.search?.jobs[0]:!live.data?.stale?live.data?.search?.jobs.find(job=>job.assessment):undefined;
  const course = learning.data?.find(course => course.enrollment && !course.complete);
  const completed = course?.milestones.length || 0;
  const steps = course?.chapter_count || 0;
  const progress = course?.percent || 0;
  const firstName = data.profile.name?.split(' ')[0];
  const skills = data.evaluation?.skills || [];
  const heroSkills = [...skills.filter(s => s.id === 'python'), ...skills.filter(s => s.id === 'data-analysis'), ...skills]
    .filter((skill, index, all) => all.findIndex(s => s.id === skill.id) === index).slice(0, 2);
  const renewable = best?.title === 'Renewable Energy Data Analyst';
  const needsCV=!demo&&!hasCV(data.cv);

  if(!demo&&data.onboarding?.feature_guide_pending)return <WorkspaceIntroduction/>;

  return <div className="focus-dashboard">
    <section className="future-hero" aria-labelledby="future-heading" onPointerMove={event => {
      if(reduced || event.pointerType !== 'mouse') return;
      const box = event.currentTarget.getBoundingClientRect();
      pointerX.set(((event.clientX-box.left)/box.width-.5)*14);
      pointerY.set(((event.clientY-box.top)/box.height-.5)*10);
    }} onPointerLeave={() => {pointerX.set(0);pointerY.set(0);}}>
      <div className="future-hero-copy">
        <span className="section-label">YOUR FUTURE, IN FOCUS</span>
        <h1 id="future-heading">Your future.<br/>Taking shape.</h1>
        <h2>{firstName ? `Welcome back, ${firstName}.` : 'A new chapter starts here.'}</h2>
        <p>Every step you take opens up a new possibility.<br className="desktop-break"/> Let’s turn your potential into progress.</p>
      </div>
      <motion.div className="future-art" aria-hidden="true" style={reduced ? undefined : {x:springX,y:springY}}>
        <motion.div className="ribbon-float" animate={reduced ? {y:0,rotate:0} : {y:[0,-9,0],rotate:[0,.6,0]}} transition={reduced ? {duration:0} : {duration:8,repeat:Infinity,ease:'easeInOut'}}>
          <Image src="/images/future-ribbon.webp" alt="" width={680} height={560} priority className="future-ribbon" sizes="(max-width: 767px) 85vw, 45vw"/>
        </motion.div>
        {heroSkills.map((skill, i) => <motion.span key={skill.id} className={`floating-skill floating-skill-${i}`} animate={reduced ? {y:0} : {y:[0,i===0?-6:6,0]}} transition={reduced ? {duration:0} : {duration:i===0?6:7,repeat:Infinity,ease:'easeInOut'}}><span>{i === 0 ? <Code2 size={22}/> : <BarChart3 size={22}/>}</span>{skill.name}</motion.span>)}
      </motion.div>
    </section>

    {best ? <motion.section className="featured-career" aria-labelledby="featured-title" whileHover={reduced ? undefined : {y:-3}} transition={reduced ? {duration:0} : {type:'spring',stiffness:260,damping:25}}>
      <span className="section-label"><Sparkles size={19}/> YOUR STRONGEST MATCH</span>
      <div className="featured-career-content">
        {renewable ? <Image src="/images/renewable-energy.webp" alt="Wind turbines across green hills at sunrise" width={190} height={150} className="career-thumbnail" sizes="(max-width: 767px) 90px, 170px"/> : <span className="career-thumbnail career-symbol" aria-hidden="true"><Compass size={58} strokeWidth={1.2}/></span>}
        <div className="featured-career-copy"><h2 id="featured-title">{best.title}</h2><p>{best.summary}</p><Button asChild><Link href={link('/app/pathway', {role:best.id})}>Explore this career <ArrowRight size={18}/></Link></Button></div>
        <div className="featured-career-fit"><strong>{best.score}<span>%</span></strong><span>Personal fit</span><Link className="text-link" href={link('/app/results')}>View all {data.matches.length} matches <ChevronRight size={18}/></Link></div>
      </div>
    </motion.section> : bestJob?<section className="featured-career" aria-labelledby="featured-title"><span className="section-label"><Sparkles size={19}/> {demo?'YOUR EXAMPLE VACANCY MATCH':'YOUR REAL-VACANCY MATCH'}</span><div className="featured-career-content"><span className="career-thumbnail career-symbol" aria-hidden="true"><Compass size={48}/></span><div className="featured-career-copy"><h2 id="featured-title">{bestJob.title}</h2><p>{bestJob.company} · {bestJob.location}</p><p>{bestJob.assessment?.explanation}</p><Button asChild><Link href={link('/app/results')}>{demo?'View example job matches':'View real job matches'}<ArrowRight size={18}/></Link></Button></div><div className="featured-career-fit"><strong>{bestJob.assessment?.score}<span>/100</span></strong><span>{demo?'Fictional example fit':'AI vacancy fit'}</span></div></div></section>:<section className="featured-career career-start" aria-labelledby="featured-title"><span className="icon-tile"><Compass size={26}/></span><div><span className="section-label">YOUR NEXT CHAPTER</span><h2 id="featured-title">Your direction is waiting.</h2><p>Start with your interests and experience. Discover what could come next.</p><Button asChild><Link href={link(needsCV?'/app/cv':data.cv.skills?.length||data.skill_evidence?.length ? '/app/results' : data.questionnaire.completed_step === 5 ? '/app/cv' : '/app/questionnaire')}>{needsCV?'Upload my CV':data.cv.skills?.length||data.skill_evidence?.length ? 'Find real job matches' : data.questionnaire.completed_step === 5 ? 'Add my CV' : 'Discover myself'}<ArrowRight size={18}/></Link></Button></div></section>}

    <section className="learning-next" aria-labelledby="learning-next-title">
      <span className="learning-next-icon"><GraduationCap size={26}/></span>
      <div className="learning-next-copy"><span className="section-label">UP NEXT</span><h2 id="learning-next-title">{course ? course.title : 'Make room for your next course'}</h2><p>{course ? `${completed} of ${steps} chapters passed` : learning.error ? 'Open Learning pathway to retry loading your courses.' : 'Explore hosted courses and keep a record of your progress.'}</p></div>
      {course && <div className="learning-next-progress"><div className="progress-track" role="progressbar" aria-label="Learning pathway progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{width:`${progress}%`}}/></div><span>{progress}%</span></div>}
      <Link className="text-link" href={link('/app/pathway',course?{view:'course',course:course.id}:{view:'catalogue'})}>{course ? 'Continue learning' : 'Explore courses'}<ArrowRight size={18}/></Link>
    </section>

    <div className="dashboard-details">
      <Link href={link('/app/cv',{tab:'assessment'})} className="dashboard-detail"><FileText size={22}/><span>CV quality</span><strong>{data.evaluation?.score ?? '—'}<small>{data.evaluation ? ' / 100' : ''}</small></strong><ChevronRight size={15}/></Link>
      <Link href={link('/app/questionnaire')} className="dashboard-detail"><Compass size={22}/><span>Profile journey</span><strong>{data.completion}%</strong><ChevronRight size={15}/></Link>
      {demo ? <Link className="demo-create text-link" href="/app/dashboard">My workspace <ArrowRight size={15}/></Link> : <span className="dashboard-private"><Check size={14}/> Your progress, at your pace.</span>}
    </div>
  </div>;
}
