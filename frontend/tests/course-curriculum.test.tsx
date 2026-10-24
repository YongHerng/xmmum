import {useState} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CourseCurriculum} from '../src/components/course-curriculum';
import {activeSubsections,hasLearningContent,learningSections,type Course,type Chapter} from '../src/lib/learning';
import type {LearningContext} from '../src/components/learning-pathway';

const mock=vi.hoisted(()=>({request:vi.fn(),upload:vi.fn()}));
vi.mock('../src/lib/learning',async original=>({...await original<typeof import('../src/lib/learning')>(),learningRequest:(...args:unknown[])=>mock.request(...args),uploadLearningFile:(...args:unknown[])=>mock.upload(...args)}));
const base={id:'draft-1',title:'Security training',description:'A training course.',provider:'Demo partner',category:'Security',published:false,chapters:[],final_questions:[]} as unknown as Course;
const first={id:'ch-1',title:'Security fundamentals',body:'',skill:'',minutes:10,subsections:[],materials:[],questions:[],question_count:0} as Chapter;
const ctx={demo:null,scope:'curriculum-test',courses:[],go:vi.fn(),url:()=>'/app/pathway',refresh:vi.fn()} as unknown as LearningContext;
let current:Course;
function mount(course:Course,onDirtyChange?:(dirty:boolean)=>void){
  current=course;
  function Harness(){const [value,setValue]=useState(course);return <CourseCurriculum ctx={ctx} course={value} saved={async()=>setValue(current)} onQuiz={ctx.go} onDirtyChange={onDirtyChange}/>;}
  return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Harness/></QueryClientProvider>);
}
afterEach(()=>{cleanup();vi.clearAllMocks();mock.request.mockReset();mock.upload.mockReset();});

function newSubsection(){
  fireEvent.click(within(screen.getByRole('complementary',{name:'Course structure'})).getByRole('button',{name:'Add subsection 1.1'}));
}
function saveSection(_demo:string,_path:string,_method:string,body:{title:string;body:string;video_url:string}){
  current={...current,chapters:[{...current.chapters[0],subsections:[{id:'s-1',...body}]}]};return Promise.resolve(current);
}
function storeFile(_demo:string,_path:string,file:File,_progress:unknown,_signal:unknown,id:string){
  const material={id:file.name,name:file.name,size:file.size,kind:file.name.endsWith('.pdf')?'pdf' as const:'video' as const,mime:file.type,subsection_id:id};
  current={...current,chapters:[{...current.chapters[0],materials:[...(current.chapters[0].materials||[]),material]}]};return Promise.resolve(material);
}

