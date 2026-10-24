'use client';
import Link from 'next/link';
import {ArrowRight,BookOpen,Check,Layers3} from 'lucide-react';
import {useWorkspace} from './workspace';
import s from './live-career.module.css';

export type JobSkillGap={skill_id:string;label:string;courses:{id:string;title:string}[]};

export function JobSkillPath({matchedSkills,gaps=[]}:{matchedSkills:string[];gaps?:JobSkillGap[]}){
 const {link}=useWorkspace();
 return <section className={s.skillComparison} aria-label="Your skills and learning gaps">
   <div className={s.skillComparisonHeader}><h4>How your skills connect</h4><span>{matchedSkills.length} matched · {gaps.length} to build</span></div>
   <div className={s.matchedSkills}><span><Check size={14}/>Your matching skills</span><div className="chip-row">{matchedSkills.map(skill=><span key={skill} className="chip">{skill}</span>)}{!matchedSkills.length&&<small>No source-supported skill match identified.</small>}</div></div>
   {Boolean(gaps.length)&&<div className={s.skillGaps}><h4><Layers3 size={15}/>Build the missing skills</h4>{gaps.map(gap=><article key={gap.skill_id} className={s.skillGap}><div><strong>{gap.label}</strong><span>Not yet evidenced in your profile</span></div>{gap.courses.length?<ul>{gap.courses.map(course=><li key={course.id}><Link href={link('/app/pathway',{view:'course',course:course.id})}><BookOpen size={15}/><span>{course.title}</span><ArrowRight size={14}/></Link></li>)}</ul>:<Link className="text-link" href={link('/app/pathway',{view:'catalogue',skill:gap.skill_id})}>Explore learning pathway <ArrowRight size={14}/></Link>}</article>)}<p>Course badges add assessed skills to your profile and inform your next job match.</p></div>}
 </section>;
}
