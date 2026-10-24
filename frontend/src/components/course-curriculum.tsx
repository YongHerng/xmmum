'use client';

import {useEffect,useRef,useState} from 'react';
import {useMutation} from '@tanstack/react-query';
import {ArrowDown,ArrowRight,ArrowUp,BookOpen,ChevronRight,FileQuestion,FileText,FolderOpen,Loader2,Plus,Save,Trash2,Undo2} from 'lucide-react';
import {Button} from './ui/button';
import {ChapterAttachments,ChapterMaterials,LessonVideo,type ChapterAttachmentHandle} from './learning-materials';
import {PartnerLogoField} from './provider-logo';
import type {LearningContext} from './learning-pathway';
import {activeSubsections,hasLegacyContent,hasSubsectionContent,learningRequest,type Chapter,type Course,type Subsection} from '@/lib/learning';
import t from './course-curriculum.module.css';

type Selection={kind:'new'}|{kind:'chapter'|'legacy'|'subsection';chapterId:string;subsectionId?:string};
type Props={ctx:LearningContext;course:Course;saved:(message:string)=>Promise<void>;onQuiz:(chapterId:string)=>void;onDirtyChange?:(dirty:boolean)=>void};
function Failure({error}:{error:Error|null}){return error?<p className="error-box" role="alert">{error.message} Your entries are kept.</p>:null;}

