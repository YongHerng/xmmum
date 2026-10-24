'use client';

import {useEffect,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {Award,History,Loader2,ShieldCheck,Sparkles,Download,FileText,ChevronLeft,ChevronRight} from 'lucide-react';
import {CVDocumentPreview} from './cv-document-preview';
import {api} from '@/lib/api';
import type {Answers,Evaluation,Match} from '@/lib/types';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {DemoCVImprovements} from './demo-cv-improvements';
import s from './ai-assistance.module.css';

const sectionNames={summary:'Professional summary',education:'Education',experience:'Experience',projects:'Projects',membership_licensure:'Membership and licensure',certificates_training:'Certificates and training'};
type Section=keyof typeof sectionNames;
type Change={field:Section;before:string;after:string;reason:string};
type Preview={preview_id:string;base_version:number;changes:Change[];mode:string;notice:string;added_skills?:string[];before_rating:Evaluation|null;after_rating:Evaluation|null};
type Coverage={unmapped_skills:string[];notice:string};
type Context={version:number;badges:{badge_code:string;title:string;provider:string;skills:{skill_id:string;level:string}[]}[];coverage:Coverage;history:{version:number;saved_at:string}[]};

function useAIStatus(){
  const {demo,identity}=useWorkspace();
  return useQuery({queryKey:['workspace',identity,'ai-status'],queryFn:()=>api<{configured:boolean;model:string;notice:string}>('/ai/status'),enabled:!demo,retry:false});
}

function AIRequestNote(){
  return <p className={s.note}>Your selected text goes to the configured AI provider. Detected contacts are minimised; other personal details may remain. Draft changes are only saved after approval.</p>;
}

function AIState({configured,demo}:{configured?:boolean;demo: boolean}){
  return <p className={s.note}>{demo?'AI actions are unavailable in the read-only demo.':configured?'AI-generated drafts and rubric assessments · review facts before approving.':'AI is not enabled or configuration is unavailable. Manual editing and saved information remain available.'}</p>;
}

export function CVAIAssistance({dirty=false}:{dirty?:boolean}){
  const {demo,data}=useWorkspace();
  return demo&&data.demo_outcomes?<DemoCVImprovements/>:<PersonalCVAIAssistance dirty={dirty}/>;
}

function PersonalCVAIAssistance({dirty=false}:{dirty?:boolean}){
  const {data,demo,identity,reload}=useWorkspace();
  const status=useAIStatus();
  const context=useQuery({queryKey:['workspace',identity,'cv-ai-context',data.cv_version,JSON.stringify(data.cv)],queryFn:()=>api<Context>('/cv/ai/context'),enabled:!demo,retry:false});
  const [preview,setPreview]=useState<Preview|null>(null);
  const [fields,setFields]=useState<Section[]>(['summary','experience','projects']);
  const [selected,setSelected]=useState<Section[]>([]),[edits,setEdits]=useState<Partial<Record<Section,string>>>({});
  const [message,setMessage]=useState('');
  useEffect(()=>{setPreview(null);setSelected([]);setEdits({});},[context.data?.version]);
  const generate=useMutation({mutationFn:(badgeCode?:string)=>api<Preview>('/cv/ai/preview','POST',{fields,...(badgeCode?{badge_code:badgeCode}:{})},{timeoutMs:200000}),onSuccess:value=>{setPreview(value);setSelected(value.changes.map(item=>item.field));setEdits({});setMessage('');}});
  const apply=useMutation({mutationFn:()=>api<{evaluation:Evaluation|null}>('/cv/ai/apply','POST',{preview_id:preview?.preview_id,fields:selected,edits:Object.fromEntries(Object.entries(edits).filter(([key])=>selected.includes(key as Section)))}),onSuccess:async result=>{setPreview(null);setPdf(null);await reload();await context.refetch();setMessage(result.evaluation?`Changes saved. Recalculated CV quality: ${result.evaluation.score}/100. Career matches refreshed.`:'Changes saved. Request a fresh AI assessment for this CV version. Vacancy assessments will be refreshed when enabled.');}});
  const restore=useMutation({mutationFn:(version:number)=>api('/cv/history/restore','POST',{version,expected_version:context.data?.version}),onSuccess:async()=>{await reload();await context.refetch();setMessage('Previous CV restored as a new version. Career matches refreshed.');}});
  const [pdf,setPdf]=useState<{bytes:Uint8Array;url:string;filename:string;notice:string}|null>(null),[pdfPage,setPdfPage]=useState(0),[pdfPages,setPdfPages]=useState(1),[pdfError,setPdfError]=useState('');
  useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf.url);},[pdf]);
  useEffect(()=>{setPdf(null);setPdfError('');},[preview,edits,selected,data.cv_version]);
  const exportPDF=useMutation({mutationFn:()=>api<{pdf_base64:string;filename:string;notice:string}>('/cv/pdf','POST',preview?{preview_id:preview.preview_id,fields:selected,edits:Object.fromEntries(Object.entries(edits).filter(([key])=>selected.includes(key as Section)))}:{}),onSuccess:value=>{const bytes=Uint8Array.from(atob(value.pdf_base64),char=>char.charCodeAt(0));setPdf({bytes,url:URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),filename:value.filename,notice:value.notice});setPdfPage(0);setPdfError('');}});
  const busy=generate.isPending||apply.isPending||restore.isPending||exportPDF.isPending;
  const hasSaved=Boolean(context.data?.version);
  const error=generate.error||apply.error||restore.error||exportPDF.error||context.error;
  return <section className={`card ${s.panel}`} aria-label="AI CV workspace" aria-busy={busy}>
    <header className={s.heading}><span className="icon-tile"><Sparkles size={22}/></span><div><span className="eyebrow">YOUR WORDS, REFINED</span><h2>Improve your saved CV</h2><p>Preview a clearer version. You stay in control of every change.</p></div></header>
    <AIState configured={status.data?.configured} demo={Boolean(demo)}/>
    {(!hasSaved||dirty)&&!demo&&<p className={s.notice}>{dirty?'Save the CV reader changes above first. AI works on the last saved version.':'Save your CV details first to unlock improvement previews and course achievements.'}</p>}
    <AIRequestNote/>
    <fieldset className={s.sections} disabled={busy||Boolean(demo)}><legend>Sections to improve</legend>{(Object.keys(sectionNames) as Section[]).map(field=><label key={field}><input type="checkbox" checked={fields.includes(field)} onChange={event=>setFields(values=>event.target.checked?[...values,field]:values.filter(value=>value!==field))}/>{sectionNames[field]}</label>)}</fieldset>
    <Button disabled={Boolean(demo)||!hasSaved||dirty||busy||!fields.length||!status.data?.configured} onClick={()=>generate.mutate(undefined)}>{generate.isPending?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>}Create improvement preview</Button>
    {context.data?.coverage.unmapped_skills.length? <div className={s.notice}><strong>Career catalogue coverage</strong><p>{context.data.coverage.notice}</p><p>Unmapped: {context.data.coverage.unmapped_skills.join(', ')}</p></div>:null}
    {Boolean(context.data?.badges.length)&&<div className={s.badges}><h3><Award size={18}/> Add a course achievement</h3><p className={s.note}>Uses your actual award record, not AI invention. Badge-derived skills retain their assessed level.</p>{context.data!.badges.map(badge=><div className={s.badge} key={badge.badge_code}><div><strong>{badge.title}</strong><small>{badge.provider} · {badge.badge_code}</small></div><Button variant="secondary" disabled={dirty||busy} onClick={()=>generate.mutate(badge.badge_code)}>Preview CV addition</Button></div>)}</div>}
    {preview&&<div className={s.preview}>
      <div className={s.previewHeader}><div><span className="eyebrow">{preview.mode}</span><h3>Review before saving</h3></div>{preview.before_rating&&<div className={s.score}>Last saved AI assessment: <strong>{preview.before_rating.score}/100</strong></div>}</div>
      <p className={s.note}>{preview.notice} A fresh AI assessment is available after saving; no automatic heuristic score is applied.</p>
      {Boolean(preview.added_skills?.length)&&<p className={s.notice}>Approving this course entry also adds these assessed skills to your CV: {preview.added_skills!.join(', ')}. Their badge assessment level is retained for career matching.</p>}
      {preview.changes.map(change=><article className={s.change} key={change.field}>
        <label className={s.selectChange}><input type="checkbox" checked={selected.includes(change.field)} onChange={event=>setSelected(values=>event.target.checked?[...values,change.field]:values.filter(value=>value!==change.field))}/><strong>{sectionNames[change.field]}</strong></label><p>{change.reason}</p>
        <div className={s.compare}><div><span>ORIGINAL</span><p>{change.before||'No existing text'}</p></div><label><span>SUGGESTED · EDITABLE</span><textarea rows={5} maxLength={change.field==='experience'||change.field==='projects'?10000:5000} value={edits[change.field]??change.after} onChange={event=>setEdits(values=>({...values,[change.field]:event.target.value}))}/></label></div>
      </article>)}
      <div className={s.actions}><Button disabled={!selected.length||busy||dirty} onClick={()=>apply.mutate()}><ShieldCheck size={16}/>Approve selected changes</Button><Button variant="secondary" disabled={busy} onClick={()=>setPreview(null)}>Discard preview</Button></div>
    </div>}
    <div className={s.preview}><h3>Your CV, ready to share.</h3><p>{preview?'Preview the selected improvements and your edits as a PDF without saving them.':'Generate a PDF from your saved CV. No model call is required to render it.'}</p><Button variant="secondary" disabled={Boolean(demo)||!hasSaved||dirty||busy||Boolean(preview&&!selected.length)} onClick={()=>exportPDF.mutate()}>{exportPDF.isPending?<Loader2 size={16} className="spin"/>:<FileText size={16}/>}Preview {preview?'improved':'saved'} CV PDF</Button>
    {pdf&&<div className={s.pdfPreview}><p className={s.note}>{pdf.notice}</p><div className={s.actions}><a className="text-link" href={pdf.url} download={pdf.filename}><Download size={16}/>Download CV PDF</a><Button variant="ghost" disabled={pdfPage===0} onClick={()=>setPdfPage(value=>value-1)} aria-label="Previous CV PDF page"><ChevronLeft size={16}/></Button><span>Page {pdfPage+1} of {pdfPages}</span><Button variant="ghost" disabled={pdfPage+1>=pdfPages} onClick={()=>setPdfPage(value=>value+1)} aria-label="Next CV PDF page"><ChevronRight size={16}/></Button></div><CVDocumentPreview source={pdf.bytes} page={pdfPage} onReady={(_,total)=>setPdfPages(total)} onError={setPdfError}/>{pdfError&&<p role="alert">{pdfError} You can still download the PDF.</p>}</div>}
    </div>
    {context.data?.history.length? <details className={s.history}><summary><History size={16}/> Previous CV versions</summary><p className={s.note}>The last five previous versions are retained. Restoring creates another version.</p>{[...context.data.history].reverse().map(item=><div className={s.badge} key={item.version}><span>Version {item.version}{item.saved_at?` · ${new Date(item.saved_at).toLocaleString()}`:''}</span><Button variant="secondary" disabled={dirty||busy} onClick={()=>restore.mutate(item.version)}>Restore version {item.version}</Button></div>)}</details>:null}
    {message&&<p role="status" className={s.notice}>{message}</p>}{error&&<p role="alert" className="error-box">{error.message} <a className="text-link" href="/app/cv?demo=student&tab=improve">View offline improvement example</a></p>}
  </section>;
}

