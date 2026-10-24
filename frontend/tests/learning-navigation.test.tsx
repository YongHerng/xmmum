import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LearningPathway} from '../src/components/learning-pathway';
import {UserProfile} from '../src/components/user-profile';
import type {Course,Badge} from '../src/lib/learning';

const mock=vi.hoisted(()=>({params:new URLSearchParams(),push:vi.fn(),replace:vi.fn(),request:vi.fn(),demo:'student' as string|null}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mock.push,replace:mock.replace}),useSearchParams:()=>mock.params}));
vi.mock('../src/lib/learning',async original=>({...await original<typeof import('../src/lib/learning')>(),learningRequest:(...args:unknown[])=>mock.request(...args)}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({demo:mock.demo,data:{learning_scope:'account-1',matches:[],cv:{skills:[]},questionnaire:{},profile:{name:'Aisha Tan',category:'student',location:'Kuala Lumpur',education:'Computer Science',goal:'Build a career in technology'},roles:[],selected_role:'networking',pathways:[{title:'Fastest Transition'}]},link:(path:string,extra?:Record<string,string>)=>{const params=new URLSearchParams(extra);if(mock.demo)params.set('demo',mock.demo);return path+(params.size?'?'+params:'');}})}));

const course={id:'networking',title:'Networking foundations',provider:'Demo ICT Academy',description:'Learn network basics.',category:'Networking',published:true,sample:true,chapters:[{id:'chapter-1',title:'How networks connect',body:'A network connects devices.',minutes:8,question_count:4,questions:[]}],final_questions:[],chapter_count:1,minutes:8,final_question_count:4,pass_percent:100,final_pass_percent:80,percent:0,complete:false,milestones:[],enrollment:null} as unknown as Course;
const badge={course_id:'networking',title:course.title,provider:course.provider,completed_at:'2026-10-23T01:00:00Z',score:100,badge_code:'FP-TEST-BADGE',attempt_id:'attempt-1'} as Badge;
function mount(component:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);}
afterEach(()=>{cleanup();mock.params=new URLSearchParams();mock.demo='student';vi.clearAllMocks();});

