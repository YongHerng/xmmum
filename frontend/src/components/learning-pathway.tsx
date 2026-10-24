'use client';

import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useRouter,useSearchParams} from 'next/navigation';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ArrowLeft,ArrowRight,Award,BookOpen,Check,CheckCircle2,ChevronDown,ChevronRight,Clock3,FileQuestion,GraduationCap,Loader2,LockKeyhole,Sparkles} from 'lucide-react';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {learningRequest,questionTypes,answered,dateLabel,type Course,type Chapter,type Question,type Answer,type Attempt} from '@/lib/learning';
import {LearningStudio} from './learning-studio';
import {ProviderLogo} from './provider-logo';
import s from './learning.module.css';
import c from './classroom.module.css';
import {ChapterMaterials,LessonVideo} from './learning-materials';
import {outlineScrollTop} from '@/lib/learning-outline';
import {activeSubsections,learningSections} from '@/lib/learning';

// Retain the authoring implementation for the future admin workspace.
const partnerStudioEnabled=process.env.NEXT_PUBLIC_PARTNER_STUDIO_ENABLED==='true';

export function LearningTitle({eyebrow,title,description,children}:{eyebrow?:string;title:string;description?:string;children?:React.ReactNode}){
  return <div className="page-title"><div>{eyebrow&&<div className="section-label">{eyebrow}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{children}</div>;
}
export function LearningError({error}:{error:Error|null}){return error?<p className="error-box" role="alert">{error.message} <Link href="/app/pathway?demo=student" className="text-link">Explore offline demo courses</Link></p>:null;}
export function LearningProgress({value,label}:{value:number;label:string}){return <div className={s.progress}><div><span>{label}</span><strong>{value}%</strong></div><div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><span style={{width:`${value}%`}}/></div></div>;}
export type LearningContext={demo:string|null;scope:string;go:(view:string,extra?:Record<string,string>)=>void;url:(view:string,extra?:Record<string,string>)=>string;refresh:()=>Promise<unknown>;courses:Course[]};

export function LearningPathway(){
  const {data,demo,identity,link}=useWorkspace();const params=useSearchParams();const router=useRouter();const client=useQueryClient();
  const scope=identity||demo||'signed-in';const requested=params.get('view');const view=!requested||requested==='plan'||requested==='studio'&&!partnerStudioEnabled?'home':requested;const courseId=params.get('course');
  const courses=useQuery({queryKey:['hosted-learning',scope,'courses'],queryFn:()=>learningRequest<Course[]>(demo,'/courses')});
  const url=(next:string,extra?:Record<string,string>)=>next==='profile'?link('/app/profile'):link('/app/pathway',{view:next,...extra});
  const profileUrl=link('/app/profile');
  useEffect(()=>{if(view==='profile')router.replace(profileUrl);},[view,profileUrl,router]);
  const go=(next:string,extra?:Record<string,string>)=>router.push(url(next,extra));
  const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['hosted-learning',scope]}),...(!demo?[client.invalidateQueries({queryKey:['workspace',identity]})]:[])]);};
  const ctx:LearningContext={demo,scope,go,url,refresh,courses:courses.data||[]};
  const classroom=view==='learn'&&Boolean(courseId);
  const navigation=[['home','Learning home'],['catalogue','Course catalogue'],['learning','My learning'],...(partnerStudioEnabled?[['studio','Partner studio']]:[])];
  const selected=['course','learn'].includes(view)?'catalogue':view;
  return <div className={`${s.root} page-enter`}>
    {!classroom&&<nav className={s.navigation} aria-label="Learning navigation">{navigation.map(([key,label])=><Link key={key} href={url(key)} aria-current={selected===key?'page':undefined}>{label}</Link>)}</nav>}
    {demo&&!classroom&&<div className={s.practiceNotice}><Sparkles size={16}/><p><strong>Your learning practice space.</strong> Courses, PDFs and example badges are bundled locally. Quiz practice stays in browser memory; the example career scores remain fixed. No personal account or external API is used.</p></div>}
    <LearningError error={courses.error}/>
    {view==='profile'?<p>Opening <Link className="text-link" href={profileUrl}>My profile</Link>…</p>:courses.isPending?<div className="center-state"><Loader2 className="spin"/><p>Getting your learning space ready…</p></div>:view==='studio'?<LearningStudio ctx={ctx} courseId={courseId}/>:courseId&&['course','learn'].includes(view)?<CourseScreen key={`${scope}:${courseId}`} ctx={ctx} courseId={courseId} view={view} params={params}/>:view==='home'?<LearningHome ctx={ctx}/>:<CourseCatalogue ctx={ctx} mine={view==='learning'}/>}
  </div>;
}

