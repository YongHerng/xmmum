'use client';
import {ArrowRight,ArrowUpRight,Compass,Flag,Layers3,ShieldCheck,Sparkles} from 'lucide-react';
import s from './live-career.module.css';

export type CareerOutlook={role:string;target_year:number;horizon_years?:5|10|15;summary:string;drivers:string[];uncertainties:string[];notice:string;evidence_quality:string;created_at:string;sources:{id:string;title:string;url:string;period:string;scope:string}[];future_roles:{title:string;reason:string;development_steps:string[]}[]};

export function CareerOutlookMap({report,skills,stale=false}:{report:CareerOutlook;skills:string[];stale?:boolean}){
 return <section className={`card ${s.outlook}`} aria-label="Career development map">
   <header className={s.mapHeading}><div><span className="eyebrow">YOUR {report.horizon_years||5}-YEAR DEVELOPMENT MAP</span><h2>{report.role}</h2></div><span className={s.yearBadge}><Flag size={18}/>{report.target_year}<small>Possible direction</small></span></header>
   {stale&&<p className="notice">Your profile changed. Generate a fresh outlook to update this map.</p>}
   <div className={s.mapTrack} aria-label="Development stages"><div><span className="icon-tile"><Compass size={21}/></span><strong>Start here</strong><small>Your current skills</small></div><ArrowRight aria-hidden size={19}/><div><span className="icon-tile"><Layers3 size={21}/></span><strong>Build next</strong><small>Practice and learning</small></div><ArrowRight aria-hidden size={19}/><div><span className="icon-tile"><Flag size={21}/></span><strong>Work towards</strong><small>Potential future roles</small></div></div>
   <div className={s.skillStrip}><span>YOUR STARTING POINT</span><div className="chip-row">{skills.slice(0,6).map(skill=><span className="chip" key={skill}>{skill}</span>)}{!skills.length&&<small>Add your skills to personalise the starting point.</small>}</div></div>
   <h3>Directions to explore</h3>
   <div className={s.roleGrid}>{report.future_roles.map((role,index)=><article className={s.roleTile} key={index}><span className={s.roleNumber}>{String(index+1).padStart(2,'0')}</span><h4>{role.title}</h4><p className={s.shortCopy}>{role.reason}</p><div className={s.stepList}>{role.development_steps.map((step,i)=><div key={i}><span>{i+1}</span><p>{step}</p></div>)}</div><details><summary>Why this direction?</summary><p>{role.reason}</p></details></article>)}</div>
   {!report.future_roles.length&&<p className={s.disclosure}>There is not enough evidence to recommend a specific future role yet.</p>}
   <div className={s.contextCards}><div><Sparkles size={20}/><strong>What may shape the path</strong>{report.drivers.slice(0,2).map((driver,index)=><p className={s.shortCopy} key={index}>{driver}</p>)}</div><div><ShieldCheck size={20}/><strong>A scenario, not a promise</strong><p>No guaranteed jobs, growth percentages or future vacancy counts.</p></div></div>
   <details className={s.researchDetails}><summary>Full outlook, uncertainties & sources <span>{report.sources.length} sources</span></summary><p>{report.summary}</p><h4>Drivers and uncertainties</h4><ul>{[...report.drivers,...report.uncertainties].map((item,index)=><li key={index}>{item}</li>)}</ul><p>{report.evidence_quality}</p>{report.sources.map(source=><a key={source.id} className={s.source} href={source.url} target="_blank" rel="noopener noreferrer"><strong>{source.title}<ArrowUpRight size={14}/></strong><span>{source.period} · {source.scope}</span></a>)}<p className={s.disclosure}>{report.notice}</p></details>
 </section>;
}
