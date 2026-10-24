'use client';

import Link from 'next/link';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {discoveryFields} from '@/lib/profile-information';

export function DiscoverProfile({edit}:{edit:()=>void}){
  const {data,demo,link}=useWorkspace();const answers=data.questionnaire;
  const fields=discoveryFields(answers);
  return <div className="page-enter narrow-page discover-page"><div className="page-title"><div><div className="section-label">DISCOVER YOURSELF</div><h1>Your completed profile</h1><p>Your own answers, ready to revisit as your direction changes.</p></div></div><section className="card question-card"><h2>{data.profile.name||'Your preferences'}</h2><dl className="form-grid">{fields.map(([label,value])=><div key={label}><dt><strong>{label}</strong></dt><dd>{value||'Not provided'}</dd></div>)}</dl><p>{data.preferences.note}</p><div className="question-actions"><Button variant="secondary" onClick={edit}>{demo?'View survey':'Edit my answers'}</Button><Button asChild><Link href={link('/app/profile')}>My profile</Link></Button></div></section></div>;
}
