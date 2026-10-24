import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ChapterAttachments,ChapterMaterials,LessonVideo} from '../src/components/learning-materials';
import {LearningStudio} from '../src/components/learning-studio';
import {hasLearningContent,validateLearningFile,type Chapter,type Course,type MaterialAccess} from '../src/lib/learning';
import type {LearningContext} from '../src/components/learning-pathway';
import learningStyles from '../src/components/learning.module.css';

const mock=vi.hoisted(()=>({request:vi.fn(),upload:vi.fn()}));
vi.mock('../src/lib/api',()=>({API:'http://127.0.0.1:8000/api/v1',supabase:{auth:{getSession:async()=>({data:{session:{access_token:'test-user-session'}}})}}}));
vi.mock('../src/lib/learning',async original=>({...await original<typeof import('../src/lib/learning')>(),learningRequest:(...args:unknown[])=>mock.request(...args),uploadLearningFile:(...args:unknown[])=>mock.upload(...args)}));
vi.mock('../src/components/pdf-reader',()=>({PdfReader:({src,name}:{src:string;name:string})=><div title={name+' PDF reader'} data-src={src}/>}));
const pdf={id:'pdf-1',name:'Security guide.pdf',kind:'pdf',mime:'application/pdf',size:5120,url:'/api/v1/learning/media/pdf-1?token=test',expires_at:9999999999} as MaterialAccess;
const video={id:'video-1',name:'Firewall lesson.mp4',kind:'video',mime:'video/mp4',size:25000,url:'/api/v1/learning/media/video-1?token=test',expires_at:9999999999} as MaterialAccess;
const chapter={id:'chapter-1',title:'Security foundations',body:'',skill:'Security',minutes:10,materials:[pdf,video],questions:[],question_count:0} as Chapter;
const course={id:'course-1',title:'Test course',provider:'Original provider',description:'An author-written course introduction.',published:false,chapters:[chapter],final_questions:[],enrollment:{chapter_passes:{},assessments:{},completion:null,resume:{'chapter-1:video-1':23}}} as unknown as Course;
function context(){return {demo:null,scope:'test-media',go:vi.fn(),url:()=>'/app/pathway',refresh:vi.fn().mockResolvedValue(undefined),courses:[]} as LearningContext;}
function mount(node:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{node}</QueryClientProvider>);}
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();sessionStorage.clear();});

