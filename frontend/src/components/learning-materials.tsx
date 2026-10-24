'use client';

import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {useMutation,useQuery} from '@tanstack/react-query';
import {ArrowUpRight,Download,FileText,Film,Loader2,RotateCcw,Trash2,Undo2,UploadCloud} from 'lucide-react';
import {Button} from './ui/button';
import type {LearningContext} from './learning-pathway';
import {fileSize,learningRequest,materialUrl,uploadLearningFile,validateLearningFile,type Chapter,type Course,type MaterialAccess} from '@/lib/learning';
import m from './learning-materials.module.css';
import {PdfReader} from './pdf-reader';

export type AttachmentUploadResult={uploaded:number;remaining:number;error?:string};
export type ChapterAttachmentHandle={uploadPending:(subsectionId?:string)=>Promise<AttachmentUploadResult>};
type AttachmentProps={ctx:LearningContext;course:Course;chapter:Chapter;saved:(message:string)=>Promise<void>;onBusyChange:(busy:boolean)=>void;subsectionId?:string;deferred?:boolean;unpersisted?:boolean;disabled?:boolean;onPendingChange?:(count:number)=>void};

export const ChapterAttachments=forwardRef<ChapterAttachmentHandle,AttachmentProps>(function ChapterAttachments({ctx,course,chapter,saved,onBusyChange,subsectionId,deferred=false,unpersisted=false,disabled=false,onPendingChange},ref){
  const [files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [progress,setProgress]=useState(0);
  const [uploading,setUploading]=useState('');
  const [preview,setPreview]=useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  const path=`/studio/courses/${course.id}/chapters/${chapter.id}/materials`;
  const change=useMutation({
    mutationFn:({id,action}:{id:string;action:string})=>learningRequest(ctx.demo,`${path}/${id}/${action}`,'POST'),
    onSuccess:async(_value,variables)=>{await saved(variables.action==='remove'?'File removed from the lesson. Restore is available until publishing.':'Learning file restored.');},
  });
  useEffect(()=>{onBusyChange(busy||change.isPending);},[busy,change.isPending,onBusyChange]);
  useEffect(()=>{onPendingChange?.(files.length);},[files.length,onPendingChange]);
  useImperativeHandle(ref,()=>({uploadPending:upload}));
  const locked=disabled||Boolean(ctx.demo)||busy||change.isPending;
  const scoped=unpersisted?[]:(chapter.materials||[]).filter(file=>(file.subsection_id||'')===(subsectionId||''));
  const active=scoped.filter(file=>!file.removed_at);
  const removed=scoped.filter(file=>file.removed_at);
  function choose(selected:FileList|null){
    if(!selected)return;
    try{
      const additions=Array.from(selected);
      additions.forEach(validateLearningFile);
      const pending=[...files];
      for(const file of additions){
        if(!pending.some(item=>item.name===file.name&&item.size===file.size&&item.lastModified===file.lastModified))pending.push(file);
      }
      if(pending.length+(chapter.materials?.length||0)>20)throw new Error('A chapter can hold up to 20 files, including removed files.');
      setFiles(pending);setError('');
    }catch(reason){setError((reason as Error).message);}
  }
  async function upload(targetSubsectionId=subsectionId):Promise<AttachmentUploadResult>{
    const pending=[...files];
    if(!pending.length)return {uploaded:0,remaining:0};
    const abort=new AbortController();controller.current=abort;
    setBusy(true);setError('');
    let completed=0;
    let failure:string|undefined;
    try{
      for(const file of pending){
        setUploading(file.name);setProgress(0);
        await uploadLearningFile(ctx.demo,path,file,setProgress,abort.signal,targetSubsectionId);
        completed++;setFiles(pending.slice(completed));
      }
    }catch(reason){failure=abort.signal.aborted?'Upload cancelled.':(reason as Error).message;if(!deferred&&!abort.signal.aborted)setError(failure);}
    finally{
      setBusy(false);setUploading('');
      controller.current=null;
      if(completed&&!deferred)await saved(`${completed} learning file${completed===1?'':'s'} uploaded. You can preview them below.`);
    }
    return {uploaded:completed,remaining:pending.length-completed,error:failure};
  }
  if(ctx.demo)return <section className={m.authorFiles} aria-label="PDF and video lessons"><h3>PDF & video lessons</h3><p>Sign in to your personal workspace to upload private course files. Guest practice supports text lessons and quizzes.</p><a className="text-link" href="/auth/login">Sign in to upload files</a></section>;
  return <section className={m.authorFiles} aria-labelledby="chapter-files-title">
    <div className={m.sectionHeading}><div><h3 id="chapter-files-title">PDF & video lessons</h3><p>Use files instead of text, or combine both.</p></div>{active.length>0&&<Button type="button" size="sm" variant="ghost" onClick={()=>setPreview(value=>!value)}>{preview?'Hide preview':'Preview files'}</Button>}</div>
    <label className={m.dropzone}><UploadCloud size={25}/><strong>Upload PDF or video</strong><span>PDF up to 20 MB · MP4 / WEBM up to 100 MB each</span><span>{deferred?'Choose files now. They upload when you save this lesson.':'Choose one or several files'}</span><input aria-label="Upload PDF or video" type="file" accept=".pdf,.mp4,.webm,application/pdf,video/mp4,video/webm" multiple disabled={locked} onChange={event=>{choose(event.target.files);event.target.value='';}}/></label>
    {files.length>0&&<div className={m.pending}>
      {files.map((file,index)=><div key={`${file.name}:${index}`}><span>{file.name}<small>{fileSize(file.size)}</small></span><button type="button" aria-label={`Remove selected ${file.name}`} disabled={locked} onClick={()=>setFiles(previous=>previous.filter((_,position)=>position!==index))}><Trash2 size={14}/></button></div>)}
      {busy&&<div className={m.uploadProgress}><span role="status">Uploading {uploading} · {progress}%</span><progress value={progress} max={100} aria-label="File upload progress"/></div>}
      {deferred?!busy&&<p className={m.note}>{files.length} {files.length===1?'file ready':'files ready'} · Save below to upload.</p>:<Button type="button" size="sm" disabled={locked} onClick={()=>void upload()}>{busy?<Loader2 size={15} className="spin"/>:<UploadCloud size={15}/>}Upload {files.length} {files.length===1?'file':'files'}</Button>}
    </div>}
    {error&&<p className="error-box" role="alert">{error} Files already uploaded are kept.</p>}
    {change.error&&<p className="error-box" role="alert">{change.error.message}</p>}
    <ul className={m.fileList}>{active.map(file=><li key={file.id}><span className={m.fileIcon}>{file.kind==='pdf'?<FileText size={18}/>:<Film size={18}/>}</span><div><strong>{file.name}</strong><small>{file.kind==='pdf'?'PDF document':'Video lesson'} · {fileSize(file.size)}</small></div><Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`Remove ${file.name}`} onClick={()=>change.mutate({id:file.id,action:'remove'})}><Trash2 size={15}/></Button></li>)}</ul>
    {removed.length>0&&<details className={m.removed}><summary>{removed.length} removed {removed.length===1?'file':'files'}</summary>{removed.map(file=><div key={file.id}><span>{file.name}</span><Button type="button" variant="ghost" size="sm" disabled={locked} onClick={()=>change.mutate({id:file.id,action:'restore'})}><Undo2 size={14}/>Restore</Button></div>)}</details>}
    <p className={m.note}>Only upload material you have permission to share. Removing a file here is recoverable until the course is published.</p>
    {preview&&!unpersisted&&<ChapterMaterials ctx={ctx} course={course} chapter={chapter} subsectionId={subsectionId} preview/>}
  </section>;
});

