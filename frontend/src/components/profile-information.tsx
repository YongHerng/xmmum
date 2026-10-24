'use client';

import Link from 'next/link';
import {ArrowRight,Compass,FileText} from 'lucide-react';
import {discoveryFields} from '@/lib/profile-information';
import {useWorkspace} from './workspace';
import s from './profile.module.css';

export function ProfileInformation(){
  const {data,demo,link}=useWorkspace();const cv=data.cv;
  const cvFields=[['Full name',data.profile.name||cv.name],['Email',cv.email],['Phone',cv.phone],
    ['Education',cv.education||data.profile.education],['Experience',cv.experience],['Projects & achievements',cv.projects],
    ['Membership and licensure',cv.membership_licensure],['Certificates and training',cv.certificates_training],
    ['Target career',data.roles.find(role=>role.id===cv.target_role)?.title]];
  return <div className={s.information}>
    <section className="card" aria-labelledby="profile-cv-title"><div className={s.informationHeading}><span className="icon-tile"><FileText size={20}/></span><div><h2 id="profile-cv-title">Your CV information</h2><p>Your saved CV, reflected in your profile.</p></div></div>
      <h3>Professional summary</h3><p className={s.savedText}>{cv.summary||'Not added yet'}</p>
      <h3>Skills</h3>{cv.skills?.length?<div className="chip-row">{cv.skills.map(skill=><span className="chip" key={skill}>{skill}</span>)}</div>:<p className={s.savedText}>Not added yet</p>}
      <details className={s.details}><summary>View all CV details</summary><dl>{cvFields.map(([title,value])=><div key={title}><dt>{title}</dt><dd>{value||'Not added yet'}</dd></div>)}</dl></details>
      <Link className="text-link" href={link('/app/cv')}>{demo?'View your CV':'Review or update your CV'} <ArrowRight size={14}/></Link>
    </section>
    <section className="card" aria-labelledby="profile-discover-title"><div className={s.informationHeading}><span className="icon-tile teal"><Compass size={20}/></span><div><h2 id="profile-discover-title">Discover Yourself</h2><p>Your own interests, strengths and preferences.</p></div></div>
      <h3>Career goal</h3><p className={s.savedText}>{data.questionnaire.career_goal||data.profile.goal||'Not added yet'}</p>
      <details className={s.details}><summary>View your Discover Yourself answers</summary><dl>{discoveryFields(data.questionnaire).map(([title,value])=><div key={title}><dt>{title}</dt><dd>{value||'Not provided'}</dd></div>)}</dl></details>
      <Link className="text-link" href={link('/app/questionnaire')}>{demo?'View Discover Yourself':'Review or update your answers'} <ArrowRight size={14}/></Link>
    </section>
  </div>;
}
