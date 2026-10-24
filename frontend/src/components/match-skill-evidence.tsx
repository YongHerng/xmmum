import Link from 'next/link';
import {Award} from 'lucide-react';
import type {SkillEvidence} from '@/lib/types';
import s from './match-skill-evidence.module.css';

export function MatchSkillEvidence({evidence,courseLink}:{evidence?:SkillEvidence[];courseLink:(id:string)=>string}){
  const backed=evidence?.filter(skill=>skill.badges.length)||[];
  if(!backed.length)return null;
  return <section className={s.evidence} aria-label="Badge-backed skills">
    <strong><Award size={15}/>Course-assessment evidence</strong>
    {backed.map(skill=><details key={skill.id}>
      <summary>{skill.name} · <span>{skill.level}</span>{skill.cv_claimed?' · Also on your CV':` · ${Math.round(skill.credit*100)}% skill credit`}</summary>
      <ul>{skill.badges.map(badge=><li key={badge.badge_code}><Link href={courseLink(badge.course_id)}>{badge.title}</Link><small>{badge.provider} · {badge.level} · {badge.badge_code}</small></li>)}</ul>
      <p>{skill.cv_claimed?'This badge supports your existing CV claim; the skill is not counted again.':'Partial credit reflects the assessed course level. Keep building practical experience.'}</p>
    </details>)}
    <p>Course completion supports a skill claim; it is not a guarantee of job readiness.</p>
  </section>;
}