describe('PDF and video learning materials',()=>{
  it('allows PDF/video-only chapters and validates upload types and size',()=>{
    expect(hasLearningContent(chapter)).toBe(true);
    expect(hasLearningContent({...chapter,materials:[]})).toBe(false);
    expect(hasLearningContent({...chapter,materials:[{...pdf,removed_at:'today'}]})).toBe(false);
    expect(()=>validateLearningFile({name:'lesson.pdf',size:20*1024*1024} as File)).not.toThrow();
    expect(()=>validateLearningFile({name:'lesson.pdf',size:20*1024*1024+1} as File)).toThrow('20 MB');
    expect(()=>validateLearningFile({name:'lesson.mp4',size:100*1024*1024+1} as File)).toThrow('100 MB');
    expect(()=>validateLearningFile({name:'script.html',size:50} as File)).toThrow('PDF, MP4 or WEBM');
  });
  it('opens PDFs inside the lesson, switches to video, and offers file actions',async()=>{
    mock.request.mockResolvedValue([pdf,video]);mount(<ChapterMaterials ctx={context()} course={course} chapter={chapter}/>);
    expect(await screen.findByTitle('Security guide.pdf PDF reader')).toHaveAttribute('data-src',expect.stringContaining('/learning/media/pdf-1?token=test'));
    expect(screen.getByRole('link',{name:'Download Security guide.pdf'})).toHaveAttribute('href',expect.stringContaining('&download=true'));
    fireEvent.click(screen.getByRole('button',{name:'Firewall lesson.mp4'}));
    expect(screen.getByLabelText('Security foundations video')).toHaveAttribute('controls');
    expect(screen.getByLabelText('Security foundations video')).toHaveAttribute('src',expect.stringContaining('/learning/media/video-1?token=test'));
    expect(mock.request).toHaveBeenCalledWith(null,'/courses/course-1/chapters/chapter-1/materials');
  });
  it('shows only files belonging to the selected subsection',async()=>{
    const scopedPdf={...pdf,subsection_id:'lesson-one'};
    const scopedVideo={...video,subsection_id:'lesson-two'};
    mock.request.mockResolvedValue([scopedPdf,scopedVideo]);
    mount(<ChapterMaterials ctx={context()} course={course} chapter={{...chapter,materials:[scopedPdf,scopedVideo]}} subsectionId="lesson-one"/>);
    expect(await screen.findByTitle('Security guide.pdf PDF reader')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Firewall lesson.mp4'})).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Security foundations video')).not.toBeInTheDocument();
  });
  it('uses private Supabase URLs directly for viewing and named downloads',async()=>{
    const cloudPdf={...pdf,url:'https://project.supabase.co/storage/v1/object/sign/learning-materials/courses/guide.pdf?token=temporary',download_url:'https://project.supabase.co/storage/v1/object/sign/learning-materials/courses/guide.pdf?token=temporary&download=Security+guide.pdf'};
    mock.request.mockResolvedValue([cloudPdf]);mount(<ChapterMaterials ctx={context()} course={course} chapter={{...chapter,materials:[cloudPdf]}}/>);
    expect(await screen.findByTitle('Security guide.pdf PDF reader')).toHaveAttribute('data-src',cloudPdf.url);
    expect(screen.getByRole('link',{name:'Download Security guide.pdf'})).toHaveAttribute('href',cloudPdf.download_url);
    expect(screen.getByRole('link',{name:'Open Security guide.pdf in a new tab'})).toHaveAttribute('href',cloudPdf.url);
  });
  it('keeps failed batch files for retry without reuploading successful files',async()=>{
    const saved=vi.fn().mockResolvedValue(undefined);
    const first=new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'});
    const second=new File(['ftyp'],'lesson.mp4',{type:'video/mp4'});
    mock.upload.mockResolvedValueOnce(pdf).mockRejectedValueOnce(new Error('Connection interrupted.'));
    mount(<ChapterAttachments ctx={context()} course={course} chapter={{...chapter,materials:[]}} saved={saved} onBusyChange={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[first,second]}});
    fireEvent.click(screen.getByRole('button',{name:'Upload 2 files'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted.');
    await waitFor(()=>expect(saved).toHaveBeenCalledWith(expect.stringContaining('1 learning file uploaded')));
    expect(screen.getByRole('button',{name:'Upload 1 file'})).toBeEnabled();
    mock.upload.mockResolvedValueOnce(video);
    fireEvent.click(screen.getByRole('button',{name:'Upload 1 file'}));
    await waitFor(()=>expect(mock.upload).toHaveBeenCalledTimes(3));
    expect(mock.upload.mock.calls.map(call=>call[2].name)).toEqual(['guide.pdf','lesson.mp4','lesson.mp4']);
  });
  it('uses recoverable remove actions for draft attachments',async()=>{
    mock.request.mockResolvedValue(course);
    const saved=vi.fn().mockResolvedValue(undefined);
    mount(<ChapterAttachments ctx={context()} course={course} chapter={chapter} saved={saved} onBusyChange={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Remove Security guide.pdf'}));
    await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/course-1/chapters/chapter-1/materials/pdf-1/remove','POST'));
    expect(await screen.findByText(/Removing a file here is recoverable/)).toBeInTheDocument();
  });
  it('restores per-file video playback and never submits a quiz when paused',async()=>{
    mock.request.mockResolvedValue({saved:true});const ctx=context();
    render(<LessonVideo ctx={ctx} course={course} chapter={chapter} src="https://example.org/lesson.mp4" materialId="video-1"/>);
    const player=screen.getByLabelText('Security foundations video') as HTMLVideoElement;
    Object.defineProperty(player,'duration',{value:100,configurable:true});
    fireEvent.loadedMetadata(player);expect(player.currentTime).toBe(23);
    player.currentTime=31;fireEvent.pause(player);
    await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(null,'/courses/course-1/chapters/chapter-1/resume','POST',{seconds:31,material_id:'video-1'}));
    expect(await screen.findByRole('status')).toHaveTextContent('Playback position saved');
    expect(mock.request.mock.calls.some(call=>String(call[1]).includes('/submit'))).toBe(false);
  });
  it('keeps author previews separate from learner playback records',async()=>{
    render(<LessonVideo ctx={context()} course={course} chapter={chapter} src="https://example.org/lesson.mp4" materialId="video-1" preview/>);
    fireEvent.pause(screen.getByLabelText('Security foundations video'));
    expect(screen.getByRole('status')).toHaveTextContent('Author preview');
    expect(mock.request).not.toHaveBeenCalled();
  });
  it('makes text notes optional in chapter authoring',async()=>{
    mock.request.mockResolvedValue(course);mount(<LearningStudio ctx={context()} courseId={course.id}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Earlier chapter material'}));
    expect(await screen.findByLabelText('Text notes (optional)')).not.toBeRequired();
    expect(await screen.findByLabelText('Upload PDF or video')).toBeInTheDocument();
  });
  it('labels the editable course description as About this course',async()=>{
    mock.request.mockResolvedValue(course);mount(<LearningStudio ctx={context()} courseId={course.id}/>);
    fireEvent.click(await screen.findByText('Course details & partner logo'));
    expect(screen.getByRole('textbox',{name:/^About this course/,hidden:true})).toHaveValue(course.description);
    expect(screen.getByText('Write the introduction learners will see on the course review page.',{selector:'small'})).toBeInTheDocument();
  });
  it('shows edit and confirmed delete actions for courses in Partner Studio',async()=>{
    const published={...course,owned:true,published:true};const ctx={...context(),courses:[published]};
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);mock.request.mockResolvedValue({deleted:true});
    mount(<LearningStudio ctx={ctx} courseId={null}/>);
    expect(screen.getByRole('link',{name:'Edit'})).toHaveAttribute('href','/app/pathway');
    fireEvent.click(screen.getByRole('button',{name:'Delete'}));
    await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/course-1','DELETE'));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Existing completion badges are kept.'));
    expect(await screen.findByRole('status')).toHaveTextContent('Course deleted.');
    confirm.mockRestore();
  });
  it('takes a published course offline before reopening the editor',async()=>{
    let state={...course,owned:true,published:true};
    mock.request.mockImplementation(async(_demo,path,method)=>{
      if(path.endsWith('/unpublish')&&method==='POST')state={...state,published:false};
      return state;
    });
    mount(<LearningStudio ctx={context()} courseId={course.id}/>);
    fireEvent.click(await screen.findByRole('button',{name:'Take offline & edit'}));
    await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/course-1/unpublish','POST'));
    expect(await screen.findByRole('status')).toHaveTextContent('Course moved back to draft. You can edit it now.');
    expect(screen.getByRole('button',{name:'Add chapter 2'})).toBeEnabled();
  });
  it('explains that completion badges are generated automatically',async()=>{
    mock.request.mockResolvedValue(course);mount(<LearningStudio ctx={context()} courseId={course.id}/>);
    fireEvent.click(await screen.findByRole('button',{name:/Publish Check & launch/}));
    expect(screen.getByText('Digital badge is automatic')).toBeInTheDocument();
    expect(screen.getByText(/creates and assigns it after a learner passes every chapter quiz and the final test/)).toBeInTheDocument();
    const notice=screen.getByRole('note',{name:'Automatic digital badge'});
    expect(notice).toHaveClass(learningStyles.badgeAutomation);
    expect(notice).not.toHaveClass(learningStyles.publishItem);
    expect(notice.closest('section')?.querySelectorAll(`.${learningStyles.publishItem}`)).toHaveLength(3);
    expect(notice.querySelector('span')).toHaveTextContent('Digital badge is automatic');
  });
  it('sends raw file bytes, the expected MIME type, and the user session',async()=>{
    const actual=await vi.importActual<typeof import('../src/lib/learning')>('../src/lib/learning');
    const open=vi.fn(),headers=vi.fn(),progress=vi.fn();
    class FakeUpload{
      upload:{onprogress?:((event:unknown)=>void)}={};onload?:()=>void;onloadend?:()=>void;
      status=200;responseText=JSON.stringify({data:pdf});
      open=open;setRequestHeader=headers;timeout=0;
      send(body:File){expect(body.name).toBe('guide.pdf');this.upload.onprogress?.({lengthComputable:true,loaded:body.size,total:body.size});this.onload?.();this.onloadend?.();}
    }
    vi.stubGlobal('XMLHttpRequest',FakeUpload);
    const file=new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'});
    expect(await actual.uploadLearningFile(null,'/studio/courses/course-1/chapters/chapter-1/materials',file,progress)).toEqual(pdf);
    expect(open).toHaveBeenCalledWith('POST',expect.stringContaining('/learning/studio/courses/course-1/chapters/chapter-1/materials?filename=guide.pdf'));
    expect(headers).toHaveBeenCalledWith('Authorization','Bearer test-user-session');
    expect(headers).not.toHaveBeenCalledWith('X-Learning-Session',expect.anything());
    expect(headers).toHaveBeenCalledWith('Content-Type','application/pdf');
    expect(progress).toHaveBeenCalledWith(100);
  });
  it('requires personal sign-in for private file uploads in guest practice',async()=>{
    const ctx={...context(),demo:'student'};
    mount(<ChapterAttachments ctx={ctx} course={course} chapter={chapter} saved={vi.fn()} onBusyChange={()=>{}}/>);
    expect(screen.getByRole('link',{name:'Sign in to upload files'})).toHaveAttribute('href','/auth/login');
    expect(screen.queryByLabelText('Upload PDF or video')).not.toBeInTheDocument();
    const actual=await vi.importActual<typeof import('../src/lib/learning')>('../src/lib/learning');
    await expect(actual.uploadLearningFile('student','/studio/courses/course-1/chapters/chapter-1/materials',new File(['%PDF-1.4'],'guide.pdf'),vi.fn())).rejects.toThrow('Sign in');
  });
});

