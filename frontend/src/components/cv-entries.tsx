'use client';
import type {CVEntry} from '@/lib/types';
import s from './ai-assistance.module.css';

export function CVEntries({entries,onChange}:{entries:CVEntry[];onChange:(entries:CVEntry[])=>void}){
  function update(index:number,key:keyof CVEntry,value:string|string[]){onChange(entries.map((item,i)=>i===index?{...item,[key]:value}:item));}
  return <details className={s.structured}><summary>Structured entries · {entries.length} items</summary><p>AI grouped these jobs, projects and qualifications. Check every field. Editing an entry also updates its text section.</p>{entries.map((entry,index)=><article className={s.change} key={index}><span className="eyebrow">{entry.section.replaceAll('_',' ')} · {index+1}</span><label>Title or qualification<input maxLength={300} value={entry.title} onChange={event=>update(index,'title',event.target.value)}/></label><div className={s.preferenceGrid}><label>Employer / institution<input maxLength={300} value={entry.organisation} onChange={event=>update(index,'organisation',event.target.value)}/></label><label>Dates<input maxLength={150} value={entry.dates} onChange={event=>update(index,'dates',event.target.value)}/></label></div><label>Details · one bullet per line<textarea rows={4} maxLength={5000} value={entry.bullets.join('\n')} onChange={event=>update(index,'bullets',event.target.value.split('\n'))}/></label><button type="button" className="text-link" onClick={()=>onChange(entries.filter((_,i)=>i!==index))}>Remove entry</button></article>)}</details>;
}