describe('chapter-first curriculum authoring',()=>{
  it('uses a question-document icon for the chapter quiz, not a completion tick',()=>{
    mount({...base,chapters:[first]});
    const quiz=within(screen.getByRole('complementary',{name:'Course structure'})).getByRole('button',{name:'Chapter quiz 0'});
    expect(quiz.querySelector('.lucide-file-question')).toBeInTheDocument();
    expect(quiz.querySelector('.lucide-circle-check')).not.toBeInTheDocument();
  });
  it('asks only for the chapter name, then creates a chapter ready for subsections',async()=>{
    mock.request.mockImplementation(async(_demo,path,_method,body)=>{expect(path).toBe('/studio/courses/draft-1/chapters');expect(body).toEqual({title:'Security fundamentals'});current={...base,chapters:[first]};return current;});
    mount(base);
    expect(screen.getByRole('heading',{name:'Create chapter 1'})).toBeInTheDocument();
    expect(screen.queryByLabelText('Text notes (optional)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Topic tag')).not.toBeInTheDocument();
    const create=screen.getByRole('button',{name:'Create chapter & continue'});
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Chapter name'),{target:{value:'Security fundamentals'}});
    fireEvent.click(create);
    expect(await screen.findByRole('heading',{name:'Subsections in this chapter'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Add your first subsection'})).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Add subsection 1.1'})).toHaveLength(2);
  });
  it('adds a subsection inside the selected chapter, not another chapter',async()=>{
    const section={id:'s-1',title:'Course overview',body:'Welcome to the course.'};
    mock.request.mockImplementation(async(_demo,path,method,body)=>{expect(path).toBe('/studio/courses/draft-1/chapters/ch-1/subsections');expect(method).toBe('POST');expect(body).toEqual({title:section.title,body:section.body,video_url:''});current={...base,chapters:[{...first,subsections:[section]}]};return current;});
    mount({...base,chapters:[first]});
    const tree=screen.getByRole('complementary',{name:'Course structure'});
    fireEvent.click(within(tree).getByRole('button',{name:'Add subsection 1.1'}));
    expect(screen.getByRole('heading',{name:'Add subsection 1.1'})).toBeInTheDocument();
    expect(screen.getByText('INSIDE CHAPTER 1 · Security fundamentals')).toBeInTheDocument();
    expect(screen.getByLabelText('Upload PDF or video')).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Subsection name'),{target:{value:section.title}});
    fireEvent.change(screen.getByLabelText('Text notes (optional)'),{target:{value:section.body}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection 1.1'}));
    expect(await screen.findByRole('heading',{name:'Edit subsection 1.1'})).toBeInTheDocument();
    expect(screen.getByLabelText('Upload PDF or video')).toBeInTheDocument();
    expect(within(tree).getByRole('button',{name:'1.1 Course overview'})).toBeInTheDocument();
    expect(current.chapters).toHaveLength(1);
  });
  it('retains the subsection draft when saving fails',async()=>{
    mock.request.mockRejectedValue(new Error('Connection unavailable.'));mount({...base,chapters:[first]});
    fireEvent.click(within(screen.getByRole('complementary',{name:'Course structure'})).getByRole('button',{name:'Add subsection 1.1'}));
    fireEvent.change(screen.getByLabelText('Subsection name'),{target:{value:'Keep this lesson'}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection 1.1'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your entries are kept.');
    expect(screen.getByLabelText('Subsection name')).toHaveValue('Keep this lesson');
  });
  it('chooses PDF and video before saving, then creates and uploads in one action',async()=>{
    mock.request.mockImplementation(saveSection);mock.upload.mockImplementation(storeFile);
    const dirty=vi.fn();mount({...base,chapters:[first]},dirty);newSubsection();
    const pdf=new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'});
    const video=new File(['ftyp'],'lesson.mp4',{type:'video/mp4'});
    const picker=screen.getByLabelText('Upload PDF or video');
    fireEvent.change(picker,{target:{files:[pdf]}});
    fireEvent.change(picker,{target:{files:[video]}});
    expect(screen.getByRole('button',{name:'Save subsection & upload 2 files'})).toBeDisabled();
    expect(mock.request).not.toHaveBeenCalled();expect(mock.upload).not.toHaveBeenCalled();
    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.change(screen.getByLabelText('Subsection name'),{target:{value:'Security media lesson'}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection & upload 2 files'}));
    expect(await screen.findByRole('heading',{name:'Edit subsection 1.1'})).toBeInTheDocument();
    expect(mock.request).toHaveBeenCalledTimes(1);
    expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/draft-1/chapters/ch-1/subsections','POST',{title:'Security media lesson',body:'',video_url:''});
    expect(mock.upload.mock.calls.map(call=>[call[2].name,call[5]])).toEqual([['guide.pdf','s-1'],['lesson.mp4','s-1']]);
    expect(current.chapters[0].subsections).toHaveLength(1);
    expect(current.chapters[0].materials).toHaveLength(2);
    await waitFor(()=>expect(dirty).toHaveBeenLastCalledWith(false));
    expect(screen.queryByRole('button',{name:'Remove selected guide.pdf'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Remove guide.pdf'})).toBeInTheDocument();
  });
  it('does not upload when saving the lesson fails, and keeps the selected file',async()=>{
    mock.request.mockRejectedValue(new Error('Save unavailable.'));
    mount({...base,chapters:[first]});newSubsection();
    fireEvent.change(screen.getByLabelText('Subsection name'),{target:{value:'Keep my PDF'}});
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'})]}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection & upload 1 file'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save unavailable.');
    expect(mock.upload).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Subsection name')).toHaveValue('Keep my PDF');
    expect(screen.getByRole('button',{name:'Remove selected guide.pdf'})).toBeEnabled();
    expect(screen.getByRole('button',{name:'Save subsection & upload 1 file'})).toBeEnabled();
  });
  it('retries a partial upload on the same saved subsection without duplicating successful files',async()=>{
    mock.request.mockImplementation(saveSection);
    mock.upload.mockImplementationOnce(storeFile).mockRejectedValueOnce(new Error('Connection interrupted.')).mockImplementationOnce(storeFile);
    mount({...base,chapters:[first]});newSubsection();
    fireEvent.change(screen.getByLabelText('Subsection name'),{target:{value:'A mixed lesson'}});
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'}),new File(['ftyp'],'lesson.mp4',{type:'video/mp4'})]}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection & upload 2 files'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('1 file remains selected.');
    expect(screen.getByRole('button',{name:'Remove guide.pdf'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Remove selected lesson.mp4'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Save subsection & upload 1 file'}));
    expect(await screen.findByRole('heading',{name:'Edit subsection 1.1'})).toBeInTheDocument();
    expect(mock.request.mock.calls.map(call=>[call[1],call[2]])).toEqual([
      ['/studio/courses/draft-1/chapters/ch-1/subsections','POST'],
      ['/studio/courses/draft-1/chapters/ch-1/subsections/s-1','PUT'],
    ]);
    expect(mock.upload.mock.calls.map(call=>[call[2].name,call[5]])).toEqual([['guide.pdf','s-1'],['lesson.mp4','s-1'],['lesson.mp4','s-1']]);
    expect(current.chapters[0].subsections).toHaveLength(1);
    expect(current.chapters[0].materials).toHaveLength(2);
  });
  it('rejects invalid files before saving and lets authors remove queued files',()=>{
    const dirty=vi.fn();mount({...base,chapters:[first]},dirty);newSubsection();
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['bad'],'script.html',{type:'text/html'})]}});
    expect(screen.getByRole('alert')).toHaveTextContent('PDF, MP4 or WEBM');
    expect(mock.request).not.toHaveBeenCalled();expect(mock.upload).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'})]}});
    expect(dirty).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button',{name:'Remove selected guide.pdf'}));
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('button',{name:/& upload/})).not.toBeInTheDocument();
  });
  it('keeps file-only drafts protected when switching lessons',()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
    mount({...base,chapters:[first]});newSubsection();
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'})]}});
    fireEvent.click(screen.getByRole('button',{name:'Chapter quiz 0'}));
    expect(confirm).toHaveBeenCalledWith('Discard the unsaved changes before opening the quiz?');
    expect(ctx.go).not.toHaveBeenCalled();
    expect(screen.getByRole('button',{name:'Remove selected guide.pdf'})).toBeInTheDocument();
    confirm.mockRestore();
  });
  it('locks the editor while the combined save is uploading',async()=>{
    mock.request.mockImplementation(saveSection);
    let finish!:(value:unknown)=>void;
    mock.upload.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    mount({...base,chapters:[first]});newSubsection();
    fireEvent.change(screen.getByLabelText('Subsection name'),{target:{value:'PDF lesson'}});
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['%PDF-1.4'],'guide.pdf',{type:'application/pdf'})]}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection & upload 1 file'}));
    await waitFor(()=>expect(mock.upload).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Uploading guide.pdf');
    expect(screen.getByLabelText('Subsection name')).toBeDisabled();
    expect(screen.getByLabelText('Upload PDF or video')).toBeDisabled();
    expect(screen.getByRole('button',{name:'Remove selected guide.pdf'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Saving lesson…'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Chapter quiz 0'})).toBeDisabled();
    finish({id:'pdf'});
    expect(await screen.findByRole('heading',{name:'Edit subsection 1.1'})).toBeInTheDocument();
  });
  it('adds files to an existing subsection in the same save action',async()=>{
    const section={id:'s-1',title:'Existing lesson',body:'Original notes'};
    mock.request.mockImplementation(saveSection);mock.upload.mockImplementation(storeFile);
    mount({...base,chapters:[{...first,subsections:[section]}]});
    fireEvent.click(screen.getByRole('button',{name:'1.1 Existing lesson'}));
    fireEvent.change(screen.getByLabelText('Upload PDF or video'),{target:{files:[new File(['ftyp'],'lesson.mp4',{type:'video/mp4'})]}});
    fireEvent.click(screen.getByRole('button',{name:'Save subsection & upload 1 file'}));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Remove lesson.mp4'})).toBeInTheDocument());
    expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/draft-1/chapters/ch-1/subsections/s-1','PUT',{title:section.title,body:section.body,video_url:''});
    expect(mock.upload.mock.calls[0][5]).toBe('s-1');
    expect(current.chapters[0].subsections).toHaveLength(1);
  });
  it('links the chapter quiz to its own assessment, not the final test',()=>{
    mount({...base,chapters:[first]});
    fireEvent.click(screen.getByRole('button',{name:'Chapter quiz 0'}));
    expect(ctx.go).toHaveBeenCalledWith('ch-1');
  });
  it('uses automatic numbering and rejects empty active subsections when checking readiness',()=>{
    const chapter={...first,subsections:[{id:'one',title:'Overview',body:'Original lesson.'},{id:'removed',title:'Removed',body:'',removed_at:'today'},{id:'two',title:'Practice',body:''}]};
    expect(activeSubsections(chapter)).toHaveLength(2);
    expect(learningSections(chapter,3).map(item=>item[2])).toEqual(['3.1','3.2','']);
    expect(hasLearningContent(chapter)).toBe(false);
    expect(hasLearningContent({...chapter,materials:[{id:'pdf',name:'lesson.pdf',kind:'pdf',mime:'application/pdf',size:100,subsection_id:'two'}]})).toBe(true);
  });
});