export function CourseCurriculum({ctx,course,saved,onQuiz,onDirtyChange}:Props){
  const [selection,setSelection]=useState<Selection>(()=>course.chapters.length?{kind:'chapter',chapterId:course.chapters[0].id}:{kind:'new'});
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const selected=selection.kind==='new'?undefined:course.chapters.find(ch=>ch.id===selection.chapterId);
  const number=selected?course.chapters.indexOf(selected)+1:course.chapters.length+1;
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function choose(next:Selection){
    if(busy)return;
    if(dirty&&!window.confirm('Discard the unsaved changes before switching?'))return;
    setDirty(false);setSelection(next);
  }
  const organize=useMutation({
    mutationFn:({chapterId,id,action}:{chapterId:string;id:string;action:string})=>learningRequest(ctx.demo,`/studio/courses/${course.id}/chapters/${chapterId}/subsections/${id}/${action}`,'POST'),
    onSuccess:async(_result,action)=>{await saved(action.action==='remove'?'Subsection removed. You can restore it below.':'Subsections updated. Numbering adjusts automatically.');if(action.action==='remove'&&selection.kind==='subsection'&&selection.subsectionId===action.id)setSelection({kind:'chapter',chapterId:action.chapterId});},
  });
  const locked=busy||organize.isPending;
  return <div className={t.root}>
    <div className={t.explainer}><span className={t.explainerIcon}><FolderOpen size={21}/></span><div><h2>Build your course, one chapter at a time.</h2><p>Chapters group a topic. Subsections are the lessons inside it. We number them for you.</p><div className={t.example}><span>Chapter 1 · Security fundamentals</span><ChevronRight size={13}/><span>1.1 Course overview</span><ChevronRight size={13}/><span>1.2 Key concepts</span></div></div></div>
    <div className={t.layout}>
      <aside className={`card ${t.structure}`} aria-label="Course structure">
        <div className={t.structureHeading}><h2>Course structure</h2><span className="tag">{course.chapters.length} {course.chapters.length===1?'chapter':'chapters'}</span></div>
        <nav aria-label="Curriculum editor"><ol>{course.chapters.map((chapter,index)=>{
          const sections=activeSubsections(chapter);const current=selected?.id===chapter.id;
          return <li key={chapter.id}><button type="button" className={t.chapter} aria-current={current&&selection.kind==='chapter'?'page':undefined} data-selected={current} disabled={locked} onClick={()=>choose({kind:'chapter',chapterId:chapter.id})}><span className={t.chapterNumber}>{index+1}</span><span><strong>{chapter.title}</strong><small>{sections.length} {sections.length===1?'subsection':'subsections'} · {chapter.question_count} quiz {chapter.question_count===1?'question':'questions'}</small></span><ChevronRight size={14}/></button>
            <ol className={t.subsections}>
              {hasLegacyContent(chapter)&&<li><button type="button" disabled={locked} aria-current={current&&selection.kind==='legacy'?'page':undefined} onClick={()=>choose({kind:'legacy',chapterId:chapter.id})}><FileText size={13}/><span>Earlier chapter material</span></button></li>}
              {sections.map((section,position)=><li key={section.id}><button type="button" disabled={locked} aria-current={current&&selection.kind==='subsection'&&selection.subsectionId===section.id?'page':undefined} onClick={()=>choose({kind:'subsection',chapterId:chapter.id,subsectionId:section.id})}><span>{index+1}.{position+1}</span><span>{section.title}</span></button></li>)}
              {!course.published&&<li><button type="button" className={t.addLink} disabled={locked} onClick={()=>choose({kind:'subsection',chapterId:chapter.id})}><Plus size={13}/><span>Add subsection {index+1}.{sections.length+1}</span></button></li>}
              <li className={t.quizItem}><button type="button" disabled={locked} onClick={()=>{if(dirty&&!window.confirm('Discard the unsaved changes before opening the quiz?'))return;setDirty(false);onQuiz(chapter.id);}}><FileQuestion size={13} aria-hidden="true"/><span>Chapter quiz</span><small>{chapter.question_count}</small></button></li>
            </ol>
          </li>;
        })}</ol></nav>
        {!course.chapters.length&&<p className={t.emptyTree}>Start by naming your first chapter. Its subsections will appear here.</p>}
        {!course.published&&<Button type="button" variant="secondary" disabled={locked} onClick={()=>choose({kind:'new'})}><Plus size={15}/>Add chapter {course.chapters.length+1}</Button>}
      </aside>
      <div className={t.editor}>
        <Failure error={organize.error}/>
        {selection.kind==='new'?<NewChapter key="new" ctx={ctx} course={course} number={number} saved={saved} created={id=>{setDirty(false);setSelection({kind:'chapter',chapterId:id});}} dirty={setDirty} busy={setBusy}/>:selected&&<>
          <div className={t.breadcrumb}><BookOpen size={14}/><span>Chapter {number}</span><ChevronRight size={13}/><strong>{selection.kind==='chapter'?'Chapter details':selection.kind==='legacy'?'Earlier material':selection.subsectionId?`${number}.${activeSubsections(selected).findIndex(s=>s.id===selection.subsectionId)+1} · Edit subsection`:`${number}.${activeSubsections(selected).length+1} · New subsection`}</strong></div>
          {selection.kind==='chapter'?<section className="card">
            <div className={t.sectionHeading}><div><span className="eyebrow">CHAPTER {number}</span><h2>{selected.title}</h2><p>Name the topic here, then add individual lessons underneath.</p></div><span className={t.chapterBadge}><FolderOpen size={23}/></span></div>
            {!course.published&&<ChapterDetails key={selected.id} ctx={ctx} course={course} chapter={selected} saved={saved} dirty={setDirty} busy={setBusy}/>}
            <div className={t.lessonList}><div className={t.structureHeading}><h3>Subsections in this chapter</h3><span className="tag">{activeSubsections(selected).length}</span></div>
              {!activeSubsections(selected).length&&<div className={t.empty}><FileText size={25}/><h3>Add your first subsection</h3><p>For example, {number}.1 Course overview. Give each lesson a name, then add text, a PDF or a video.</p></div>}
              {activeSubsections(selected).map((section,index)=><div className={t.lessonRow} key={section.id}><button type="button" disabled={locked} onClick={()=>choose({kind:'subsection',chapterId:selected.id,subsectionId:section.id})}><span>{number}.{index+1}</span><span><strong>{section.title}</strong><small>{hasSubsectionContent(selected,section)?'Learning material added':'Needs learning material'}</small></span></button>{!course.published&&<div className={t.rowActions}><button type="button" aria-label={`Move ${section.title} up`} disabled={locked||dirty||index===0} onClick={()=>organize.mutate({chapterId:selected.id,id:section.id,action:'up'})}><ArrowUp size={14}/></button><button type="button" aria-label={`Move ${section.title} down`} disabled={locked||dirty||index===activeSubsections(selected).length-1} onClick={()=>organize.mutate({chapterId:selected.id,id:section.id,action:'down'})}><ArrowDown size={14}/></button><button type="button" aria-label={`Remove subsection ${section.title}`} disabled={locked||dirty} onClick={()=>organize.mutate({chapterId:selected.id,id:section.id,action:'remove'})}><Trash2 size={14}/></button></div>}</div>)}
              {!course.published&&<Button type="button" disabled={locked} onClick={()=>choose({kind:'subsection',chapterId:selected.id})}><Plus size={15}/>Add subsection {number}.{activeSubsections(selected).length+1}</Button>}
            </div>
            {(selected.subsections||[]).some(s=>s.removed_at)&&<details className={t.removed}><summary>Removed subsections</summary>{selected.subsections!.filter(s=>s.removed_at).map(section=><div key={section.id}><span>{section.title}</span><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>organize.mutate({chapterId:selected.id,id:section.id,action:'restore'})}><Undo2 size={14}/>Restore</Button></div>)}</details>}
          </section>:<SubsectionEditor key={`${selected.id}:${selection.kind}:${selection.subsectionId||'new'}`} ctx={ctx} course={course} chapter={selected} number={number} subsection={selection.kind==='subsection'?selected.subsections?.find(s=>s.id===selection.subsectionId):undefined} legacy={selection.kind==='legacy'} saved={saved} created={id=>{setDirty(false);setSelection({kind:'subsection',chapterId:selected.id,subsectionId:id});}} dirty={setDirty} busy={setBusy}/>}
        </>}
        {!course.published&&<CourseDetails ctx={ctx} course={course} saved={saved} disabled={locked}/>}
      </div>
    </div>
  </div>;
}

