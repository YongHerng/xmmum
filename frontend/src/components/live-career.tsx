'use client';
import {useEffect,useRef,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import Link from 'next/link';
import {ArrowUpRight,BriefcaseBusiness,Clock3,Loader2,MapPin,Search,Sparkles,TrendingUp,Compass as CompassIcon} from 'lucide-react';
import {api} from '@/lib/api';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {CareerOutlookMap,type CareerOutlook} from './career-outlook';
import {JobSkillPath,type JobSkillGap} from './job-skill-path';
import type {CareerDirection} from '@/lib/types';
import s from './live-career.module.css';

type Fit={job_id:string;score:number;explanation:string;matched_skills:string[];current_matched_skills?:string[];missing_requirements:string[];unknowns:string[];skill_gaps?:JobSkillGap[]};
type Job={id:string;title:string;company:string;location:string;description:string;apply_url:string;publisher:string;posted_at:string;employment_type:string;salary:string|null;assessment?:Fit};
type JobSearch={jobs:Job[];query:string;country:string;fetched_at:string;assessed_at:string|null;auto_refresh:boolean;ai_status:string;model:string};
type Outlook=CareerOutlook;
export type CareerState={search:JobSearch|null;stale:boolean;configured?:boolean;outlook?:Outlook|null;outlook_stale?:boolean;direction?:CareerDirection|null;direction_stale?:boolean};
type State=CareerState;

export function LiveCareerIntelligence(){
 const {data,demo,identity,link}=useWorkspace();
 const fingerprint=JSON.stringify([data.cv,data.questionnaire,data.skill_evidence]);
 const saved=useQuery({queryKey:['workspace',identity,'live-jobs',fingerprint],queryFn:()=>api<State>('/jobs'),enabled:!demo,retry:false});
 const [tab,setTab]=useState('jobs'),[query,setQuery]=useState(()=>`${data.roles.find(role=>role.id===data.selected_role)?.title||'Entry level jobs'} in ${data.questionnaire.location||'Malaysia'}`),[country,setCountry]=useState('my');
 const [automatic,setAutomatic]=useState(false),[years,setYears]=useState<5|10|15>(5);
 const current=demo?data.demo_outcomes?.career:saved.data;
 const result=current?.search;
 const direction=current?.direction;
 const usedDirection=useRef('');
 useEffect(()=>{if(direction&&usedDirection.current!==direction.title){usedDirection.current=direction.title;setQuery(`${direction.title} in ${data.questionnaire.location||'Malaysia'}`);}},[direction,data.questionnaire.location]);
 const search=useMutation({mutationFn:()=>api<State>('/jobs/search','POST',{query,country,auto_refresh:automatic},{timeoutMs:270000}),onSuccess:()=>saved.refetch()});
 const rematch=useMutation({mutationFn:()=>api<State>('/jobs/rematch','POST',{}, {timeoutMs:200000}),onSuccess:()=>saved.refetch()});
 const pause=useMutation({mutationFn:()=>api('/jobs/pause-updates','POST'),onSuccess:()=>saved.refetch()});
 const outlook=useMutation({mutationFn:()=>api<Outlook>('/jobs/outlook','POST',{role:query,years},{timeoutMs:200000}),onSuccess:()=>saved.refetch()});
 useEffect(()=>{const horizon=current?.outlook?.horizon_years;if(horizon)setYears(horizon);},[current?.outlook?.horizon_years]);
 const attempted=useRef(new Set<string>());
 useEffect(()=>{
   if(!demo&&current?.stale&&result?.auto_refresh&&result.jobs.length&&!rematch.isPending&&!search.isPending){
     const key=fingerprint+result.fetched_at;
     if(!attempted.current.has(key)){attempted.current.add(key);rematch.mutate();}
   }
 },[fingerprint,result,current?.stale,rematch,search.isPending]);
 const busy=search.isPending||rematch.isPending||outlook.isPending;
 const error=search.error||rematch.error||outlook.error||saved.error||pause.error;
 const report=demo?data.demo_outcomes?.outlooks[String(years)]:current?.outlook;
 return <div className="page-enter"><header className={s.title}><div><span className="eyebrow">{demo?'EXPECTED OUTCOME · OFFLINE DEMO':'REAL OPPORTUNITIES · YOUR NEXT CHAPTER'}</span><h1>{demo?'Career matches, illustrated.':'Find work that connects with you.'}</h1><p>{demo?'Explore the current matching flow with fictional jobs, skill evidence and learning gaps.':'Real vacancies, AI-assessed fit and a clear view of what you could build next.'}</p></div><Button asChild variant="secondary"><Link href={link('/app/cv')}>{demo?'View example CV':'Edit my CV'}</Link></Button></header>
 {demo&&<p className="notice" role="status">Hardcoded backup demo · No AI or job API requests. Vacancies, employers, scores and badges are fictional; no applications are accepted.</p>}
 <div className="tabs" role="tablist" aria-label="Career intelligence views">{[['jobs',demo?'Example job matches':'Real job matches'],['outlook','Future roles & outlook']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
 {tab==='jobs'&&(direction?<section className={`card ${s.direction}`} aria-label="Suggested career direction"><span className="icon-tile"><Sparkles size={24}/></span><div><span className="eyebrow">YOUR SUGGESTED DIRECTION</span><h2>{direction.title}</h2><p>{direction.explanation}</p><div className="chip-row">{direction.supporting_skills.map(skill=><span key={skill} className="chip">{skill}</span>)}</div><details><summary>What to build next</summary><ul>{direction.next_steps.map((step,index)=><li key={index}>{step}</li>)}</ul></details></div><small>{demo?'Authored direction example · Not a vacancy or hiring guarantee':'Based on your CV analysis · Not a vacancy or hiring guarantee'}</small></section>:<section className={`card ${s.directionEmpty}`}><CompassIcon/><div><h2>{current?.direction_stale?'Refresh your career direction':'Discover your best-supported direction'}</h2><p>{current?.direction_stale?'Your profile or badges changed. Analyse your CV again to update this recommendation.':'Analyse your CV to get a suggested role family before searching real vacancies.'}</p></div><Link className="text-link" href={link('/app/cv',{tab:'assessment'})}>Go to Your CV <ArrowUpRight size={15}/></Link></section>)}
 <>
 <section className={`card ${s.searchPanel}`} aria-label={tab==='jobs'?(demo?'Example vacancy search':'Search real vacancies'):'Explore future roles'}><h2>{tab==='jobs'?'Where would you like to go?':`Explore a ${years}-year direction.`}</h2><p>{tab==='jobs'?(demo?'This fixed search illustrates how CV skills, preferences and earned badges inform vacancy matching.':'Search by role and location. Your current skills, preferences and earned badges inform the AI assessment.'):'Choose a horizon for your career-development scenario. Longer horizons carry greater uncertainty; we do not predict exact future job counts.'}</p><div className={s.searchFields}><label>{tab==='jobs'?'Job title and location':'Role and location to explore'}<input readOnly={Boolean(demo)} value={query} maxLength={180} onChange={event=>setQuery(event.target.value)} placeholder="Junior network engineer in Kuala Lumpur"/></label>{tab==='jobs'?<label>Search country<select disabled={Boolean(demo)} value={country} onChange={event=>setCountry(event.target.value)}><option value="my">Malaysia</option><option value="sg">Singapore</option><option value="gb">United Kingdom</option><option value="us">United States</option><option value="au">Australia</option></select></label>:<label>Forecast horizon<select value={years} disabled={busy} onChange={event=>setYears(Number(event.target.value) as 5|10|15)}><option value={5}>5 years</option><option value={10}>10 years</option><option value={15}>15 years</option></select></label>}</div>
 {!demo&&<p className={s.providerNote}>RunPod analyses relevant CV text, preferences and badge evidence with detected contacts minimised. Job-search titles and locations go to OpenWeb Ninja.</p>}
 {!demo&&tab==='jobs'&&<label className={s.check}><input type="checkbox" checked={automatic} disabled={busy} onChange={event=>setAutomatic(event.target.checked)}/><span>Automatically reassess these saved vacancies when my profile or badges change<small>Runs when this matching view is open; consumes AI allowance, but makes no new job-search request. This preference is saved with the next search.</small></span></label>}
 <div className={s.actions}><Button disabled={Boolean(demo)||query.trim().length<3||busy||saved.isLoading} onClick={()=>tab==='jobs'?search.mutate():outlook.mutate()}>{busy?<Loader2 size={16} className="spin"/>:tab==='jobs'?<Search size={16}/>:<Sparkles size={16}/ >}{demo?'Example results ready':busy?'Analysing…':tab==='jobs'?'Search & match real jobs':`Generate ${years}-year outlook`}</Button>{result?.auto_refresh&&<Button variant="ghost" disabled={pause.isPending} onClick={()=>pause.mutate()}>Pause automatic reassessment</Button>}</div>
 {tab==='jobs'&&current?.configured===false&&<p className="notice">The job-search provider is not configured. No sample vacancies will be substituted.</p>}
 {error&&<div className="error-box" role="alert"><span>{error.message}</span><Link className="text-link" href="/app/results?demo=student">View offline example results <ArrowUpRight size={15}/></Link></div>}</section>
 {tab==='jobs'?<>
 {result?<><div className={s.resultsHead}><div><h2>{result.jobs.length} {demo?'fictional vacancy examples':'source listings'}</h2><p>{result.query} · {demo?'Example snapshot':'Retrieved'} {new Date(result.fetched_at).toLocaleString()}</p></div>{Boolean(result.jobs.length)&&(current?.stale||!result.assessed_at)&&<Button variant="secondary" disabled={busy} onClick={()=>rematch.mutate()}>Reassess with current profile</Button>}</div>
 <p className={s.disclosure}>{result.ai_status} {current?.stale?'Profile or badge evidence changed; previous fit scores are hidden until reassessment.':''} {demo?'Scores are authored examples, not model responses or hiring probabilities.':'Fit scores are AI judgments, not hiring probabilities. Listings may expire; confirm details with the employer.'}</p>
 {result.jobs.length?<div className={s.jobs}>{result.jobs.map(job=><article key={job.id} className={`card ${s.job}`}><header><span className="icon-tile"><BriefcaseBusiness size={23}/></span>{job.assessment&&!current?.stale?<div className={s.fit}><strong>{job.assessment.score}<small>/100</small></strong><span>{demo?'Example fit':'AI vacancy fit'}</span></div>:<span className="tag">Not currently assessed</span>}</header><h3>{job.title}</h3><p className={s.company}>{job.company}</p><div className={s.meta}><span><MapPin size={14}/>{job.location}</span>{job.posted_at&&<span><Clock3 size={14}/>{job.posted_at}</span>}</div><p>{job.salary||'Salary not supplied'}{job.employment_type?` · ${job.employment_type}`:''}</p>
 {job.assessment&&<JobSkillPath matchedSkills={job.assessment.current_matched_skills??(current?.stale?[]:job.assessment.matched_skills)} gaps={job.assessment.skill_gaps}/>}
 {job.assessment&&!current?.stale&&<><p>{job.assessment.explanation}</p><details><summary>Other requirements & unknowns</summary><ul>{job.assessment.missing_requirements.map((item,index)=><li key={index}>{item}</li>)}</ul><h4>Still unknown</h4><ul>{job.assessment.unknowns.map((item,index)=><li key={index}>{item}</li>)}</ul><small>Eligibility and work authorisation are not independently verified.</small></details></>}
 <details><summary>Read source description</summary><p className={s.description}>{job.description||'No description supplied.'}</p></details><footer><small>Source: {job.publisher}</small>{demo?<span className="fine-print">Illustration only · Not open for applications</span>:<a className="text-link" href={job.apply_url} target="_blank" rel="noopener noreferrer">View original & apply <ArrowUpRight size={15}/></a>}</footer></article>)}</div>:<section className={`card ${s.empty}`}><h3>No listings returned.</h3><p>Try a broader role or another location. No fictional jobs were added.</p></section>}</>:<section className={`card ${s.empty}`}><BriefcaseBusiness size={32}/><h2>Your next opportunity starts with a search.</h2><p>No hardcoded vacancies. Search to retrieve real listings and assess how they connect to your current profile.</p></section>}
 </>:report?<>{(report.horizon_years||5)!==years&&<p className={s.disclosure}>Showing your saved {report.horizon_years||5}-year outlook. Generate a new outlook to explore {years} years.</p>}<CareerOutlookMap report={report} stale={current?.outlook_stale} skills={[...new Set([...(data.cv.skills||[]),...(data.skill_evidence||[]).map(item=>item.name)])]}/></>:<section className={`card ${s.empty}`}><TrendingUp size={32}/><h2>Explore possibilities, not promises.</h2><p>Choose 5, 10 or 15 years to explore a source-constrained development scenario. Current search results do not establish future job availability.</p></section>}
 </>
 </div>;
}
