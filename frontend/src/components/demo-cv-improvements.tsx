'use client';
import {useState} from 'react';
import Link from 'next/link';
import {Award,Download,FileText,Sparkles} from 'lucide-react';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {PdfReader} from './pdf-reader';
import s from './ai-assistance.module.css';

export function DemoCVImprovements(){
 const {data,demo}=useWorkspace();const [showPDF,setShowPDF]=useState(false);const example=data.demo_outcomes;
 const src=`/demos/${demo==='professional'?'professional':'student'}-improved-cv.pdf`;
 return <section className={`card ${s.panel}`} aria-label="Example CV improvement workspace"><header className={s.heading}><span className="icon-tile"><Sparkles size={22}/></span><div><span className="eyebrow">EXPECTED OUTCOME · NO AI REQUEST</span><h2>A clearer CV, illustrated.</h2><p>Compare authored suggestions with the fictional source CV.</p></div></header><p className={s.notice}>Hardcoded backup example. This is not an assessment or rewrite of your personal CV; no changes are saved.</p>
 {example?.improvements.map(change=><article className={s.change} key={change.field}><h3>{change.title}</h3><p>{change.reason}</p><div className={s.compare}><div><span>ORIGINAL EXAMPLE</span><p>{change.before}</p></div><div><span>SUGGESTED EXAMPLE</span><p>{change.after}</p></div></div></article>)}
 {example&&<div className={s.badges}><h3><Award size={18}/> A course achievement becomes skill evidence</h3><p>{example.badge_addition}</p><p className={s.note}>In a personal account, passing a course adds its assessed skill to matching. Adding the achievement to the CV is a separate approval; it is not employment experience.</p></div>}
 <div className={s.preview}><h3>Preview the expected PDF outcome</h3><p>The bundled PDF includes the example wording and clearly marked fictional learning evidence. It remains available without the backend or providers.</p><div className={s.actions}><Button variant="secondary" onClick={()=>setShowPDF(value=>!value)}><FileText size={16}/>{showPDF?'Hide example PDF':'Preview example improved CV PDF'}</Button><a className="text-link" href={src} download><Download size={16}/>Download example CV PDF</a></div>{showPDF&&<div className={s.pdfPreview}><PdfReader src={src} name="Fictional improved CV example"/></div>}</div>
 <Link className="text-link" href="/auth/login">Sign in to improve your own CV</Link></section>;
}