describe('hosted learning navigation and system profile',()=>{
  it('hides Partner Studio and ignores direct studio links while preserving learning',async()=>{
    mock.params=new URLSearchParams('view=studio');mock.request.mockResolvedValue([course]);mount(<LearningPathway/>);
    expect(await screen.findByRole('heading',{name:'Your next chapter starts here.'})).toBeVisible();
    expect(screen.queryByRole('link',{name:/Partner studio/i})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:/Create.*course/i})).not.toBeInTheDocument();
    expect(mock.request.mock.calls.every(([,path])=>path==='/courses')).toBe(true);
  });
  it('replaces the old direction landing with hosted courses',async()=>{
    mock.request.mockResolvedValue([course]);mount(<LearningPathway/>);
    expect(await screen.findByRole('heading',{name:'Your next chapter starts here.'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:course.title})).toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'My direction'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'Learning profile'})).not.toBeInTheDocument();
    expect(screen.queryByText('Fastest Transition')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Learning home'})).toHaveAttribute('aria-current','page');
    expect(screen.getByRole('link',{name:'View course'})).toHaveAttribute('href','/app/pathway?view=course&course=networking&demo=student');
  });
  it('links completed learners to their system profile from the home page',async()=>{
    mock.request.mockResolvedValue([{...course,complete:true,enrollment:{completion:badge}}]);mount(<LearningPathway/>);
    expect(await screen.findByRole('heading',{name:'Explore your next course.'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'View my profile'})).toHaveAttribute('href','/app/profile?demo=student');
    expect(screen.queryByRole('heading',{name:'Find your first course.'})).not.toBeInTheDocument();
  });
  it('removes the three review checklist sentences but retains the badge information',async()=>{
    mock.params=new URLSearchParams('view=course&course=networking');
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[course]:course));mount(<LearningPathway/>);
    expect(await screen.findByRole('heading',{name:'About this course'})).toBeInTheDocument();
    for(const sentence of ['All chapters open from the start','Unlimited assessment attempts','Timeline in actual completion order']) expect(screen.queryByText(sentence,{exact:true})).not.toBeInTheDocument();
    expect(screen.getByText('Badge after the final test',{exact:true})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Start this course'})).toBeInTheDocument();
  });
  it('uses the author-written description in About this course instead of fixed copy',async()=>{
    mock.params=new URLSearchParams('view=course&course=networking');
    const authored={...course,description:'Build practical networking knowledge for entry-level support work.\n\nLearn how common devices exchange data.'};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[authored]:authored));mount(<LearningPathway/>);
    const about=(await screen.findByRole('heading',{name:'About this course'})).closest('section')!;
    expect(within(about).getByText('Build practical networking knowledge for entry-level support work.')).toBeInTheDocument();
    expect(within(about).getByText('Learn how common devices exchange data.')).toBeInTheDocument();
    expect(screen.queryByText(/Study chapters in any order/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Build practical networking knowledge/)).toHaveLength(1);
  });
  it('removes hub navigation and practice banner inside the classroom',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking');
    const enrolled={...course,enrollment:{chapter_passes:{},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);expect(await screen.findByRole('heading',{name:'Course outline'})).toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Learning navigation'})).not.toBeInTheDocument();
    expect(screen.queryByText('Your learning practice space.')).not.toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Course overview'})).toBeInTheDocument();
  });
  it('redirects old learning-profile links to the system profile',async()=>{
    mock.params=new URLSearchParams('view=profile');mock.request.mockResolvedValue([]);mount(<LearningPathway/>);
    await waitFor(()=>expect(mock.replace).toHaveBeenCalledWith('/app/profile?demo=student'));
  });
  it('keeps progress and the final test outside the scrolling chapter list',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&chapter=chapter-2');
    const second={...course.chapters[0],id:'chapter-2',title:'IPv4 and subnetting'};
    const enrolled={...course,chapter_count:2,chapters:[course.chapters[0],second],percent:33,final_unlocked:false,enrollment:{chapter_passes:{'chapter-2':{completed_at:'2026-10-23T01:00:00Z',attempt_id:'pass-2',order:1}},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    const outline=await screen.findByRole('complementary',{name:'Course outline'});
    const chapters=within(outline).getByRole('navigation',{name:'Chapters'});
    const progress=within(outline).getByRole('progressbar',{name:'Course progress'});
    expect(progress).toHaveAttribute('aria-valuenow','33');
    expect(within(outline).getByText('1 of 2 chapters passed')).toBeInTheDocument();
    expect(chapters).not.toContainElement(progress);
    const finalButton=within(outline).getByRole('button',{name:/Final test.*Locked/});
    expect(chapters).not.toContainElement(finalButton);
    expect(within(chapters).getByRole('button',{name:/IPv4 and subnetting/})).toHaveAttribute('aria-current','page');
    expect(within(chapters).getByRole('button',{name:/How networks connect/})).not.toHaveAttribute('aria-current');
    expect(within(chapters).getByRole('button',{name:/IPv4 and subnetting/})).toHaveAttribute('data-passed','true');
    expect(within(chapters).getByRole('button',{name:/How networks connect/})).toHaveAttribute('data-passed','false');
    expect(within(chapters).getByRole('navigation',{name:'Chapter 2 sections'})).toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Chapter 1 sections'})).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Chapter content'})).not.toBeInTheDocument();
    fireEvent.click(within(chapters).getByRole('button',{name:/How networks connect/}));
    expect(mock.push).toHaveBeenCalledWith('/app/pathway?view=learn&course=networking&chapter=chapter-1&section=overview&demo=student');
    fireEvent.click(finalButton);
    expect(mock.push).toHaveBeenCalledWith('/app/pathway?view=learn&course=networking&chapter=chapter-2&section=final&demo=student');
  });
  it('provides a mobile outline toggle and retains lesson section navigation',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&section=content');
    const enrolled={...course,enrollment:{chapter_passes:{},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    const toggle=await screen.findByRole('button',{name:'Show course outline'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button',{name:'Hide course outline'})).toHaveAttribute('aria-expanded','true');
    const steps=within(screen.getByRole('complementary',{name:'Course outline'})).getByRole('navigation',{name:'Chapter 1 sections'});
    expect(within(steps).getByRole('button',{name:'Learn'})).toHaveAttribute('aria-current','step');
    fireEvent.click(within(steps).getByRole('button',{name:'Quiz'}));
    expect(mock.push).toHaveBeenCalledWith('/app/pathway?view=learn&course=networking&chapter=chapter-1&section=quiz&demo=student');
    expect(screen.getByRole('button',{name:'Show course outline'})).toHaveAttribute('aria-expanded','false');
  });
  it('places all four chapter steps in the outline with correct destinations',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&section=summary');
    const enrolled={...course,enrollment:{chapter_passes:{},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    const outline=await screen.findByRole('complementary',{name:'Course outline'});
    const steps=within(outline).getByRole('navigation',{name:'Chapter 1 sections'});
    expect(within(steps).getAllByRole('button')).toHaveLength(4);
    expect(within(steps).getByRole('button',{name:'Recap'})).toHaveAttribute('aria-current','step');
    for(const [name,section] of [['Overview','overview'],['Learn','content'],['Recap','summary'],['Quiz','quiz']]){
      const button=within(steps).getByRole('button',{name});
      if(section==='quiz')expect(button.querySelector('.lucide-file-question')).toBeInTheDocument();
      else expect(button).toHaveTextContent(String(['overview','content','summary'].indexOf(section)+1).padStart(2,'0'));
      fireEvent.click(button);
      expect(mock.push).toHaveBeenLastCalledWith(`/app/pathway?view=learn&course=networking&chapter=chapter-1&section=${section}&demo=student`);
    }
    expect(screen.queryByRole('navigation',{name:'Chapter content'})).not.toBeInTheDocument();
  });
  it('does not show chapter substeps inside the final assessment',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&section=final');
    const enrolled={...course,final_unlocked:false,enrollment:{chapter_passes:{},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    expect(await screen.findByRole('heading',{name:'Your final milestone is waiting.'})).toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Chapter 1 sections'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Final test.*Locked/})).toHaveAttribute('aria-current','page');
  });
  it('lets the selected chapter collapse and reopen without resetting the current lesson',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&section=summary');
    const enrolled={...course,enrollment:{chapter_passes:{},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    const outline=await screen.findByRole('complementary',{name:'Course outline'});
    const chapter=within(outline).getByRole('button',{name:/How networks connect/});
    expect(chapter).toHaveAttribute('aria-expanded','true');
    fireEvent.click(chapter);
    expect(chapter).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('navigation',{name:'Chapter 1 sections'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Chapter recap'})).toBeInTheDocument();
    expect(mock.push).not.toHaveBeenCalled();
    fireEvent.click(chapter);
    expect(chapter).toHaveAttribute('aria-expanded','true');
    expect(within(outline).getByRole('button',{name:'Recap'})).toHaveAttribute('aria-current','step');
  });
  it('shows author-created numbered subsections instead of the four fixed steps',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&section=overview');
    const chapters=[{...course.chapters[0],body:'',subsections:[{id:'s1',title:'Course overview',body:'First subsection content.'},{id:'s2',title:'Key concepts',body:'Second subsection content.'}]}];
    const enrolled={...course,chapters,enrollment:{chapter_passes:{},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    const steps=await screen.findByRole('navigation',{name:'Chapter 1 sections'});
    expect(within(steps).getByRole('button',{name:'Course overview'})).toHaveTextContent('1.1');
    expect(within(steps).getByRole('button',{name:'Key concepts'})).toHaveTextContent('1.2');
    expect(screen.getByRole('heading',{name:'1.1 Course overview'})).toBeInTheDocument();
    expect(screen.getByText('First subsection content.')).toBeInTheDocument();
    expect(screen.queryByText('Second subsection content.')).not.toBeInTheDocument();
    expect(within(steps).queryByRole('button',{name:'Recap'})).not.toBeInTheDocument();
    fireEvent.click(within(steps).getByRole('button',{name:'Key concepts'}));
    expect(mock.push).toHaveBeenLastCalledWith('/app/pathway?view=learn&course=networking&chapter=chapter-1&section=subsection%3As2&demo=student');
    const quiz=within(steps).getByRole('button',{name:'Chapter quiz'});
    expect(quiz.querySelector('.lucide-file-question')).toBeInTheDocument();
    expect(quiz).not.toHaveTextContent('✓');
    expect(quiz.querySelector('.lucide-circle-check')).not.toBeInTheDocument();
  });
  it('keeps the quiz icon distinct from its earned completion indicator',async()=>{
    mock.params=new URLSearchParams('view=learn&course=networking&section=quiz');
    const enrolled={...course,enrollment:{chapter_passes:{'chapter-1':{completed_at:'2026-10-24T00:00:00Z',order:0}},assessments:{},completion:null}};
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/courses'?[enrolled]:enrolled));
    mount(<LearningPathway/>);
    const steps=await screen.findByRole('navigation',{name:'Chapter 1 sections'});
    const quiz=within(steps).getByRole('button',{name:'Quiz'});
    expect(quiz.querySelector('.lucide-file-question')).toBeInTheDocument();
    expect(quiz.querySelector('.lucide-circle-check')).toBeInTheDocument();
  });
  it('shows the current system identity and earned badges on My profile',async()=>{
    mock.request.mockImplementation((_demo:string,path:string)=>Promise.resolve(path==='/badges'?[badge]:[course]));mount(<UserProfile/>);
    expect(screen.getByRole('heading',{name:'Aisha Tan'})).toBeInTheDocument();
    expect(screen.getByText('Computer Science',{selector:'aside dd'})).toBeInTheDocument();
    expect(await screen.findByText('FP-TEST-BADGE')).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Your digital badges'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'View course timeline'})).toHaveAttribute('href','/app/pathway?view=course&course=networking&demo=student');
    expect(mock.request).toHaveBeenCalledWith('student','/badges');
  });
  it('shows account request failures instead of claiming there are no badges',async()=>{
    mock.demo=null;mock.request.mockRejectedValue(new Error('Learning storage is unavailable.'));mount(<UserProfile/>);
    expect(await screen.findByRole('heading',{name:'We couldn’t load your badges.'})).toBeInTheDocument();
    expect(screen.queryByText('Your first badge is ahead.')).not.toBeInTheDocument();
    expect(mock.request).toHaveBeenCalledWith(null,'/badges');
  });
});