export function LearningHome({ctx}:{ctx:LearningContext}){
  const enrolled=ctx.courses.filter(c=>c.enrollment);const completed=enrolled.filter(c=>c.complete);const current=enrolled.find(c=>!c.complete);
  const published=ctx.courses.filter(c=>c.published);
  return <>
    <section className={`card ${s.homeHero}`}>
      <div><span className="section-label">YOUR LEARNING PATHWAY</span><h1>Your next chapter starts here.</h1><p>Learn in one place. Practice at your pace. Keep a record of every milestone you earn.</p><div className={s.actions}><Button asChild><Link href={ctx.url('catalogue')}>Explore courses <ArrowRight size={16}/></Link></Button><Link className="text-link" href={ctx.url('learning')}>My learning <ArrowRight size={15}/></Link></div></div>
      <div className={s.homeSteps}><span className="icon-tile teal"><GraduationCap size={27}/></span><h2>A clear path to your course badge.</h2><ol><li><span>01</span>Choose a hosted course</li><li><span>02</span>Learn and pass chapter quizzes</li><li><span>03</span>Pass the final. Earn your badge.</li></ol></div>
    </section>
    <div className={s.homeStats} aria-label="Your learning at a glance">{[[BookOpen,enrolled.length,'Courses enrolled'],[CheckCircle2,completed.length,'Courses completed'],[Award,completed.length,'Badges earned']].map(([Icon,value,label])=>{const MetricIcon=Icon as typeof BookOpen;return <div className="card" key={String(label)}><span className="icon-tile"><MetricIcon size={20}/></span><div><strong>{String(value)}</strong><span>{String(label)}</span></div></div>;})}</div>
    {current?<section className={`card ${s.resumeCard}`}><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>{current.title}</h2><p>{current.provider} · {current.milestones.length}/{current.chapter_count} chapters passed</p></div><div><LearningProgress label="Course progress" value={current.percent}/><Button asChild variant="secondary"><Link href={ctx.url('course',{course:current.id})}>Continue learning <ArrowRight size={16}/></Link></Button></div></section>:completed.length>0?<section className={`card ${s.resumeCard}`}><div><span className="eyebrow">LOOK HOW FAR YOU’VE COME</span><h2>Your achievements have a home.</h2><p>Your earned course badges are part of your FutureProof profile.</p></div><Button asChild variant="secondary"><Link href={ctx.url('profile')}>View my profile <Award size={16}/></Link></Button></section>:null}
    <div className={s.sectionHead}><div><span className="eyebrow">LEARN HERE. TRACK IT HERE.</span><h2>{current?'Make room for another skill.':enrolled.length?'Explore your next course.':'Find your first course.'}</h2><p>Hosted lessons, chapter checkpoints and a final test. No manual progress forms.</p></div><Link className="text-link" href={ctx.url('catalogue')}>All courses <ArrowRight size={15}/></Link></div>
    <CourseGrid ctx={ctx} courses={published.filter(c=>!c.enrollment).length?published.filter(c=>!c.enrollment):published} compact/>
    <p className={`fine-print ${s.spaced}`}>Study-demo content is independently authored. Provider names and logos identify technology references, not an endorsed partnership. Platform badges are not official industry certifications.</p>
  </>;
}

function CourseCatalogue({ctx,mine}:{ctx:LearningContext;mine:boolean}){
  const [search,setSearch]=useState('');const [category,setCategory]=useState('All');const [status,setStatus]=useState('all');
  const available=ctx.courses.filter(c=>c.published&&(!mine||c.enrollment));
  const courses=available.filter(c=>(category==='All'||c.category===category)&&`${c.title} ${c.provider} ${c.description}`.toLowerCase().includes(search.toLowerCase())&&(status==='all'||(status==='complete'?c.complete:!c.complete)));
  return <><LearningTitle eyebrow={mine?'ONE STEP AT A TIME':'YOUR NEXT SKILL STARTS HERE'} title={mine?'Your learning, in motion.':'A little learning. New possibilities.'} description={mine?'Pick up where you left off. Your quiz milestones are saved automatically.':'Explore partner-hosted learning, practice what matters, and earn a course badge.'}/><div className={`card ${s.filters}`}><label>Find a course<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search courses, topics or providers"/></label><label>Category<select value={category} onChange={e=>setCategory(e.target.value)}>{['All',...new Set(available.map(c=>c.category))].map(c=><option key={c}>{c}</option>)}</select></label>{mine&&<label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All learning</option><option value="in-progress">In progress</option><option value="complete">Completed</option></select></label>}</div><CourseGrid ctx={ctx} courses={courses}/></>;
}

