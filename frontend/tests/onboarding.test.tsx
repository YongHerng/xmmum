import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {Workspace} from '../src/components/workspace';
import {firstIncompleteSurveyStep} from '../src/lib/onboarding';
import type {Answers,Snapshot} from '../src/lib/types';
import {api} from '../src/lib/api';

const state=vi.hoisted(()=>({path:'/app/dashboard',query:'',data:{} as Snapshot,replace:vi.fn(),push:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>state.path,useSearchParams:()=>new URLSearchParams(state.query),useParams:()=>({}),useRouter:()=>({replace:state.replace,push:state.push})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:state.data,error:null,isFetching:false}),useQueryClient:()=>({clear:vi.fn(),invalidateQueries:vi.fn()})}));
vi.mock('../src/components/session-provider',()=>({useSession:()=>({session:{user:{id:'test',email:'test@example.invalid'}},ready:true,error:null,retry:vi.fn()})}));
vi.mock('../src/components/theme-toggle',()=>({ThemeToggle:()=>null}));
vi.mock('../src/lib/api',()=>({api:vi.fn(),supabase:null}));
vi.mock('../src/lib/use-reduced-motion',()=>({useReducedMotionPreference:()=>true}));
beforeEach(()=>{
  state.path='/app/dashboard';state.query='';state.replace.mockClear();state.push.mockClear();
  vi.mocked(api).mockReset();vi.mocked(api).mockResolvedValue({});
  state.data={profile:{name:''},forecast:{scenario:'moderate',horizon:5},onboarding:{cv_uploaded:false,cv_confirmed:false,discover_complete:false,required_step:'cv'}} as Snapshot;
  vi.stubGlobal('matchMedia',()=>({matches:true,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it.each(['/app/dashboard','/app/questionnaire','/app/profile','/app/results','/app/pathway','/app/community','/app/news','/app/sdg'])('sends an unfinished user from %s to CV upload without showing page content',path=>{
  state.path=path;render(<Workspace><h1>Protected screen</h1></Workspace>);
  expect(state.replace).toHaveBeenCalledWith('/app/cv');
  expect(screen.queryByText('Protected screen')).not.toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Career matches'})).toHaveAttribute('aria-disabled','true');
});
it('unlocks Discover Yourself only after confirming the upload',()=>{
  state.data.onboarding={cv_uploaded:true,cv_confirmed:true,discover_complete:false,required_step:'questionnaire'};
  render(<Workspace><h1>Protected screen</h1></Workspace>);
  expect(state.replace).toHaveBeenCalledWith('/app/questionnaire');
});
it('allows viewing CV scores before choosing to continue to Discover yourself',()=>{
  state.path='/app/cv';state.data.onboarding={cv_uploaded:true,cv_confirmed:true,discover_complete:false,required_step:'questionnaire'};
  render(<Workspace><h1>CV assessment screen</h1></Workspace>);
  expect(screen.getByText('CV assessment screen')).toBeVisible();
  expect(state.replace).not.toHaveBeenCalled();
});
it.each(['cv','questionnaire'])('shows the current compulsory %s step',step=>{
  state.path=`/app/${step}`;state.data.onboarding!.required_step=step as 'cv'|'questionnaire';
  render(<Workspace><h1>Setup screen</h1></Workspace>);
  expect(screen.getByText('Setup screen')).toBeVisible();expect(screen.getByRole('region',{name:'Required account setup'})).toBeVisible();
});
it('unlocks the workspace after both steps and preserves public demos',()=>{
  state.data.onboarding!.required_step=null;const view=render(<Workspace><h1>Protected screen</h1></Workspace>);
  expect(screen.getByText('Protected screen')).toBeVisible();expect(state.replace).not.toHaveBeenCalled();view.unmount();
  state.query='demo=student';state.data.onboarding!.required_step='cv';render(<Workspace><h1>Demo screen</h1></Workspace>);
  expect(screen.getByText('Demo screen')).toBeVisible();expect(state.replace).not.toHaveBeenCalled();
});
it('requires every survey field while accepting a zero budget and no relocation',()=>{
  const answers={category:'student',interests:['data'],strengths:['Analysis'],career_goal:'Build useful tools',work_style:'analytical',environment:'flexible',social_energy:'mixed',decision_style:'both',motivation:'growth',weekly_hours:4,budget:0,location:'Malaysia',relocation:false,learning_style:'practice',completed_step:5} as Answers;
  expect(firstIncompleteSurveyStep(answers,'Taylor','Computing')).toBe(5);
  expect(firstIncompleteSurveyStep({...answers,strengths:['   ']},'Taylor','Computing')).toBe(1);
  expect(firstIncompleteSurveyStep({...answers,weekly_hours:null},'Taylor','Computing')).toBe(4);
  expect(firstIncompleteSurveyStep({...answers,relocation:null},'Taylor','Computing')).toBe(4);
});

it('moves completed users’ personal pages into a dedicated profile sidebar and provides Back',()=>{
  state.data.onboarding={cv_uploaded:true,cv_confirmed:true,discover_complete:true,required_step:null};
  const view=render(<Workspace><h1>Saved page</h1></Workspace>);
  const main=within(screen.getByRole('navigation',{name:'Workspace'}));
  for(const name of ['My profile','Your CV','Discover yourself'])expect(main.queryByRole('link',{name})).not.toBeInTheDocument();
  expect(main.getByRole('link',{name:'Overview'})).toBeVisible();
  expect(screen.getByRole('link',{name:'My profile'})).toHaveAttribute('href','/app/profile');
  state.path='/app/profile';view.rerender(<Workspace><h1>Saved profile</h1></Workspace>);
  const profile=within(screen.getByRole('navigation',{name:'Profile'}));
  expect(profile.getAllByRole('link').map(link=>link.textContent)).toEqual(['My profile','Your CV','Discover yourself']);
  expect(profile.queryByRole('link',{name:'Overview'})).not.toBeInTheDocument();
  fireEvent.click(profile.getByRole('button',{name:'Back to main navigation'}));
  expect(state.push).toHaveBeenCalledWith('/app/dashboard');
});

it.each(['/app/profile','/app/cv','/app/questionnaire'])('restores the profile sidebar from a direct or refreshed %s URL',path=>{
  state.path=path;state.data.onboarding={cv_uploaded:true,cv_confirmed:true,discover_complete:true,required_step:null};
  render(<Workspace><h1>Saved information</h1></Workspace>);
  expect(screen.getByRole('navigation',{name:'Profile'})).toBeVisible();
  expect(within(screen.getByRole('navigation',{name:'Profile'})).getByRole('link',{current:'page'})).toHaveAttribute('href',path);
});

it('records the introduction when a new user enters a core feature through a direct link',()=>{
  state.path='/app/news';state.data.onboarding={cv_uploaded:true,cv_confirmed:true,discover_complete:true,required_step:null,feature_guide_pending:true};
  render(<Workspace><h1>News content</h1></Workspace>);
  expect(screen.getByText('News content')).toBeVisible();expect(state.replace).not.toHaveBeenCalled();
  expect(api).toHaveBeenCalledWith('/onboarding/guide/complete','POST',undefined,{accessToken:undefined});
});
