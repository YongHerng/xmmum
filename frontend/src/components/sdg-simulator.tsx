'use client';

import {useState,type FormEvent,type ReactNode} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {FlaskConical,RotateCcw,Sparkles} from 'lucide-react';
import {api} from '@/lib/api';
import type {SDGImpact} from '@/lib/sdg';
import {offlineSimulation} from '@/lib/offline-demo';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import styles from './sdg-screen.module.css';

export function SDGSimulator({impact,roleId,children}:{impact:SDGImpact;roleId:string;children:(impact:SDGImpact,simulated:boolean)=>ReactNode}){
  const {data,demo,identity}=useWorkspace();const cvSkills=data.cv.skills||[];
  const [text,setText]=useState(cvSkills.join(', '));
  const [applied,setApplied]=useState<string[]|null>(null);
  const [error,setError]=useState('');
  const query=useQuery({queryKey:['workspace',identity,'sdg-simulation',roleId,applied],enabled:applied!==null,retry:false,
    queryFn:({signal})=>demo?offlineSimulation(roleId,applied!):api<SDGImpact>('/sdg/simulate','POST',{role_id:roleId,skills:applied},{signal,public:true})});
  function explore(event:FormEvent){event.preventDefault();if(query.isFetching)return;const skills=[...new Set(text.split(',').map(value=>value.trim()).filter(Boolean))];
    if(skills.length>100||skills.some(skill=>skill.length>100)){setError('Use up to 100 skills, each 100 characters or fewer.');return;}setError('');setApplied(skills);}
  const simulated=applied!==null&&Boolean(query.data);
  return <><details className={styles.simulator}><summary><FlaskConical size={18}/><span>Explore a different skill set</span><span className={styles.simulatorHint}>What-if simulation</span></summary>
    <form onSubmit={explore}><p>Try skills you might develop for this career. This changes only the connections below; your CV, career matches and progress stay as they are.</p>
      <label htmlFor="simulation-skills">Skills to explore<textarea id="simulation-skills" rows={2} maxLength={10000} value={text} onChange={event=>setText(event.target.value)} placeholder="e.g. Python, SQL, Statistics"/></label>
      <small>Separate skills with commas. Remove all skills to explore a starting point.</small>
      <div className={styles.simulatorActions}><Button aria-disabled={query.isFetching}>Explore these skills</Button><Button type="button" variant="secondary" onClick={()=>{setApplied(null);setText(cvSkills.join(', '));setError('');}}><RotateCcw size={14}/>Use my CV skills</Button></div>
      {(error||query.error)&&<p role="alert" className="error-box">{error||query.error?.message}</p>}
    </form></details>
    {query.isFetching&&<p role="status">Exploring these connections…</p>}
    {simulated&&<p className="notice" role="status">What-if simulation · These are hypothetical skills, not confirmed CV skills. No account data has changed.</p>}
    {children(simulated?query.data!:impact,simulated)}
    <AIExplanation key={`${roleId}:${JSON.stringify(applied||cvSkills)}`} roleId={roleId} skills={applied||cvSkills}/>
  </>;
}

function AIExplanation({roleId,skills}:{roleId:string;skills:string[]}){
  const {demo,identity}=useWorkspace();
  const status=useQuery({queryKey:['workspace',identity,'sdg-summary-status'],enabled:!demo,retry:false,staleTime:60000,queryFn:({signal})=>api<{available:boolean}>('/sdg/summary/status','GET',undefined,{signal,public:true})});
  const summary=useMutation({mutationFn:()=>api<{role_summary:string;generation_engine:string;notice:string}>('/sdg/summary','POST',{role_id:roleId,skills})});
  return <details className={styles.simulator}><summary><Sparkles size={18}/><span>Another way to explain the connection</span></summary><div className={styles.aiExplanation}>
    <p>Optional AI wording can help you reflect on these connections. It does not verify skills or change your CV, XP or career scores.</p>
    {demo?<p>Sign in to request optional AI wording. This demo uses curated explanations.</p>:!status.data?.available?<p>AI wording is currently unavailable. The curated connections above remain available.</p>:<><p>Your selected career and skills go to Google Gemini. No name, email or CV document is included.</p><Button disabled={summary.isPending} onClick={()=>summary.mutate()}>{summary.isPending?'Writing an explanation…':'Request AI wording'}</Button></>}
    {summary.error&&<p role="alert" className="error-box">{summary.error.message}</p>}
    {summary.data&&<div aria-live="polite"><p>{summary.data.role_summary}</p><small>{summary.data.notice}</small></div>}
  </div></details>;
}