export function ChapterMaterials({ctx,course,chapter,preview=false,subsectionId}:{ctx:LearningContext;course:Course;chapter:Chapter;preview?:boolean;subsectionId?:string}){
  const files=(chapter.materials||[]).filter(file=>!file.removed_at&&(file.subsection_id||'')===(subsectionId||''));
  const [selected,setSelected]=useState('');
  const [failed,setFailed]=useState('');
  const access=useQuery({
    queryKey:['hosted-learning',ctx.scope,'materials',course.id,chapter.id,preview,subsectionId||'',files.map(file=>file.id).join(',')],
    queryFn:()=>learningRequest<MaterialAccess[]>(ctx.demo,`${preview?'/studio':''}/courses/${course.id}/chapters/${chapter.id}/materials`),
    enabled:files.length>0&&(!ctx.demo||Boolean(course.sample&&course.id.startsWith('demo-'))),staleTime:5*60*1000,refetchOnWindowFocus:false,retry:false,
  });
  const available=access.data?.filter(file=>files.some(item=>item.id===file.id));
  const file=available?.find(file=>file.id===selected)||available?.[0];
  if(!files.length)return null;
  if(ctx.demo&&(!course.sample||!course.id.startsWith('demo-')))return <p className={m.note}>Sign in to your personal workspace to open private PDF and video lessons.</p>;
  if(access.isPending)return <p className={m.loading}><Loader2 size={16} className="spin"/>Opening your learning files…</p>;
  if(access.error)return <div className="error-box" role="alert"><span>{access.error.message}</span><Button type="button" size="sm" variant="secondary" onClick={()=>void access.refetch()}>Try again</Button></div>;
  if(!file)return null;
  const src=materialUrl(file.url);
  return <section className={m.materials} aria-label="Learning materials">
    {files.length>1&&<nav className={m.fileTabs} aria-label="Learning files">{files.map(item=><button key={item.id} type="button" aria-pressed={item.id===file.id} onClick={()=>{setSelected(item.id);setFailed('');}}>{item.kind==='pdf'?<FileText size={15}/>:<Film size={15}/>}<span>{item.name}</span></button>)}</nav>}
    <div className={m.viewer}>
      <header className={m.viewerHeader}><span className={m.fileIcon}>{file.kind==='pdf'?<FileText size={18}/>:<Film size={18}/>}</span><div><strong>{file.name}</strong><small>{file.kind==='pdf'?'PDF document':'Video lesson'} · {fileSize(file.size)}</small></div><div className={m.viewerActions}><button type="button" aria-label="Reload learning file" onClick={()=>{setFailed('');void access.refetch();}}><RotateCcw size={14}/></button><a href={src} target="_blank" rel="noreferrer" aria-label={`Open ${file.name} in a new tab`}><ArrowUpRight size={16}/></a><a href={file.download_url?materialUrl(file.download_url):src+'&download=true'} aria-label={`Download ${file.name}`}><Download size={15}/></a></div></header>
      {failed?<div className={m.viewerError} role="alert"><p>{failed}</p><p>Try reloading the file, or open it in a new tab using the button above.</p></div>:file.kind==='pdf'?<PdfReader key={src} src={src} name={file.name}/>:<LessonVideo key={file.id+src} ctx={ctx} course={course} chapter={chapter} src={src} materialId={file.id} preview={preview} onError={()=>setFailed('The video could not be played. Use a browser-compatible MP4 (H.264/AAC) or WEBM file.')}/>}
    </div>
    {!preview&&<p className={m.note}>Reading or watching is for learning. Pass the chapter quiz to record completion.</p>}
  </section>;
}

