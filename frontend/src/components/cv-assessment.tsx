'use client';
import {useMutation} from '@tanstack/react-query';
import Link from 'next/link';
import {Sparkles,Loader2,ArrowRight,FileSearch,CheckCircle2} from 'lucide-react';
import {api} from '@/lib/api';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {CVScoreSummary} from './cv-score-summary';
import s from './ai-assistance.module.css';

export function CVAIAssessment({dirty=false,analysing=false}:{dirty?:boolean;analysing?:boolean}){
 const {data,demo,reload,link}=useWorkspace();
 const assessment=useMutation({mutationFn:()=>api('/cv/analyze','POST',{}, {timeoutMs:200000}),onSuccess:()=>reload()});
 const rating=data.evaluation&&(data.evaluation.analysis_mode==='ai-rating'||Boolean(demo&&data.demo_outcomes))?data.evaluation:null;
 const busy=analysing||assessment.isPending;
 return <section className={`card ${s.panel}`} aria-label="AI CV assessment"><div className={s.assessmentHeading}><div><span className="eyebrow">YOUR CV AT A GLANCE</span><h2>Your CV, assessed with context.</h2><p>See what is working and where your writing can improve.</p></div><Button variant={rating?'secondary':'default'} disabled={Boolean(demo)||dirty||busy||!data.cv_version} onClick={()=>assessment.mutate()}>{busy?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>}Analyse saved CV</Button></div>
 {!demo&&<p className={s.note}>Analyse sends relevant saved CV text, preferences and earned skills to RunPod. Detected contacts are minimised; other personal details may remain.</p>}
 {dirty&&<p className={s.notice}>Save your current CV edits before requesting an assessment.</p>}
 {assessment.error&&<p role="alert" className="error-box">{assessment.error.message} <Link className="text-link" href="/app/cv?demo=student&tab=assessment">View offline assessment example</Link></p>}
 {busy?<div className={s.analysisPending} role="status"><span className="icon-tile"><FileSearch size={27}/></span><h3>Analysing your saved CV</h3><p>Reviewing your writing, source evidence and skill presentation. Your scores will appear here when the assessment is ready.</p><div className={s.analysisSteps}><span><CheckCircle2 size={16}/>CV saved</span><span><Loader2 size={16} className="spin"/>AI assessment</span><span>View your scores</span></div></div>:rating?<div className={s.preview}>{demo&&<p className={s.notice}>Hardcoded expected-outcome example. No model request was made and no personal CV was assessed.</p>}<CVScoreSummary rating={rating} example={Boolean(demo)}/><div className={s.nextDiscovery}><div><h3>Your experience is the starting point.</h3><p>Next, tell us about your interests and preferences to personalise your career matches.</p></div><Button asChild><Link href={link('/app/questionnaire')}>Continue to Discover yourself <ArrowRight size={16}/></Link></Button></div><div className={s.assessmentHighlights}><div><h3>What is working</h3><ul>{rating.strengths.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ul></div><div><h3>Build on this next</h3><ul>{rating.suggestions.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ul></div></div><details className={s.assessmentDetails}><summary>Full assessment, explanations & source evidence</summary><p>{rating.summary}</p>{rating.breakdown.map(row=><article key={row.name} className={s.explanation}><h3>{row.name} · {row.score}/100 <small>({row.weight}% weight)</small></h3><p>{row.explanation}</p>{row.evidence?.map((quote,index)=><blockquote key={index}>{quote}</blockquote>)}</article>)}<h3>Recommended improvements</h3><ul>{rating.suggestions.map((item,index)=><li key={index}>{item}</li>)}</ul><p className={s.note}>{rating.model} · {rating.rubric_version}{rating.rated_at?` · ${new Date(rating.rated_at).toLocaleString()}`:''}</p></details><p className={s.note}>Scores describe CV-writing quality, not an employer ATS score or a hiring probability.</p></div>:demo&&data.evaluation?<div className={s.preview}><p className={s.notice}>Fictional demo illustration. Sign in for an AI assessment of your own CV.</p><CVScoreSummary rating={data.evaluation} example/></div>:<p className={s.note}>No AI assessment for this CV version yet. Previous or demo heuristic scores are not used as a replacement.</p>}
 </section>;
}
