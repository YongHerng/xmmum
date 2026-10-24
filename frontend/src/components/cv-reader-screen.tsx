'use client';
import {useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'next/navigation';
import Link from 'next/link';
import {ArrowRight,FileText,Sparkles,FileDown} from 'lucide-react';
import {api} from '@/lib/api';
import {useWorkspace} from './workspace';
import {CVReader} from './cv-reader';
import {CVAIAssistance} from './ai-assistance';
import {CVAIAssessment} from './cv-assessment';
import type {CV} from '@/lib/types';
import type {ParsedCV} from '@/lib/cv-reader';
import s from './cv-editor.module.css';

export default function CVReaderScreen(){
 const {data,demo,link,reload}=useWorkspace();
 const params=useSearchParams();
 const needsDiscovery=!demo&&(data.onboarding?.discover_complete===false||data.questionnaire.completed_step<5);
 const [tab,setTab]=useState(()=>params.get('tab')==='improve'?'improve':params.get('tab')==='assessment'||needsDiscovery&&data.evaluation?.analysis_mode==='ai-rating'?'assessment':'details');
 const [analysing,setAnalysing]=useState(false);
 const assessmentPanel=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(analysing)assessmentPanel.current?.focus();},[analysing]);
 const [dirty,setDirty]=useState(false);
 const [saveNotice,setSaveNotice]=useState('');
 return <div><header className={s.workspaceHeading}><span className="eyebrow">YOUR EXPERIENCE, CLEARLY TOLD</span><h1>Your CV</h1><p>Your details, assessment and improvements—each in its own place.</p></header>
 <div className={s.workspaceTabs} role="tablist" aria-label="Your CV views">{[['details','CV details',FileText],['assessment','AI assessment',Sparkles],['improve','Improve & export',FileDown]].map(([id,label,Icon])=><button type="button" key={String(id)} id={'cv-view-'+id} role="tab" aria-selected={tab===id} aria-controls={'cv-panel-'+id} onClick={()=>setTab(String(id))}><Icon size={16}/>{String(label)}</button>)}</div>
 {saveNotice&&<p role="status" className="notice">{saveNotice}</p>}
 <div role="tabpanel" id="cv-panel-details" aria-labelledby="cv-view-details" hidden={tab!=='details'}><CVReader key={JSON.stringify(data.cv)} onDirtyChange={setDirty} initialCV={{...data.cv,name:data.cv.name||data.profile.name,education:data.cv.education||data.profile.education,skills:data.cv.skills||[]}} roles={data.roles} demo={Boolean(demo)} uploadRequired={!demo&&data.onboarding?.cv_uploaded===false}
 parse={async(file,signal)=>{const form=new FormData();form.append('file',file);return api<ParsedCV>('/cv/parse','POST',form,{signal,timeoutMs:240000});}}
 confirm={async(cv:CV)=>{
   if(demo){setTab('assessment');return;}
   setSaveNotice('');await api('/cv','PUT',cv);setDirty(false);setAnalysing(true);setTab('assessment');
   try{await api('/cv/analyze','POST',{}, {timeoutMs:200000});setSaveNotice('CV saved and analysed. Your suggested career direction is ready in Career matches.');}
   catch(error){setSaveNotice('Your CV was saved. Analysis was not completed: '+(error instanceof Error?error.message:'Please retry in AI assessment.'));}
   try{await reload();}finally{setAnalysing(false);}
 }}/></div>
 <div ref={assessmentPanel} tabIndex={-1} role="tabpanel" id="cv-panel-assessment" aria-labelledby="cv-view-assessment" hidden={tab!=='assessment'}><CVAIAssessment dirty={dirty} analysing={analysing}/>{!needsDiscovery&&!analysing&&<div className={s.workspaceActions}><Link className="text-link" href={link('/app/results')}>See my career direction <ArrowRight size={16}/></Link></div>}</div>
 <div role="tabpanel" id="cv-panel-improve" aria-labelledby="cv-view-improve" hidden={tab!=='improve'}><CVAIAssistance dirty={dirty}/></div>
 </div>;
}