export function LessonVideo({ctx,course,chapter,src,materialId='',preview=false,onError,subsectionId}:{ctx:LearningContext;course:Course;chapter:Chapter;src:string;materialId?:string;preview?:boolean;onError?:()=>void;subsectionId?:string}){
  const lastSaved=useRef(0);
  const [status,setStatus]=useState('Playback position saves as you learn.');
  const resumeKey=materialId?`${chapter.id}:${materialId}`:subsectionId?`${chapter.id}:subsection:${subsectionId}`:chapter.id;
  async function save(seconds:number,refresh=false){
    if(preview||!course.enrollment)return;
    lastSaved.current=Date.now();
    try{await learningRequest(ctx.demo,`/courses/${course.id}/chapters/${chapter.id}/resume`,'POST',{seconds,material_id:materialId,...(subsectionId?{subsection_id:subsectionId}:{})});setStatus('Playback position saved.');if(refresh)await ctx.refresh();}
    catch{setStatus('Playback could not be saved. Check your connection.');}
  }
  return <div className={m.video}><video controls preload="metadata" playsInline aria-label={`${chapter.title} video`} src={src} onError={onError} onLoadedMetadata={event=>{const seconds=course.enrollment?.resume?.[resumeKey]||0;if(seconds&&seconds<event.currentTarget.duration)event.currentTarget.currentTime=seconds;}} onTimeUpdate={event=>{if(Date.now()-lastSaved.current>15000)void save(event.currentTarget.currentTime);}} onPause={event=>{void save(event.currentTarget.currentTime,true);}}/><p role="status">{preview?'Author preview · Playback is not recorded.':status}</p></div>;
}