function NewChapter({ctx,course,number,saved,created,dirty,busy}:{ctx:LearningContext;course:Course;number:number;saved:Props['saved'];created:(id:string)=>void;dirty:(value:boolean)=>void;busy:(value:boolean)=>void}){
  const [title,setTitle]=useState('');
  const save=useMutation({mutationFn:()=>learningRequest<Course>(ctx.demo,`/studio/courses/${course.id}/chapters`,'POST',{title:title.trim()}),onSuccess:async result=>{dirty(false);await saved('Chapter created. Now add its first subsection.');created(result.chapters.at(-1)!.id);}});
  useEffect(()=>{busy(save.isPending);},[busy,save.isPending]);
  return <section className={`card ${t.newChapter}`}><span className={t.largeIcon}><FolderOpen size={27}/></span><span className="eyebrow">FIRST, NAME THE CHAPTER</span><h2>Create chapter {number}</h2><p>A chapter groups related lessons. You’ll add numbered subsections after creating it.</p><form onSubmit={event=>{event.preventDefault();save.mutate();}}><label>Chapter name<input autoFocus value={title} required maxLength={160} placeholder="e.g. Security fundamentals" onChange={event=>{setTitle(event.target.value);dirty(true);}} disabled={save.isPending}/></label><div className={t.namePreview}><span>COURSE STRUCTURE PREVIEW</span><strong>Chapter {number} · {title.trim()||'Your chapter name'}</strong><small>{number}.1 Your first subsection</small></div><Failure error={save.error}/><Button type="submit" disabled={save.isPending||!title.trim()}>{save.isPending?<Loader2 size={15} className="spin"/>:<Plus size={15}/>}Create chapter & continue<ArrowRight size={15}/></Button></form></section>;
}

