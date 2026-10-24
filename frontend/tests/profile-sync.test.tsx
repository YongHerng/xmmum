import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {UserProfile} from '../src/components/user-profile';
import {Dashboard} from '../src/components/workspace-dashboard';
import type {Snapshot} from '../src/lib/types';

const state=vi.hoisted(()=>({data:{} as Snapshot,demo:null as string|null}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({data:state.data,demo:state.demo,identity:'user:test',link:(path:string)=>path})}));
vi.mock('../src/lib/learning',()=>({learningRequest:()=>Promise.resolve([]),dateLabel:(value:string)=>value}));
vi.mock('../src/components/provider-logo',()=>({ProviderLogo:()=>null}));
vi.mock('../src/lib/use-reduced-motion',()=>({useReducedMotionPreference:()=>true}));
beforeEach(()=>{state.demo=null;state.data={profile:{name:'',category:'',location:'',education:'',goal:'',onboarding_complete:false},questionnaire:{completed_step:0},cv:{skills:[]},evaluation:null,matches:[],roles:[{id:'data-analyst',title:'Data Analyst',summary:'Analyze data.'}],selected_role:'',pathways:[],completion:0} as unknown as Snapshot;});
afterEach(()=>cleanup());
function mount(component:React.ReactNode){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<QueryClientProvider client={client}>{component}</QueryClientProvider>);}

it('shows an empty direction for a real user without supporting data',()=>{
  // Even a legacy default role must not be presented as a personal recommendation.
  state.data.selected_role='data-analyst';mount(<UserProfile/>);
  expect(screen.getByRole('heading',{name:'Room to explore'})).toBeVisible();
  expect(screen.queryByRole('heading',{name:'Data Analyst'})).not.toBeInTheDocument();
});

it('keeps About you concise and reflects saved CV information in the profile',()=>{
  state.data.cv={...state.data.cv,name:'Jordan Lee',email:'jordan@example.invalid',phone:'+60 12 345 6789',education:'BSc Mathematics',experience:'Prepared quarterly reports',projects:'Energy dashboard',summary:'Graduate analyst',membership_licensure:'Student Member',certificates_training:'First Aid Certificate',skills:['Python','SQL']};
  mount(<UserProfile/>);
  const about=within(screen.getByRole('heading',{name:'About you'}).closest('section')!);
  expect(about.getByText('BSc Mathematics')).toBeVisible();
  expect(about.getByRole('link',{name:'Open Your CV'})).toHaveAttribute('href','/app/cv');
  for(const text of ['Prepared quarterly reports','Energy dashboard','Graduate analyst','Student Member','First Aid Certificate','jordan@example.invalid'])expect(about.queryByText(text)).not.toBeInTheDocument();
  const cv=within(screen.getByRole('region',{name:'Your CV information'}));
  expect(cv.getByText('Graduate analyst')).toBeVisible();expect(cv.getByText('Python')).toBeVisible();
  expect(cv.getByText('jordan@example.invalid')).not.toBeVisible();
  fireEvent.click(cv.getByText('View all CV details'));
  for(const text of ['Prepared quarterly reports','Energy dashboard','Student Member','First Aid Certificate','jordan@example.invalid'])expect(cv.getByText(text)).toBeVisible();
  expect(cv.getByRole('link',{name:'Review or update your CV'})).toHaveAttribute('href','/app/cv');
});

it('shows saved discovery answers in My Profile and distinguishes no relocation from missing data',()=>{
  state.data.questionnaire={...state.data.questionnaire,interests:['data'],strengths:['Communication'],career_goal:'Build accessible tools',location:'Malaysia',budget:0,weekly_hours:4,relocation:false};
  mount(<UserProfile/>);const survey=within(screen.getByRole('region',{name:'Discover Yourself'}));
  expect(survey.getByText('Build accessible tools',{selector:'p'})).toBeVisible();
  fireEvent.click(survey.getByText('View your Discover Yourself answers'));
  expect(survey.getByText('Data & analytics')).toBeVisible();expect(survey.getByText('Communication')).toBeVisible();
  expect(survey.getByText('MYR 0')).toBeVisible();expect(survey.getByText('No')).toBeVisible();
});

it('removes the duplicate discovery card and starts an empty account at CV upload',()=>{
  mount(<Dashboard/>);expect(screen.queryByRole('heading',{name:'Start with Discover Yourself'})).not.toBeInTheDocument();
  expect(screen.getAllByRole('heading',{name:'Your direction is waiting.'})).toHaveLength(1);
  expect(screen.getByRole('link',{name:'Upload my CV'})).toHaveAttribute('href','/app/cv');
});

it('does not repeat onboarding for completed or demo profiles',()=>{
  state.data.questionnaire.completed_step=5;const view=mount(<Dashboard/>);
  expect(screen.queryByRole('heading',{name:'Start with Discover Yourself'})).not.toBeInTheDocument();
  view.unmount();state.data.questionnaire.completed_step=0;state.demo='student';mount(<Dashboard/>);
  expect(screen.queryByRole('heading',{name:'Start with Discover Yourself'})).not.toBeInTheDocument();
});
