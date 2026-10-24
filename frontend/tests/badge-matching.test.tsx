import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CourseSkillMapping} from '../src/components/course-skill-mapping';
import {MatchSkillEvidence} from '../src/components/match-skill-evidence';
import type {LearningContext} from '../src/components/learning-pathway';
import type {Course} from '../src/lib/learning';
import type {SkillEvidence} from '../src/lib/types';

const mock=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('../src/lib/learning',async original=>({...await original<typeof import('../src/lib/learning')>(),learningRequest:(...args:unknown[])=>mock.request(...args)}));
const catalogue={skills:[{id:'networking',name:'Networking'},{id:'linux',name:'Linux'}],levels:[{id:'foundation',credit:.5},{id:'intermediate',credit:.75},{id:'advanced',credit:1}]};
const course={id:'course',title:'Network basics',provider:'Partner',description:'Learn the basics.',published:false} as Course;
const ctx={demo:null,scope:'account',courses:[],url:()=>'',go:vi.fn(),refresh:vi.fn()} as LearningContext;
function mount(content:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{content}</QueryClientProvider>);}
afterEach(()=>{cleanup();vi.clearAllMocks();mock.request.mockReset();});

describe('assessed skills authoring',()=>{
  it('selects controlled skill IDs and levels and submits without client-side credit values',async()=>{
    mock.request.mockImplementation((_demo,path)=>Promise.resolve(path==='/skills'?catalogue:course));
    const saved=vi.fn().mockResolvedValue(undefined);
    mount(<CourseSkillMapping ctx={ctx} course={course} saved={saved}/>);
    fireEvent.click(screen.getByText('Skills assessed & badge evidence'));
    await waitFor(()=>expect(screen.getByRole('button',{name:'Add assessed skill'})).toBeEnabled());
    fireEvent.click(screen.getByRole('button',{name:'Add assessed skill'}));
    expect(screen.getByRole('button',{name:'Save assessed skills'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Assessed skill 1'),{target:{value:'networking'}});
    fireEvent.change(screen.getByLabelText('Assessment level 1'),{target:{value:'intermediate'}});
    fireEvent.click(screen.getByRole('button',{name:'Add assessed skill'}));
    expect(within(screen.getByLabelText('Assessed skill 2')).getByRole('option',{name:'Networking'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Remove assessed skill 2'}));
    fireEvent.click(screen.getByRole('button',{name:'Save assessed skills'}));
    await waitFor(()=>expect(saved).toHaveBeenCalled());
    expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/course','PUT',{
      title:course.title,provider:course.provider,description:course.description,
      assessed_skills:[{skill_id:'networking',level:'intermediate'}],
    });
  });
  it('explains completion-only awards and can clear a draft mapping',async()=>{
    mock.request.mockResolvedValue(catalogue);
    mount(<CourseSkillMapping ctx={ctx} course={{...course,assessed_skills:[{skill_id:'networking',level:'foundation'}]}} saved={vi.fn()}/>);
    fireEvent.click(screen.getByText('Skills assessed & badge evidence'));
    await screen.findByRole('option',{name:'Networking'});
    expect(screen.getByText('1 skill',{exact:true})).toBeInTheDocument();
    expect(screen.queryByText('1 skills',{exact:true})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Remove assessed skill 1'}));
    expect(screen.getByText(/No assessed skills selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Save assessed skills'}));
    await waitFor(()=>expect(mock.request).toHaveBeenCalledWith(null,'/studio/courses/course','PUT',expect.objectContaining({assessed_skills:[]})));
  });
  it('keeps published mappings read-only and retains selections after a failed save',async()=>{
    mock.request.mockImplementation((_demo,path)=>path==='/skills'?Promise.resolve(catalogue):Promise.reject(new Error('Save unavailable')));
    const view=mount(<CourseSkillMapping ctx={ctx} course={{...course,assessed_skills:[{skill_id:'networking',level:'foundation'}]}} saved={vi.fn()}/>);
    fireEvent.click(screen.getByText('Skills assessed & badge evidence'));
    await screen.findByRole('option',{name:'Networking'});
    fireEvent.click(screen.getByRole('button',{name:'Save assessed skills'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your selections are kept.');
    expect(screen.getByLabelText('Assessed skill 1')).toHaveValue('networking');
    view.unmount();
    mount(<CourseSkillMapping ctx={ctx} course={{...course,published:true,assessed_skills:[{skill_id:'networking',level:'foundation'}]}} saved={vi.fn()}/>);
    fireEvent.click(screen.getByText('Skills assessed & badge evidence'));
    expect(screen.getByLabelText('Assessed skill 1')).toBeDisabled();
    expect(screen.queryByRole('button',{name:'Save assessed skills'})).not.toBeInTheDocument();
  });
});

describe('career match evidence',()=>{
  const evidence={id:'networking',name:'Networking',credit:.5,level:'foundation',cv_claimed:false,badges:[{badge_code:'FP-ONE',course_id:'course',title:'Network basics',provider:'Partner',completed_at:'2026-10-24',level:'foundation'}]} as SkillEvidence;
  it('shows the source course and partial credit without calling it professional certification',()=>{
    mount(<MatchSkillEvidence evidence={[evidence]} courseLink={id=>`/app/pathway?view=course&course=${id}`}/>);
    const region=screen.getByRole('region',{name:'Badge-backed skills'});
    expect(within(region).getByText(/50% skill credit/)).toBeInTheDocument();
    fireEvent.click(within(region).getByText(/50% skill credit/));
    expect(screen.getByRole('link',{name:'Network basics'})).toHaveAttribute('href','/app/pathway?view=course&course=course');
    expect(screen.getByText(/not a guarantee of job readiness/)).toBeInTheDocument();
  });
  it('identifies evidence for an existing CV skill without double-counting',()=>{
    mount(<MatchSkillEvidence evidence={[{...evidence,cv_claimed:true,credit:1}]} courseLink={()=>'/course'}/>);
    expect(screen.getByText(/Also on your CV/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Also on your CV/));
    expect(screen.getByText(/skill is not counted again/)).toBeInTheDocument();
    expect(screen.queryByText(/100% skill credit/)).not.toBeInTheDocument();
  });
  it('renders nothing for CV-only skills',()=>{
    const view=mount(<MatchSkillEvidence evidence={[{...evidence,badges:[]}]} courseLink={()=>'/course'}/>);
    expect(view.container).toBeEmptyDOMElement();
  });
});
