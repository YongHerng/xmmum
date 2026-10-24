'use client';

import {useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {Award,ChevronDown,Loader2,Plus,Trash2} from 'lucide-react';
import {Button} from './ui/button';
import type {LearningContext} from './learning-pathway';
import {learningRequest,type AssessedSkill,type Course,type SkillCatalogue} from '@/lib/learning';
import s from './learning.module.css';

export function CourseSkillMapping({ctx,course,saved}:{ctx:LearningContext;course:Course;saved:(message:string)=>Promise<void>}){
  const [skills,setSkills]=useState<AssessedSkill[]>(course.assessed_skills||[]);
  const catalogue=useQuery({queryKey:['hosted-learning',ctx.scope,'skill-catalogue'],queryFn:()=>learningRequest<SkillCatalogue>(ctx.demo,'/skills')});
  const save=useMutation({mutationFn:()=>learningRequest<Course>(ctx.demo,`/studio/courses/${course.id}`,'PUT',{
    title:course.title,provider:course.provider,description:course.description,assessed_skills:skills.map(({skill_id,level})=>({skill_id,level})),
  }),onSuccess:()=>saved('Assessed skills saved. New badges will use this mapping for career matching.')});
  const options=catalogue.data?.skills||[];
  const update=(index:number,next:Partial<AssessedSkill>)=>setSkills(current=>current.map((item,i)=>i===index?{...item,...next}:item));
  return <details className={`card ${s.skillMapping}`}>
    <summary><Award size={18} aria-hidden="true"/><span className={s.skillMappingTitle}>Skills assessed & badge evidence</span><span className={`tag ${s.skillMappingCount}`}>{skills.length} {skills.length===1?'skill':'skills'}</span><ChevronDown className={s.skillMappingChevron} size={18} aria-hidden="true"/></summary>
    <p>Choose only skills assessed by this course. When a learner passes the final test, their badge records these skills and levels for career matching. Existing badges keep their original mapping.</p>
    <p className="fine-print">Foundation: 50% · Intermediate: 75% · Advanced: 100% coverage credit for a new badge-only skill. A CV claim keeps its existing credit. The same skill is never counted twice. These are prototype weights, not professional certification.</p>
    {course.published&&<p className="notice">Take this course offline to change its assessed skills.</p>}
    {catalogue.error&&<p className="error-box" role="alert">{catalogue.error.message} <Button type="button" size="sm" variant="ghost" onClick={()=>catalogue.refetch()}>Retry skill list</Button></p>}
    {catalogue.isPending&&<p role="status">Loading available skills…</p>}
    <form onSubmit={event=>{event.preventDefault();save.mutate();}}>
      <fieldset disabled={course.published||save.isPending||!options.length}>
        {skills.map((mapping,index)=><div className={s.skillMappingRow} key={index}>
          <label>Assessed skill {index+1}<select required value={mapping.skill_id} onChange={event=>update(index,{skill_id:event.target.value})}><option value="">Choose a skill</option>{options.map(option=><option key={option.id} value={option.id} disabled={skills.some((item,i)=>i!==index&&item.skill_id===option.id)}>{option.name}</option>)}</select></label>
          <label>Assessment level {index+1}<select value={mapping.level} onChange={event=>update(index,{level:event.target.value as AssessedSkill['level']})}><option value="foundation">Foundation</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
          <Button type="button" size="sm" variant="ghost" aria-label={`Remove assessed skill ${index+1}`} onClick={()=>setSkills(skills.filter((_,i)=>i!==index))}><Trash2 size={16}/></Button>
        </div>)}
        {!skills.length&&<p className="fine-print">No assessed skills selected. This course can still award a completion badge, but it will not add skill evidence to career matching.</p>}
        {!course.published&&<div className={s.actions}><Button type="button" variant="secondary" disabled={skills.length>=12||skills.length>=options.length} onClick={()=>setSkills([...skills,{skill_id:'',level:'foundation'}])}><Plus size={15}/>Add assessed skill</Button><Button type="submit" disabled={skills.some(item=>!item.skill_id)}>{save.isPending&&<Loader2 size={15} className="spin"/>}Save assessed skills</Button></div>}
      </fieldset>
      {save.error&&<p className="error-box" role="alert">{save.error.message} Your selections are kept.</p>}
    </form>
  </details>;
}