function ChapterDetails({ctx,course,chapter,saved,dirty,busy}:{ctx:LearningContext;course:Course;chapter:Chapter;saved:Props['saved'];dirty:(value:boolean)=>void;busy:(value:boolean)=>void}){
  const [title,setTitle]=useState(chapter.title);const [minutes,setMinutes]=useState(chapter.minutes);const [changed,setChanged]=useState(false);
  const save=useMutation({mutationFn:()=>learningRequest(ctx.demo,`/studio/courses/${course.id}/chapters/${chapter.id}`,'PUT',{title:title.trim(),minutes,skill:chapter.skill,body:chapter.body,video_url:chapter.video_url||''}),onSuccess:async()=>{dirty(false);setChanged(false);await saved('Chapter details saved.');}});
  useEffect(()=>{busy(save.isPending);},[busy,save.isPending]);
  return <form className={t.chapterDetails} onSubmit={event=>{event.preventDefault();save.mutate();}}><div className="form-grid"><label>Chapter name<input value={title} onChange={e=>{setTitle(e.target.value);dirty(true);setChanged(true);}} required maxLength={160}/></label><label>Estimated chapter minutes<input type="number" value={minutes} onChange={e=>{setMinutes(Number(e.target.value));dirty(true);setChanged(true);}} min={1} max={600} required/></label></div><Failure error={save.error}/>{changed&&<Button type="submit" size="sm" variant="secondary" disabled={save.isPending||!title.trim()}><Save size={14}/>Save chapter details</Button>}</form>;
}

function SubsectionEditor({ctx,course,chapter,number,subsection,legacy,saved,created,dirty,busy}:{ctx:LearningContext;course:Course;chapter:Chapter;number:number;subsection?:Subsection;legacy:boolean;saved:Props['saved'];created:(id:string)=>void;dirty:(value:boolean)=>void;busy:(value:boolean)=>void}){
  const [title,setTitle]=useState(subsection?.title||'');const [body,setBody]=useState(legacy?chapter.body:subsection?.body||'');const [video,setVideo]=useState((legacy?chapter.video_url:subsection?.video_url)||'');const [fileBusy,setFileBusy]=useState(false);
  const [changed,setChanged]=useState(false);const [pendingCount,setPendingCount]=useState(0);
  const persistedId=useRef(subsection?.id);const [knownId,setKnownId]=useState(subsection?.id);
  const attachments=useRef<ChapterAttachmentHandle>(null);
  const position=knownId?activeSubsections(chapter).findIndex(s=>s.id===knownId)+1||activeSubsections(chapter).length+1:activeSubsections(chapter).length+1;
  const save=useMutation({mutationFn:async()=>{
    if(!legacy&&!title.trim())throw new Error('Enter a subsection name before saving.');
    const result=await learningRequest<Course>(ctx.demo,`/studio/courses/${course.id}/chapters/${chapter.id}${legacy?'':`/subsections${persistedId.current?`/${persistedId.current}`:''}`}`,legacy||persistedId.current?'PUT':'POST',legacy?{title:chapter.title,minutes:chapter.minutes,skill:chapter.skill,body,video_url:video}:{title:title.trim(),body,video_url:video});
    if(!legacy&&!persistedId.current){
      const id=result.chapters.find(c=>c.id===chapter.id)?.subsections?.at(-1)?.id;
      if(!id)throw new Error('The saved subsection could not be identified. Refresh before trying again.');
      // Keep the created ID even if a file fails, so a retry updates the same lesson.
      persistedId.current=id;setKnownId(id);
    }
    setChanged(false);
    const outcome=await attachments.current!.uploadPending(persistedId.current);
    if(outcome.error){
      await saved('Lesson details saved. Some files still need uploading; use Save below to retry.');
      throw new Error(`${outcome.error} ${outcome.remaining} ${outcome.remaining===1?'file remains':'files remain'} selected. Successful uploads are kept; save again to retry.`);
    }
    return outcome.uploaded;
  },onSuccess:async uploaded=>{
    await saved(`${legacy?'Earlier chapter material':'Subsection'} saved.${uploaded?` ${uploaded} ${uploaded===1?'file':'files'} uploaded.`:''}`);
    dirty(false);
    if(!legacy&&!subsection&&persistedId.current)created(persistedId.current);
  }});
  useEffect(()=>{dirty(changed||pendingCount>0||save.isPending||fileBusy);},[dirty,changed,pendingCount,save.isPending,fileBusy]);
  useEffect(()=>{busy(save.isPending||fileBusy);},[busy,save.isPending,fileBusy]);
  return <section className="card"><div className={t.sectionHeading}><div><span className="eyebrow">INSIDE CHAPTER {number} · {chapter.title}</span><h2>{legacy?'Earlier chapter material':subsection?`Edit subsection ${number}.${position}`:`Add subsection ${number}.${position}`}</h2><p>{legacy?'Your existing content is kept here. It has not been replaced or moved.':'A subsection is one lesson within this chapter. Numbering is automatic.'}</p></div><span className={t.chapterBadge}><FileText size={22}/></span></div>
    {course.published?<><h3>{subsection?.title}</h3>{body.split('\n\n').map((text,index)=><p className={t.previewText} key={index}>{text}</p>)}<ChapterMaterials ctx={ctx} course={course} chapter={chapter} subsectionId={subsection?.id} preview/>{video&&<LessonVideo ctx={ctx} course={course} chapter={chapter} src={video} preview/>}</>:<>
      <form onSubmit={event=>{event.preventDefault();if(!save.isPending&&!fileBusy)save.mutate();}}><fieldset disabled={save.isPending||fileBusy}>{!legacy&&<label>Subsection name<input aria-label="Subsection name" aria-describedby="subsection-name-hint" value={title} onChange={e=>{setTitle(e.target.value);setChanged(true);}} required maxLength={160} placeholder="e.g. Course overview"/><small id="subsection-name-hint" className={t.fieldHint}>Shown to learners as {number}.{position} {title.trim()||'Your subsection name'}</small></label>}
        <label>Text notes (optional)<textarea value={body} rows={7} maxLength={20000} placeholder="Write your lesson notes, choose a PDF or video below, or combine both." onChange={e=>{setBody(e.target.value);setChanged(true);}}/></label>
        <details className={t.videoLink}><summary>Use a direct video link instead</summary><label>Direct video URL<input type="url" value={video} maxLength={2000} placeholder="https://…/lesson.mp4" onChange={e=>{setVideo(e.target.value);setChanged(true);}}/></label><p>Use only authorized direct HTTPS video files.</p></details></fieldset>
        <ChapterAttachments ref={attachments} ctx={ctx} course={course} chapter={chapter} subsectionId={knownId} saved={saved} onBusyChange={setFileBusy} onPendingChange={setPendingCount} unpersisted={!legacy&&!knownId} deferred disabled={save.isPending}/>
        <Failure error={save.error}/><Button type="submit" disabled={save.isPending||fileBusy||(!legacy&&!title.trim())}>{save.isPending?<Loader2 size={15} className="spin"/>:<Save size={15}/>} {save.isPending?'Saving lesson…':pendingCount?`Save ${legacy?'earlier material':'subsection'} & upload ${pendingCount} ${pendingCount===1?'file':'files'}`:`Save ${legacy?'earlier material':subsection?'subsection':`subsection ${number}.${position}`}`}</Button>
      </form>
    </>}
  </section>;
}