function CourseGrid({ctx,courses,compact=false}:{ctx:LearningContext;courses:Course[];compact?:boolean}){
  const visible=compact?courses.slice(0,3):courses;
  return visible.length?<div className={s.courseGrid}>{visible.map(c=><article className={`card ${s.courseCard}`} key={c.id}><div className={s.courseArt}><ProviderLogo name={c.provider} src={c.provider_logo} size="lg"/><span className="eyebrow">{c.category}</span></div><div className={s.courseCardHeading}><span className="eyebrow">{c.provider}</span>{c.complete&&<span className="tag tag-green"><Check size={12}/>Completed</span>}</div><h3><Link href={ctx.url('course',{course:c.id})}>{c.title}</Link></h3><p>{c.description}</p><div className={s.meta}><span><Clock3 size={13}/>{c.minutes} min</span><span><BookOpen size={13}/>{c.chapter_count} chapters</span><span>{c.sample?'Free study demo':'Hosted course'}</span></div>{c.enrollment&&<LearningProgress label="Course progress" value={c.percent}/>}<Button asChild variant="secondary"><Link href={ctx.url('course',{course:c.id})}>{c.complete?'Review course':c.enrollment?'Continue learning':'View course'}<ArrowRight size={16}/></Link></Button></article>)}</div>:<section className={`card ${s.empty}`}><GraduationCap size={34}/><h2>No courses here yet.</h2><p>Try another filter or explore the course catalogue.</p><Button onClick={()=>ctx.go('catalogue')}>Explore courses</Button></section>;
}

