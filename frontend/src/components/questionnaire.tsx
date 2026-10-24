'use client';

import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {useMutation} from '@tanstack/react-query';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Compass,Loader2,LockKeyhole,Plus,ShieldCheck} from 'lucide-react';
import {api} from '@/lib/api';
import {countries,currencyForLocation} from '@/lib/currency';
import {firstIncompleteSurveyStep,surveyStepMissing} from '@/lib/onboarding';
import type {Answers} from '@/lib/types';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {DiscoverProfile} from './discover-profile';
import {AIPersonalisation} from './ai-assistance';

const titles=['Your starting point','What draws you in?','How do you work best?','What matters right now?','Make room for learning'];
const descriptions=['Tell us about your background.','Choose your interests, strengths and career goal.','Choose the answers that feel most like you.','Choose what matters most in this chapter.','Set a learning plan that fits your life.'];

export function Questionnaire(){
  const {data,demo,link,reload}=useWorkspace();const router=useRouter();
  const [answers,setAnswers]=useState<Answers>(data.questionnaire);
  const [name,setName]=useState(data.profile.name||data.cv.name),[education,setEducation]=useState(data.cv.education||data.profile.education);
  const firstMissing=firstIncompleteSurveyStep(data.questionnaire,data.profile.name,data.profile.education);
  const [editing,setEditing]=useState(data.questionnaire.completed_step<5||firstMissing<5);
  const [step,setStep]=useState(Math.min(data.questionnaire.completed_step,firstMissing,4));
  const [saved,setSaved]=useState(false);
  const [budgetInput,setBudgetInput]=useState(data.questionnaire.budget==null?'':String(data.questionnaire.budget));
  const currency=currencyForLocation(answers.location);
  const missing=surveyStepMissing(step,answers,name,education);
  const mutation=useMutation({mutationFn:async(next:number)=>{
    if(!demo){
      await api('/profile','PUT',{...data.profile,name:name.trim(),education:education.trim()});
      await api('/questionnaire','PUT',{...answers,strengths:answers.strengths?.map(value=>value.trim()).filter(Boolean),completed_step:data.questionnaire.completed_step===5?5:next});
      await reload();
    }
    if(next===5){setEditing(false);if(!demo&&data.onboarding?.required_step==='questionnaire')router.replace(link('/app/dashboard'));}
    else{setStep(next);setSaved(true);}
  }});
  const update=<K extends keyof Answers>(key:K,value:Answers[K])=>{setAnswers(previous=>({...previous,[key]:value}));setSaved(false);};
  const choice=(key:'category'|'work_style'|'environment'|'motivation',value:string,title:string,description:string)=><button type="button" key={value} aria-pressed={answers[key]===value} className={`choice-card ${answers[key]===value?'selected':''}`} onClick={()=>update(key,value as never)} disabled={Boolean(demo)}><span className="choice-radio">{answers[key]===value&&<span/>}</span><span><strong>{title}</strong><small>{description}</small></span></button>;
  if(!editing)return <DiscoverProfile edit={()=>{setAnswers(data.questionnaire);setStep(0);setEditing(true);}}/>;
  return <div className="page-enter narrow-page discover-page">
    <div className="page-title"><div><div className="section-label">DISCOVER YOURSELF</div><h1>A future that feels like you.</h1><p>Every question is required. Choose your own answers to finish setting up your workspace.</p></div></div>
    <div className="discover-status"><div className="questionnaire-progress"><span>STEP {step+1} OF 5</span><div className="progress-track" role="progressbar" aria-label="Questionnaire completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={step*20}><span style={{width:`${step*20}%`}}/></div><span>{step*20}%</span></div><ol className="question-stages" aria-label="Questionnaire steps">{['Starting point','Interests','Work style','Motivation','Learning'].map((title,index)=><li key={title} aria-current={step===index?'step':undefined} className={index<step?'complete':''}><span>{index<step?<Check size={12}/>:index+1}</span>{title}</li>)}</ol></div>
    <form className="card question-card" aria-busy={mutation.isPending} onSubmit={event=>{event.preventDefault();if(!mutation.isPending&&(demo||!missing.length))mutation.mutate(step+1);}}>
      <div className="question-heading"><div className="question-icon"><Compass size={24}/></div><div><h2>{titles[step]}</h2><p>{descriptions[step]}</p></div></div>
      <fieldset disabled={Boolean(demo)||mutation.isPending}>
      {step===0&&<><div className="form-grid"><label>Your name<input required value={name} onChange={event=>{setName(event.target.value);setSaved(false);}} maxLength={100} placeholder="What should we call you?"/></label><label>Education<textarea required rows={2} value={education} onChange={event=>{setEducation(event.target.value);setSaved(false);}} maxLength={5000} placeholder="Qualification or current studies"/></label></div><span className="field-label">Where are you starting?</span><div className="choice-grid">{choice('category','student','I’m a student','Exploring life beyond my studies')}{choice('category','graduate','I’m a fresh graduate','Ready for my first chapter')}{choice('category','professional','I’m working','Looking to grow where I am')}{choice('category','switcher','I’m changing careers','Ready for a new direction')}</div></>}
      {step===1&&<><div className="interest-grid">{[['data','Data & analytics'],['technology','Technology & AI'],['sustainability','Sustainability'],['creative','Creative work'],['people','Working with people'],['practical','Hands-on work'],['business','Business'],['investigation','Investigation']].map(([value,title])=><button type="button" aria-pressed={answers.interests.includes(value)} className={`interest-choice ${answers.interests.includes(value)?'selected':''}`} key={value} onClick={()=>update('interests',answers.interests.includes(value)?answers.interests.filter(item=>item!==value):[...answers.interests,value])}><span>{title}</span>{answers.interests.includes(value)?<CheckCircle2 size={19}/>:<Plus size={19}/>}</button>)}</div><label>Your strengths<input required value={(answers.strengths||[]).join(', ')} maxLength={400} placeholder="e.g. communication, problem solving" onChange={event=>update('strengths',event.target.value.split(',').slice(0,8))}/></label><label>What would you like your career to involve?<textarea required value={answers.career_goal||''} maxLength={500} onChange={event=>update('career_goal',event.target.value)}/></label></>}
      {step===2&&<><div className="choice-grid">{choice('work_style','analytical','Analytical','Finding patterns and solving problems')}{choice('work_style','creative','Creative','Exploring ideas and making new things')}{choice('work_style','practical','Practical','Working hands-on and seeing results')}{choice('work_style','people','People-focused','Listening, supporting and connecting')}</div><span className="field-label">My preferred environment</span><div className="choice-grid">{choice('environment','structured','Structured','Clear processes and expectations')}{choice('environment','flexible','Flexible','Freedom to shape my approach')}</div><div className="form-grid"><label>When do you feel most energized?<select required value={answers.social_energy||''} onChange={event=>update('social_energy',event.target.value)}><option value="">Choose an answer</option><option value="independent">Working independently</option><option value="collaborative">Working with others</option><option value="mixed">A mix of both</option></select></label><label>How do you make decisions?<select required value={answers.decision_style||''} onChange={event=>update('decision_style',event.target.value)}><option value="">Choose an answer</option><option value="evidence">Evidence and analysis</option><option value="values">Values and effects on people</option><option value="both">Both</option></select></label></div></>}
      {step===3&&<div className="choice-grid">{choice('motivation','growth','Growth & opportunity','Learning, progressing, opening doors')}{choice('motivation','stability','Stability','A dependable and sustainable career')}{choice('motivation','impact','Meaningful impact','Making a positive difference')}{choice('motivation','balance','Work-life balance','A career that fits the life I want')}</div>}
      {step===4&&<div className="learning-form"><div className="form-grid"><label>Weekly learning time (hours)<input required type="number" min={1} max={40} value={answers.weekly_hours??''} placeholder="1–40 hours" onChange={event=>update('weekly_hours',event.target.value===''?null:Number(event.target.value))}/></label><label>Total learning budget{currency?` (${currency})`:''}<input required type="text" inputMode="numeric" pattern="[0-9]+" value={budgetInput} placeholder="Enter 0 for free learning" onFocus={event=>event.target.select()} onChange={event=>{const value=event.target.value;if(!/^\d*$/.test(value))return;const normalized=value.replace(/^0+(?=\d)/,'');const amount=normalized===''?null:Math.min(50000,Number(normalized));setBudgetInput(amount==null?'':String(amount));update('budget',amount);}}/></label><label>Country<select required aria-label="Country" value={answers.location} onChange={event=>update('location',event.target.value)}><option value="">Choose your country</option>{answers.location&&!countries.some(([country])=>country===answers.location)&&<option value={answers.location}>{answers.location}</option>}{countries.map(([country])=><option key={country} value={country}>{country}</option>)}</select></label><label>Are you open to relocating?<select required value={answers.relocation==null?'':answers.relocation?'yes':'no'} onChange={event=>update('relocation',event.target.value===''?null:event.target.value==='yes')}><option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option></select></label></div><label>How do you prefer to learn?<select required value={answers.learning_style||''} onChange={event=>update('learning_style',event.target.value)}><option value="">Choose an answer</option><option value="practice">Hands-on practice</option><option value="reading">Reading and reflection</option><option value="discussion">Discussion and feedback</option></select></label></div>}
      </fieldset>
      {mutation.error&&<p role="alert" className="error-box">{mutation.error.message}</p>}
      {!demo&&missing.length>0&&<p className="fine-print">Still needed: {missing.join(', ')}.</p>}
      <AIPersonalisation answers={answers} onUse={value=>{setAnswers(value);setSaved(false);}}/>
      <div className="question-actions"><Button type="button" variant="ghost" disabled={step===0||mutation.isPending} onClick={()=>setStep(step-1)}><ArrowLeft size={16}/>Back</Button><span className="autosave-label" role="status">{demo?<><LockKeyhole size={13}/>Read-only demo</>:mutation.isPending?<><Loader2 size={14} className="spin"/>Saving your step…</>:mutation.error?'Not saved. Please retry Continue.':saved?<><Check size={14}/>Last step saved</>:<><ShieldCheck size={13}/>Saved when you continue</>}</span><Button type="submit" disabled={mutation.isPending||(!demo&&missing.length>0)}>{mutation.isPending?'Saving…':step===4?'Complete my profile':'Continue'}<ArrowRight size={16}/></Button></div>
    </form><p className="center-note">You can return to update your answers after setup.</p>
  </div>;
}