function CourseDetails({ctx,course,saved,disabled}:{ctx:LearningContext;course:Course;saved:Props['saved'];disabled:boolean}){
  const [logo,setLogo]=useState(course.provider_logo||'');const [logoBusy,setLogoBusy]=useState(false);
  const details=useMutation({mutationFn:(values:unknown)=>learningRequest(ctx.demo,`/studio/courses/${course.id}`,'PUT',values),onSuccess:()=>saved('Course details saved.')});
  return <details className={`card ${t.courseDetails}`}><summary>Course details & partner logo</summary><form onSubmit={event=>{event.preventDefault();details.mutate({...Object.fromEntries(new FormData(event.currentTarget)),provider_logo:logo});}}><fieldset disabled={disabled||details.isPending}><label>Course title<input name="title" defaultValue={course.title} required maxLength={120}/></label><label>Training provider<input name="provider" defaultValue={course.provider} required maxLength={100}/></label><label>About this course<textarea name="description" defaultValue={course.description} required rows={5} maxLength={1200}/><small className={t.fieldHint}>Write the introduction learners will see on the course review page.</small></label><label>Category<input name="category" defaultValue={course.category} maxLength={50}/></label><PartnerLogoField value={logo} onChange={setLogo} onBusyChange={setLogoBusy}/><Failure error={details.error}/><Button type="submit" variant="secondary" disabled={logoBusy}>Save course details</Button></fieldset></form></details>;
}