function CourseScreen({ctx,courseId,view,params}:{ctx:LearningContext;courseId:string;view:string;params:ReturnType<typeof useSearchParams>}){
  const query=useQuery({queryKey:['hosted-learning',ctx.scope,'course',courseId],queryFn:()=>learningRequest<Course>(ctx.demo,`/courses/${courseId}`)});
  const enroll=useMutation({mutationFn:()=>learningRequest<Course>(ctx.demo,`/courses/${courseId}/enroll`,'POST'),onSuccess:async(course)=>{await ctx.refresh();ctx.go('learn',{course:courseId,chapter:course.chapters[0].id,section:'overview'});}});
  if(query.isPending)return <div className="center-state"><Loader2 className="spin"/>Opening your course…</div>;
  if(query.error)return <><LearningError error={query.error}/><Link className="text-link" href={ctx.url('catalogue')}><ArrowLeft size={15}/>Back to course catalogue</Link></>;
  const course=query.data!;const enter=()=>course.enrollment?ctx.go('learn',{course:courseId,chapter:course.chapters.find(ch=>!course.enrollment!.chapter_passes[ch.id])?.id||course.chapters[0].id,section:'overview'}):enroll.mutate();
  return <><LearningError error={enroll.error}/>{view==='learn'&&course.enrollment?<Classroom ctx={ctx} course={course} params={params}/>:<><Link className="text-link" href={ctx.url('catalogue')}><ArrowLeft size={15}/>Course catalogue</Link><div className={s.courseTitle}><div><span className="eyebrow">{course.provider} · {course.category}</span><h1>{course.title}</h1></div><ProviderLogo name={course.provider} src={course.provider_logo} size="lg"/></div><div className={s.overviewLayout}><div><section className="card"><h2>About this course</h2><div className={s.aboutCopy}>{course.description.split(/\n{2,}/).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div><div className={s.meta}><span><Clock3 size={15}/>{course.minutes} minutes</span><span>{course.chapter_count} chapters + final test</span><span>Unlimited attempts</span></div><p className="fine-print">{course.disclaimer||(course.sample?'Independent study demo. Original content, with no endorsed training partnership or official certification claimed.':'Content supplied by this course’s author. Rights and provider verification are required before production use. Badges are platform completion records.')}</p>{course.sources?.length? <details className={s.courseReferences}><summary>Course references and official learning</summary><ul>{course.sources.map(source=><li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowRight size={13}/></a></li>)}</ul></details>:null}</section><Milestones course={course}/><section className="card"><h2>Course content</h2><div className={s.curriculum}>{course.chapters.map((ch,index)=><div key={ch.id}><span>{course.enrollment?.chapter_passes[ch.id]?<Check size={16}/>:String(index+1).padStart(2,'0')}</span><div><h3>{ch.title}</h3><p>{ch.minutes} min · {ch.question_count} quiz questions</p></div>{course.enrollment&&<Button size="sm" variant="ghost" onClick={()=>ctx.go('learn',{course:course.id,chapter:ch.id,section:'overview'})}>Study <ArrowRight size={14}/></Button>}</div>)}<div><span>{course.final_unlocked?<Award size={17}/>:<LockKeyhole size={17}/>}</span><div><h3>Final course test</h3><p>{course.final_question_count} questions · {course.final_pass_percent}% to pass</p></div></div></div></section></div><aside className={`card ${s.summary}`}><span className="icon-tile"><GraduationCap size={24}/></span><h2>{course.complete?'A milestone worth keeping.':'Make a little progress today.'}</h2><p>{course.complete?'Your course badge is saved in your profile.':'Learn at your own pace. Quiz passes record your progress automatically.'}</p><Button disabled={enroll.isPending||!course.published} onClick={enter}>{enroll.isPending?<Loader2 className="spin" size={16}/>:null}{course.enrollment?'Continue learning':'Start this course'}<ArrowRight size={16}/></Button>{course.enrollment&&<LearningProgress label="Course progress" value={course.percent}/>}<ul><li><Award size={15}/>Badge after the final test</li></ul>{course.complete&&<Button variant="secondary" onClick={()=>ctx.go('profile')}>View my badge <Award size={16}/></Button>}</aside></div></>}</>;
}

function Milestones({course}:{course:Course}){
  return <section className="card"><div className={s.sectionHead}><div><h2>One step at a time</h2><p>Your learning milestones, in completion order.</p></div><span className="tag">{course.milestones.length+Number(course.complete)}/{course.chapter_count+1} COMPLETE</span></div><ol className={s.timeline}>{course.milestones.map(event=><li key={event.chapter_id} data-chapter={event.chapter_id}><span className={s.passedMarker}><Check size={17}/></span><div><span className="eyebrow">CHAPTER {event.number} · {course.provider}</span><h3>{event.title}</h3><time dateTime={event.completed_at}>Passed · {dateLabel(event.completed_at)}</time></div></li>)}{course.complete?<li><span className={s.passedMarker}><Award size={18}/></span><div><span className="eyebrow">FINAL MILESTONE</span><h3>Final test passed. Badge earned.</h3><time dateTime={course.enrollment!.completion!.completed_at}>{dateLabel(course.enrollment!.completion!.completed_at)}</time></div></li>:<li><span className={s.pendingMarker}>…</span><div><span className="eyebrow">{course.enrollment?'ONGOING':'NOT STARTED'}</span><h3>{course.enrollment?'Keep learning at your own pace.':'Your story starts here.'}</h3><p>{course.final_unlocked?'Every chapter is passed. Your final test is ready.':'Only completed chapters appear here. Your next pass becomes your next milestone.'}</p></div></li>}</ol></section>;
}

function Classroom({ctx,course,params}:{ctx:LearningContext;course:Course;params:ReturnType<typeof useSearchParams>}){
  const chapterId=params.get('chapter')||course.chapters[0].id;
  const chapter=course.chapters.find(ch=>ch.id===chapterId)||course.chapters[0];
  const number=course.chapters.findIndex(ch=>ch.id===chapter.id)+1;
  const sections=learningSections(chapter,number);
  const requested=params.get('section');
  const section=requested&&(['final','guide'].includes(requested)||sections.some(([key])=>key===requested))?requested:sections[0][0];
  const subsection=activeSubsections(chapter).find(item=>`subsection:${item.id}`===section);
  const final=section==='final';
  const taking=params.get('mode')==='attempt';
  const attemptId=params.get('attempt');
  const [outlineOpen,setOutlineOpen]=useState(false);
  const [collapsedChapter,setCollapsedChapter]=useState<string|null>(null);
  const chapterList=useRef<HTMLElement>(null);
  const passes=course.enrollment!.chapter_passes;
  const passedCount=course.chapters.filter(ch=>Boolean(passes[ch.id])).length;
  const sectionIndex=sections.findIndex(([key])=>key===section);
  const isLesson=!final&&section!=='guide';
  const open=(id:string,next?:string)=>{
    setOutlineOpen(false);
    setCollapsedChapter(null);
    const target=course.chapters.find(ch=>ch.id===id)!;
    ctx.go('learn',{course:course.id,chapter:id,section:next||learningSections(target,course.chapters.indexOf(target)+1)[0][0]});
  };

  // Size against the actual available window, rather than assuming a fullscreen browser.
  useEffect(()=>{
    const outline=chapterList.current?.closest('aside');
    if(!outline)return;
    const resize=()=>{
      const top=Math.max(16,outline.getBoundingClientRect().top);
      outline.style.setProperty('--outline-height',`${Math.max(0,window.innerHeight-top-16)}px`);
    };
    resize();
    window.addEventListener('resize',resize);
    return ()=>window.removeEventListener('resize',resize);
  },[]);

  // Move only enough to reveal the selection; never center a step and hide its chapter title.
  useEffect(()=>{
    const list=chapterList.current;
    if(!list)return;
    const reveal=()=>{
      const selected=list.querySelector<HTMLElement>('[data-passed][aria-current="page"]');
      const group=selected?.closest('li');
      if(!selected||!group||!list.clientHeight)return;
      const top=list.getBoundingClientRect().top;
      const groupBounds=group.getBoundingClientRect();
      const step=list.querySelector<HTMLElement>('[aria-current="step"]')?.getBoundingClientRect();
      list.scrollTop=outlineScrollTop({scrollTop:list.scrollTop,viewportHeight:list.clientHeight,groupTop:groupBounds.top-top+list.scrollTop,groupHeight:groupBounds.height,headingHeight:selected.getBoundingClientRect().height,stepTop:step?step.top-top+list.scrollTop:undefined,stepHeight:step?.height});
    };
    reveal();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(reveal):null;
    observer?.observe(list);
    return ()=>observer?.disconnect();
  },[chapter.id,section,outlineOpen,collapsedChapter]);

  return <>
    <div className={c.courseHeading}>
      <div><Link className="text-link" href={ctx.url('course',{course:course.id})}><ArrowLeft size={14}/>Course overview</Link><h1>{course.title}</h1></div>
      <div className={c.provider}><ProviderLogo name={course.provider} src={course.provider_logo}/><div>{course.provider}<small>Self-paced learning{course.sample?' · Independent demo':''}</small></div></div>
    </div>
    <div className={c.layout}>
      <aside className={c.outline} aria-label="Course outline" data-expanded={outlineOpen}>
        <header className={c.outlineHeader}>
          <div className={c.outlineTitle}><span className={c.outlineIcon}><BookOpen size={19}/></span><div><h2>Course outline</h2><p>{passedCount} of {course.chapter_count} chapters passed</p></div><button className={c.outlineToggle} onClick={()=>setOutlineOpen(value=>!value)} aria-label={outlineOpen?'Hide course outline':'Show course outline'} aria-expanded={outlineOpen} aria-controls="classroom-chapters"><ChevronDown size={18}/></button></div>
          <LearningProgress label="Course progress" value={course.percent}/>
        </header>
        <button className={c.guideLink} aria-current={section==='guide'?'page':undefined} onClick={()=>open(chapter.id,'guide')}><BookOpen size={16}/><span>Learning guide</span><ChevronRight size={14}/></button>
        <nav id="classroom-chapters" className={c.chapterList} aria-label="Chapters" ref={chapterList} tabIndex={0}>
          <ol>{course.chapters.map((ch,index)=>{
            const passed=Boolean(passes[ch.id]);
            const active=isLesson&&chapter.id===ch.id;
            const expanded=active&&collapsedChapter!==ch.id;
            return <li key={ch.id} data-active={active}><button className={c.chapterButton} aria-current={active?'page':undefined} aria-expanded={expanded} aria-controls={expanded?`chapter-sections-${ch.id}`:undefined} data-passed={passed} onClick={()=>active?setCollapsedChapter(value=>value===ch.id?null:ch.id):open(ch.id)}>
              <span className={c.chapterNumber} aria-hidden="true">{passed?<Check size={15}/>:String(index+1).padStart(2,'0')}</span>
              <span className={c.chapterText}><span>{ch.title}</span><small><span>{ch.minutes} min</span><span aria-hidden="true">·</span><span className={passed?c.passedText:undefined}>{passed?'Quiz passed':`${ch.question_count} questions`}</span></small></span>
              {expanded?<ChevronDown className={c.chapterArrow} size={14} aria-hidden="true"/>:<ChevronRight className={c.chapterArrow} size={14} aria-hidden="true"/>}
            </button>{expanded&&<nav id={`chapter-sections-${ch.id}`} className={c.chapterSections} aria-label={`Chapter ${index+1} sections`}>
              {learningSections(ch,index+1).map(([key,label,step])=><button key={key} aria-current={section===key?'step':undefined} onClick={()=>open(ch.id,key)}><span className={c.stepNumber} aria-hidden="true">{key==='quiz'?<FileQuestion size={13}/>:step}</span><span>{label}</span>{key==='quiz'&&passed&&<CheckCircle2 size={13} aria-hidden="true"/>}</button>)}
            </nav>}</li>;
          })}</ol>
        </nav>
        <footer className={c.outlineFooter}>
          <span className={c.finalEyebrow}>YOUR FINAL MILESTONE</span>
          <button className={c.finalButton} aria-current={final?'page':undefined} onClick={()=>open(chapter.id,'final')}>
            <span className={c.finalIcon}>{course.final_unlocked?<Award size={19}/>:<LockKeyhole size={18}/>}</span>
            <span><strong>Final test</strong><small>{course.complete?'Course badge earned':course.final_unlocked?'All chapters passed. You’re ready.':'Pass every chapter quiz to unlock'}</small></span>
            <span className={course.final_unlocked?c.readyTag:c.lockedTag}>{course.complete?'Passed':course.final_unlocked?'Ready':'Locked'}</span>
          </button>
        </footer>
      </aside>
      <section className={c.reader} aria-labelledby="classroom-reader-title">
        <header className={c.readerHeader}>
          <div className={c.readerKicker}><span>{final?'YOUR FINAL MILESTONE':section==='guide'?'BEFORE YOU BEGIN':`CHAPTER ${String(number).padStart(2,'0')} OF ${course.chapter_count}`}</span>{isLesson&&<><span className={c.duration}><Clock3 size={13}/>{chapter.minutes} min</span><span className={c.sectionBadge}>{sections[sectionIndex]?.[1]}</span></>}</div>
          <div className={c.readerTitle}><h2 id="classroom-reader-title">{final?'Final test':section==='guide'?'Learning guide':chapter.title}</h2>{isLesson&&passes[chapter.id]&&<span className={c.savedPass}><CheckCircle2 size={14}/>Quiz passed</span>}</div>
        </header>
        <div className={final||section==='quiz'?c.assessmentBody:c.lessonBody}>
          {final||section==='quiz'?<Assessment key={`${course.id}:${final?'final':chapter.id}:${taking}:${attemptId}`} ctx={ctx} course={course} chapter={chapter} final={final} taking={taking} attemptId={attemptId}/>:section==='guide'?<>
            <div className={c.prose}><h3>A little focus. A step forward.</h3><p>Choose any chapter from the outline. Study its PDF, video or text material, review the recap, then pass its quiz to record your milestone. Every chapter is available from the start.</p><p>The final test unlocks after all chapter quizzes are passed. Only a final-test pass finishes the course and awards the badge. Attempts are unlimited and later failed attempts never erase earned progress.</p><Button onClick={()=>open(chapter.id)}>Start learning <ArrowRight size={16}/></Button></div>
          </>:<>
            <div className={c.prose}>
              <h3 className={c.sectionTitle}>{subsection?`${sections[sectionIndex][2]} ${subsection.title}`:section==='content'?'Learning material':section==='summary'?'Chapter recap':'Overview'}</h3>
            </div>
            {section==='content'&&<ChapterMaterials key={chapter.id} ctx={ctx} course={course} chapter={chapter}/>}
            {section==='content'&&chapter.video_url&&<LessonVideo key={chapter.id} ctx={ctx} course={course} chapter={chapter} src={chapter.video_url}/>}
            {subsection&&<ChapterMaterials key={subsection.id} ctx={ctx} course={course} chapter={chapter} subsectionId={subsection.id}/>}
            {subsection?.video_url&&<LessonVideo key={subsection.id} ctx={ctx} course={course} chapter={chapter} src={subsection.video_url} subsectionId={subsection.id}/>}
            <div className={c.prose}>
              {(subsection?subsection.body.split('\n\n'):section==='overview'?chapter.body.split('\n\n').slice(0,2):section==='summary'?[chapter.body.split('\n\n').at(-1)||chapter.body]:chapter.body.split('\n\n')).filter(text=>text.trim()).map((text,index)=><p key={index}>{text}</p>)}
              {!chapter.body.trim()&&section==='overview'&&<p>This chapter uses PDF or video learning material. Open Learn to study the files, then use the quiz to check your understanding.</p>}
              {!chapter.body.trim()&&section==='summary'&&<p>Review the PDF or video material in Learn, then take the chapter quiz when you’re ready.</p>}
              {section==='summary'&&<div className={c.checkpointNote}><FileQuestion size={18} aria-hidden="true"/><div><strong>Ready for your checkpoint?</strong><p>Score {course.pass_percent}% to pass this chapter. You can review and retry at any time.</p></div></div>}
            </div>
            <footer className={c.lessonFooter}>
              {sectionIndex>0?<Button variant="ghost" onClick={()=>open(chapter.id,sections[sectionIndex-1][0])}><ArrowLeft size={15}/>{sections[sectionIndex-1][1]}</Button>:<span>Next: {sections[sectionIndex+1]?.[1]}</span>}
              <Button onClick={()=>open(chapter.id,sections[sectionIndex+1]?.[0]||'quiz')}>{sections[sectionIndex+1]?.[0]==='quiz'?'Take the quiz':'Continue'}<ArrowRight size={16}/></Button>
            </footer>
          </>}
        </div>
      </section>
    </div>
  </>;
}

function Assessment({ctx,course,chapter,final,taking,attemptId}:{ctx:LearningContext;course:Course;chapter:Chapter;final:boolean;taking:boolean;attemptId:string|null}){
  const target=final?'final':chapter.id;const questions=final?course.final_questions:chapter.questions;const threshold=final?course.final_pass_percent:course.pass_percent;const stats=course.enrollment!.assessments[target];const passed=final?course.complete:Boolean(course.enrollment!.chapter_passes[target]);
  const attempt=useQuery({queryKey:['hosted-learning',ctx.scope,'attempt',attemptId],queryFn:()=>learningRequest<Attempt>(ctx.demo,`/attempts/${attemptId}`),enabled:Boolean(attemptId)});
  const base={course:course.id,chapter:chapter.id,section:final?'final':'quiz'};
  const [answers,setAnswers]=useState<Record<string,Answer>>({});
  const submit=useMutation({mutationFn:()=>learningRequest<Attempt>(ctx.demo,`/courses/${course.id}/assessments/${target}/submit`,'POST',{answers}),onSuccess:async(result)=>{await ctx.refresh();ctx.go('learn',{...base,attempt:result.id});}});
  if(final&&!course.final_unlocked)return <div className={s.locked}><span className="icon-tile"><LockKeyhole size={26}/></span><h3>Your final milestone is waiting.</h3><p>Pass all chapter quizzes first. You can study them in any order.</p><LearningProgress label="Chapters passed" value={Math.round(100*Object.keys(course.enrollment!.chapter_passes).length/course.chapter_count)}/></div>;
  if(attemptId){if(attempt.isPending)return <Loader2 className="spin"/>;if(attempt.error)return <LearningError error={attempt.error}/>;const result=attempt.data!;return <><div className={result.passed?s.resultPass:s.resultRetry}><span className="icon-tile">{result.passed?<CheckCircle2 size={25}/>:<BookOpen size={25}/>}</span><div><span className="eyebrow">{final?'FINAL TEST':'CHAPTER QUIZ'} RESULT</span><h3>{result.passed?final?'Passed. Badge earned!':'Passed. Milestone saved.':'Not passed yet. Keep practicing.'}</h3><p>{result.correct_count}/{result.total_count} correct · {dateLabel(result.created_at)}</p></div><strong>{result.score}%</strong></div><div className={s.actions}><Button onClick={()=>ctx.go('learn',{...base,mode:'attempt'})}>Test again</Button><Button variant="secondary" onClick={()=>ctx.go(final&&result.passed?'profile':'course',final&&result.passed?{}:{course:course.id})}>{final&&result.passed?'View my badge':'View course timeline'}</Button></div><h3>Answer details</h3>{result.details.map(detail=><article className={s.answerReview} key={detail.id}><span className={`tag ${detail.correct?'tag-green':''}`}>{detail.correct?'Correct':'Review this answer'} · {questionTypes[detail.question_type]}</span><h4>{detail.prompt}</h4><p>Your answer: {detail.selected}</p><p><strong>Correct answer:</strong> {detail.expected}</p><p>{detail.explanation}</p></article>)}</>;}
  if(taking){const count=questions.filter(q=>answered(q,answers[q.id])).length;return <form onSubmit={event=>{event.preventDefault();if(count===questions.length)submit.mutate();}}><Link className="text-link" href={ctx.url('learn',base)}><ArrowLeft size={14}/>Assessment overview</Link><div className={s.assessmentIntro}><h3>{final?'Bring it all together.':'Put your knowledge to work.'}</h3><p>{questions.length} questions · {threshold}% to pass · Untimed · Unlimited attempts</p></div><div className={s.answerProgress}><span role="status" aria-live="polite">{count} of {questions.length} answered</span><div className="progress-track" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={count}><span style={{width:`${questions.length?100*count/questions.length:0}%`}}/></div></div>{questions.map((question,index)=><QuestionInput key={question.id} question={question} number={index+1} value={answers[question.id]} onChange={value=>setAnswers(previous=>({...previous,[question.id]:value}))}/>)}<LearningError error={submit.error}/><div className={s.assessmentSubmit}><span className="fine-print">{ctx.demo?'Demo answers are checked locally; no real badge is awarded.':'Answers are graded securely when you submit.'}</span><Button type="submit" disabled={submit.isPending||count!==questions.length}>{submit.isPending&&<Loader2 size={16} className="spin"/>}Submit {final?'final test':'quiz'}<ArrowRight size={16}/></Button></div></form>;}
  return <><div className={s.assessmentHero}><div><span className="eyebrow">{final?'THE FINAL MILESTONE':'PRACTICE. REFLECT. GROW.'}</span><h3>{passed?'A milestone worth keeping.':final?'Your next milestone is one test away.':'See what’s clicking.'}</h3><p>{final?'Bring your learning together. Pass the final test to complete the course and receive your digital badge.':'Check your understanding, learn from the explanations, and try again whenever you need.'}</p><div className={s.actions}><Button onClick={()=>ctx.go('learn',{...base,mode:'attempt'})}>{stats?'Test again':final?'Start final test':'Start quiz'}<ArrowRight size={16}/></Button>{stats&&<Link className="text-link" href={ctx.url('learn',{...base,attempt:stats.latest_id})}>Latest answer details</Link>}</div></div><div className={s.bestScore}><Award size={25}/><strong>{stats?`${stats.best_score}%`:'—'}</strong><span>My highest score</span>{passed&&<span className="tag tag-green"><Check size={13}/>Passed</span>}</div></div><div className={s.assessmentFacts}><div><span>Passing target</span><strong>{Math.ceil(questions.length*threshold/100)} / {questions.length}</strong><small>{threshold}% required</small></div><div><span>Your attempts</span><strong>{stats?.count||0}</strong><small>Unlimited retries</small></div><div><span>Your milestone</span><strong>{final?'Course badge':'Chapter pass'}</strong><small>{final?'Saved in your profile':'Recorded on your timeline'}</small></div></div></>;
}

export function QuestionInput({question:q,number,value,onChange}:{question:Question;number:number;value:Answer|undefined;onChange:(value:Answer)=>void}){
  return <fieldset className={s.question}><legend><span>{String(number).padStart(2,'0')}</span>{q.prompt}</legend><p className={s.questionHint}><span className="tag">{questionTypes[q.question_type]}</span>{q.question_type==='multiple'?'Select all correct answers. Exact match; no partial credit.':q.question_type==='matching'?'Use each match once. All pairs must be correct.':q.question_type==='fill'?'Capitalization and extra spaces do not matter.':'Choose one answer.'}</p>{q.question_type==='fill'?<label>Your answer<input value={typeof value==='string'?value:''} onChange={event=>onChange(event.target.value)} required maxLength={500} placeholder="Type the missing word or phrase"/></label>:q.question_type==='matching'?<div className={s.matching}>{(q.options as {left:string[]}).left.map((left,index)=><label key={index}><span>{left}</span><select aria-label={left} value={value&&typeof value==='object'&&!Array.isArray(value)?value[index]??'':''} onChange={event=>onChange({...value as Record<string,string>,[index]:event.target.value})} required><option value="">Choose a match…</option>{q.matching_choices?.map(choice=><option value={choice.value} key={choice.value}>{choice.label}</option>)}</select></label>)}</div>:<div className={s.answerOptions}>{(q.options as string[]).map((option,index)=><label className={(q.question_type==='single'?String(value)===String(index):Array.isArray(value)&&value.includes(index))?s.selectedAnswer:''} key={index}><input type={q.question_type==='multiple'?'checkbox':'radio'} name={`question-${q.id}`} required={q.question_type==='single'} checked={q.question_type==='single'?String(value)===String(index):Array.isArray(value)&&value.includes(index)} onChange={()=>onChange(q.question_type==='single'?index:Array.isArray(value)&&value.includes(index)?value.filter(i=>i!==index):[...(Array.isArray(value)?value:[]),index])}/><span className={s.answerLetter}>{String.fromCharCode(65+index)}</span><span>{option}</span></label>)}</div>}<small className={s.questionStatus}>{answered(q,value)?'Answered':'Not answered yet'}</small></fieldset>;
}


