'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowRight,ChevronLeft,ChevronRight,FileText,FileUp,Loader2,Plus,ShieldCheck,X} from 'lucide-react';
import type {CV,Role} from '@/lib/types';
import {hasCV} from '@/lib/cv-status';
import {toCV,toDraft,validateCV,type ParsedCV,type ReaderDraft} from '@/lib/cv-reader';
import {CVDocumentPreview} from './cv-document-preview';
import {CVEntries} from './cv-entries';
import s from './cv-editor.module.css';

type Props={initialCV:CV;roles:Pick<Role,'id'|'title'>[];demo?:boolean;uploadRequired?:boolean;parse:(file:File,signal:AbortSignal)=>Promise<ParsedCV>;confirm:(cv:CV)=>Promise<void>;onDirtyChange?:(dirty:boolean)=>void};
const textSections=[['summary','Professional summary'],['experience','Experience'],['education','Education'],['projects','Projects & achievements'],['certificates_training','Certificates and training'],['membership_licensure','Membership and licensure']] as const;

export function CVReader({initialCV,roles,demo=false,uploadRequired=false,parse,confirm,onDirtyChange}:Props){
 const [draft,setDraft]=useState(()=>toDraft({...initialCV,target_role:initialCV.target_role||''}));
 const [active,setActive]=useState('contact'),[phase,setPhase]=useState<'idle'|'reading'|'review'|'saving'>(()=>hasCV(initialCV)&&!uploadRequired?'review':'idle');
 const [filename,setFilename]=useState(''),[source,setSource]=useState<Uint8Array|null>(null),[page,setPage]=useState(0),[pages,setPages]=useState(1);
 const [error,setError]=useState(''),[previewError,setPreviewError]=useState('');
 const [result,setResult]=useState<ParsedCV|null>(null);
 const input=useRef<HTMLInputElement>(null),controller=useRef<AbortController|null>(null),generation=useRef(0);
 const busy=phase==='reading'||phase==='saving',ready=phase==='review',savedCV=hasCV(initialCV)&&!uploadRequired;
 const dirty=JSON.stringify(toCV(draft))!==JSON.stringify(toCV(toDraft(initialCV)));
 useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
 useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
 const onReady=useCallback((_page:number,total:number)=>setPages(total),[]);
 const onPreviewError=useCallback((message:string)=>setPreviewError(message),[]);
 const extra=draft.additional_sections||[];
 const sections=[{id:'contact',title:'Personal details',filled:Boolean(draft.name)},...textSections.map(([id,title])=>({id,title,filled:Boolean(draft[id]?.trim())})),{id:'skills',title:'Skills',filled:Boolean(draft.skillsText.trim())},...extra.map((section,index)=>({id:'extra-'+index,title:section.title,filled:Boolean(section.content.trim())}))];
 const count=sections.filter(section=>section.filled).length;
 function edit(key:keyof ReaderDraft,value:string|boolean){setDraft(previous=>({...previous,[key]:value}));setError('');}
 function clear(){generation.current++;controller.current?.abort();setSource(null);setFilename('');setResult(null);setPage(0);setError('');setPreviewError('');setDraft(toDraft(initialCV));setPhase(savedCV?'review':'idle');setActive('contact');}
 async function read(file:File,sample?:ParsedCV){
   if(busy||demo&&!sample)return;
   if(!/\.(pdf|docx|png|jpe?g)$/i.test(file.name)||!file.size||file.size>10*1024*1024){setError('Choose a PDF, DOCX, JPG or PNG up to 10 MB.');return;}
   controller.current?.abort();const request=new AbortController();controller.current=request;const current=++generation.current;
   setError('');setPreviewError('');setPhase('reading');setFilename(file.name);setSource(null);setPage(0);setResult(null);
   try{
     if(/\.pdf$/i.test(file.name)){const bytes=new Uint8Array(await file.arrayBuffer());if(current!==generation.current)return;setSource(bytes);}
     const parsed=sample||await parse(file,request.signal);
     if(current!==generation.current)return;
     if(!parsed.document?.pages?.length)throw new Error('The document reader returned an incomplete result. Please retry.');
     if(parsed.document.pdf_base64)setSource(Uint8Array.from(atob(parsed.document.pdf_base64),char=>char.charCodeAt(0)));
     setDraft(toDraft({...parsed.cv,target_role:initialCV.target_role||'',ai_consent:false}));
     setResult(parsed);setPhase('review');setActive('contact');
   }catch(cause){if(current!==generation.current||request.signal.aborted)return;setPhase('idle');setError(cause instanceof Error?cause.message:'Could not read this CV. Please retry.');}
 }
 async function example(){
   try{const response=await fetch('/examples/aisha-cv.pdf');if(!response.ok)throw new Error('Sample unavailable.');const file=new File([await response.blob()],'sample-cv.pdf',{type:'application/pdf'});
     if(demo){const json=await fetch('/examples/aisha-cv.json');await read(file,await json.json());}else await read(file);
   }catch{setError('Could not load the sample CV.');}
 }
 async function save(event:React.FormEvent){
   event.preventDefault();if(busy)return;
   if(!demo&&uploadRequired&&!filename){setError('Upload your CV before confirming your details.');return;}
   if(!demo){const invalid=validateCV(draft);if(invalid){setError(invalid);return;}}
   setPhase('saving');setError('');
   try{await confirm(toCV(draft));setPhase('review');}
   catch(cause){setPhase('review');setError(cause instanceof Error?cause.message:'Could not save your CV.');}
 }
 function updateExtra(index:number,key:'title'|'content',value:string){setDraft(previous=>({...previous,additional_sections:(previous.additional_sections||[]).map((item,i)=>i===index?{...item,[key]:value}:item)}));}
 function updateEntries(entries:NonNullable<CV['entries']>){
   setDraft(previous=>{
     const next={...previous,entries};
     for(const section of ['education','experience','projects','membership_licensure','certificates_training'] as const){
       const old=(previous.entries||[]).filter(entry=>entry.section===section);if(!old.length)continue;
       const covered=new Set(old.flatMap(entry=>[entry.title,entry.organisation,entry.dates,...entry.bullets]).map(value=>value.trim().toLowerCase()));
       const remaining=previous[section].split('\n').filter(line=>line.trim()&&!covered.has(line.trim().toLowerCase()));
       next[section]=[...entries.filter(entry=>entry.section===section).map(entry=>[entry.title,entry.organisation,entry.dates,...entry.bullets].filter(Boolean).join('\n')),...remaining].join('\n\n');
     }return next;
   });
 }
 return <section className={s.editor} aria-label="CV reader">
   <aside className={s.document} aria-label="CV document">
     <div className={s.documentHeading}><FileText size={20}/><div><h2>{filename?'Your document':savedCV?'Your CV details are saved':'Upload your CV'}</h2><small>{filename||'PDF, DOCX, JPG or PNG · up to 10 MB'}</small></div></div>
     {!demo&&<p className={s.note}>Uploading starts AI extraction with RunPod. Detected contacts are minimised; other personal details may remain.</p>}
     <input ref={input} type="file" className={s.file} aria-label={savedCV?'Upload replacement CV file':'Upload CV'} accept=".pdf,.docx,.jpg,.jpeg,.png" disabled={busy||demo} onChange={event=>{if(event.target.files?.[0])void read(event.target.files[0]);event.target.value='';}}/>
     <div className={s.tray} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();if(event.dataTransfer.files[0])void read(event.dataTransfer.files[0]);}}>
       {source?<CVDocumentPreview source={source} page={page} onReady={onReady} onError={onPreviewError}/>:<div className={s.empty}><FileUp size={36}/><h3>{filename?'Reading your document…':savedCV?'All your sections, in one place.':'Drop your CV here'}</h3><p>{savedCV?'Use the section tabs to review or edit your CV.':'AI reads the whole CV, including non-standard sections.'}</p><button type="button" className="text-link" disabled={busy||demo} onClick={()=>input.current?.click()}>{savedCV?'Replace CV':'Choose file'}</button></div>}
     </div>
     {source&&pages>1&&<div className={s.pageControls}><button type="button" aria-label="Previous CV page" disabled={page===0} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={16}/></button><span>{page+1} / {pages}</span><button type="button" aria-label="Next CV page" disabled={page===pages-1} onClick={()=>setPage(value=>value+1)}><ChevronRight size={16}/></button></div>}
     {filename&&<div className={s.fileActions}><button type="button" className="text-link" onClick={clear} disabled={phase==='saving'} aria-label="Remove document"><X size={14}/>Remove document</button><button type="button" className="text-link" disabled={busy||demo} onClick={()=>input.current?.click()}>Replace CV</button></div>}
     {!demo&&result&&<p className={s.note}>Extracted text is saved as a draft for reload. Save & analyse confirms the whole CV.</p>}
     {previewError&&<p className={s.note}>Preview unavailable. Extracted sections remain editable.</p>}
     {!savedCV&&!filename&&<button type="button" className="text-link" onClick={()=>void example()} disabled={busy}>Try the fictional sample <ArrowRight size={14}/></button>}
     {!demo&&!uploadRequired&&phase==='idle'&&<button type="button" className="text-link" onClick={()=>{setPhase('review');setError('');}}>Enter details manually</button>}
     <p className={s.note}><ShieldCheck size={13}/>Original files are discarded after reading.</p>
   </aside>
   <form className={s.details} onSubmit={save} aria-busy={busy}>
     <header className={s.detailsHeading}><div><span className="eyebrow">YOUR COMPLETE CV</span><h2>{result?'Extracted sections':'CV sections'}</h2></div><span className="tag">{count} filled</span></header>
     <p className={s.note}>{busy?<><Loader2 size={14} className="spin"/>{phase==='reading'?'Extracting all sections…':'Saving and analysing…'}</>:'Edit any section, then save once. No separate skills confirmation.'}</p>
     <div className={s.sectionLayout}>
       <div className={s.sectionTabs} role="tablist" aria-label="CV sections" aria-orientation="vertical">{sections.map(section=><button type="button" key={section.id} id={'section-tab-'+section.id} role="tab" aria-selected={active===section.id} aria-controls={'section-panel-'+section.id} onClick={()=>setActive(section.id)}><span className={section.filled?s.filled:s.dot}/>{section.title}</button>)}
       {!demo&&<button type="button" className={s.addSection} disabled={!ready||extra.length>=30} onClick={()=>{setDraft(previous=>({...previous,additional_sections:[...(previous.additional_sections||[]),{title:'New section',content:''}]}));setActive('extra-'+extra.length);}}><Plus size={14}/>Add section</button>}</div>
       <fieldset className={s.panelFields} disabled={!ready||demo}>
         <div role="tabpanel" id="section-panel-contact" aria-labelledby="section-tab-contact" hidden={active!=='contact'}><h3>Personal details</h3><label>Full name<input autoComplete="name" maxLength={100} value={draft.name} onChange={event=>edit('name',event.target.value)}/></label><label>Email address<input type="email" maxLength={200} value={draft.email} onChange={event=>edit('email',event.target.value)}/></label><label>Phone number<input type="tel" maxLength={50} value={draft.phone} onChange={event=>edit('phone',event.target.value)}/></label><label>Target career for CV review<select value={draft.target_role} onChange={event=>edit('target_role',event.target.value)}><option value="">Let AI suggest a direction</option>{roles.map(role=><option value={role.id} key={role.id}>{role.title}</option>)}</select></label><p className={s.note}>Your target is context, not a restriction. AI can suggest a different direction.</p></div>
         {textSections.map(([key,title])=><div role="tabpanel" key={key} id={'section-panel-'+key} aria-labelledby={'section-tab-'+key} hidden={active!==key}><h3>{title}</h3><label>{title}<textarea rows={10} maxLength={key==='experience'||key==='projects'?10000:5000} value={draft[key]} onChange={event=>edit(key,event.target.value)}/></label>{Boolean(draft.entries?.some(entry=>entry.section===key))&&<CVEntries entries={draft.entries!.filter(entry=>entry.section===key)} onChange={entries=>updateEntries([...(draft.entries||[]).filter(entry=>entry.section!==key),...entries])}/>}</div>)}
         <div role="tabpanel" id="section-panel-skills" aria-labelledby="section-tab-skills" hidden={active!=='skills'}><h3>Skills</h3><label>Skills<textarea rows={7} maxLength={5000} value={draft.skillsText} onChange={event=>edit('skillsText',event.target.value)}/></label><p className={s.note}>Separate skills with commas or new lines. These are saved with the rest of your CV.</p></div>
         {extra.map((section,index)=><div key={index} role="tabpanel" id={'section-panel-extra-'+index} aria-labelledby={'section-tab-extra-'+index} hidden={active!=='extra-'+index}><h3>{section.title}</h3><label>Section name<input maxLength={150} value={section.title} onChange={event=>updateExtra(index,'title',event.target.value)}/></label><label>{section.title} content<textarea rows={10} maxLength={10000} value={section.content} onChange={event=>updateExtra(index,'content',event.target.value)}/></label><button type="button" className="text-link" onClick={()=>{setDraft(previous=>({...previous,additional_sections:(previous.additional_sections||[]).filter((_,i)=>i!==index)}));setActive('contact');}}>Remove section</button></div>)}
       </fieldset>
     </div>
     {error&&<p className="error-box" role="alert">{error} <a className="text-link" href="/app/cv?demo=student">View offline CV example</a></p>}
     <footer className={s.saveBar}><p className={s.note}>{demo?'Fictional demo · Read-only':'Save & analyse sends relevant CV text and preferences to RunPod. Detected contacts are minimised; other personal details may remain.'}</p><button type="submit" className="btn btn-primary" disabled={!ready}>{phase==='saving'?<Loader2 size={16} className="spin"/>:null}{demo?'Explore analysis':'Save & analyse CV'}<ArrowRight size={16}/></button></footer>
   </form>
 </section>;
}