type PreferencePreview={summary:string;explanation:string;answers:Answers;notice:string};
export function AIPersonalisation({answers,onUse}:{answers:Answers;onUse:(value:Answers)=>void}){
  const {demo}=useWorkspace();const status=useAIStatus();
  const [notes,setNotes]=useState(''),[candidate,setCandidate]=useState<PreferencePreview|null>(null);
  const mutation=useMutation({mutationFn:()=>api<PreferencePreview>('/questionnaire/ai/preview','POST',{answers,notes},{timeoutMs:200000}),onSuccess:setCandidate});
  return <details className={`card ${s.panel}`}><summary className={s.summary}><Sparkles size={19}/> Prefer to describe your direction?</summary><p>Describe the work you enjoy and what you want next. AI can suggest questionnaire answers—not a personality diagnosis.</p><AIState configured={status.data?.configured} demo={Boolean(demo)}/>
    <label className={s.notes}>Your goals and preferences<textarea rows={3} maxLength={2500} value={notes} disabled={Boolean(demo)||mutation.isPending} onChange={event=>{setNotes(event.target.value);setCandidate(null);}} placeholder="I enjoy troubleshooting networks and supporting people. I prefer clear processes and want to grow into IT support."/></label>
    <AIRequestNote/><Button disabled={Boolean(demo)||!status.data?.configured||notes.trim().length<10||mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>}Suggest my preferences</Button>
    {candidate&&<div className={s.preview}><h3>Your proposed direction</h3><p>{candidate.summary}</p><p>{candidate.explanation}</p><div className={s.preferenceGrid}>
      {(['work_style','environment','motivation'] as const).map(key=><label key={key}>{key.replace('_',' ')}<select value={candidate.answers[key]} onChange={event=>setCandidate(value=>value?{...value,answers:{...value.answers,[key]:event.target.value}}:value)}>{(key==='work_style'?['analytical','creative','practical','people']:key==='environment'?['structured','flexible']:['growth','stability','impact','balance']).map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}
    </div><fieldset className={s.sections}><legend>Interests</legend>{['data','technology','sustainability','creative','people','practical','business','investigation'].map(interest=><label key={interest}><input type="checkbox" checked={candidate.answers.interests.includes(interest)} onChange={event=>setCandidate(value=>value?{...value,answers:{...value.answers,interests:event.target.checked?[...value.answers.interests,interest]:value.answers.interests.filter(item=>item!==interest)}}:value)}/>{interest}</label>)}</fieldset><p className={s.note}>{candidate.notice} Your budget, location and weekly time stay unchanged.</p><Button onClick={()=>{onUse({...answers,...Object.fromEntries(['interests','work_style','environment','motivation'].map(key=>[key,candidate.answers[key as keyof Answers]]))});setCandidate(null);}}>Use these answers</Button></div>}
    {mutation.error&&<p role="alert" className="error-box">{mutation.error.message}</p>}
  </details>;
}

export function AICareerExplanations({matches}:{matches:Match[]}){
  const {demo}=useWorkspace();const status=useAIStatus();
  const [result,setResult]=useState<{fingerprint:string;explanations:{role_id:string;explanation:string}[];coverage:Coverage;notice:string}|null>(null);
  const fingerprint=JSON.stringify(matches.map(item=>[item.id,item.score,item.gaps,item.skill_evidence]));
  const mutation=useMutation({mutationFn:async()=>({...(await api<Omit<NonNullable<typeof result>,'fingerprint'>>('/careers/ai/explain','POST',{}, {timeoutMs:200000})),fingerprint}),onSuccess:setResult});
  return <details className={`card ${s.panel}`}><summary className={s.summary}><Sparkles size={19}/> Understand your matches with AI</summary><AIState configured={status.data?.configured} demo={Boolean(demo)}/><p>AI explains your existing scores, skill gaps and course evidence. It does not change rankings or search live vacancies.</p><AIRequestNote/><Button disabled={Boolean(demo)||!status.data?.configured||mutation.isPending} onClick={()=>mutation.mutate()}>{mutation.isPending?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/>}Explain my matches</Button>
    {result?.fingerprint===fingerprint&&<div className={s.preview}><p className={s.note}>{result.notice}</p>{result.explanations.map(item=><article className={s.explanation} key={item.role_id}><h3>{matches.find(match=>match.id===item.role_id)?.title||item.role_id}</h3><p>{item.explanation}</p></article>)}<p className={s.note}>{result.coverage.notice}</p>{Boolean(result.coverage.unmapped_skills.length)&&<p className={s.note}>Unmapped skills: {result.coverage.unmapped_skills.join(', ')}</p>}</div>}
    {mutation.error&&<p role="alert" className="error-box">{mutation.error.message}</p>}
  </details>;
}
