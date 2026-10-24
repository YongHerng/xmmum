import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import CVReaderScreen from '../src/components/cv-reader-screen';
import {CVScoreSummary} from '../src/components/cv-score-summary';
import type {Evaluation} from '../src/lib/types';

const state=vi.hoisted(()=>({api:vi.fn(),reload:vi.fn(),data:{} as any}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
vi.mock('../src/lib/api',()=>({api:state.api}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({data:state.data,demo:null,link:(path:string)=>path,reload:state.reload})}));
vi.mock('../src/components/cv-reader',()=>({CVReader:({confirm,initialCV}:any)=><button onClick={()=>void confirm(initialCV)}>Save test CV</button>}));
vi.mock('../src/components/ai-assistance',()=>({CVAIAssistance:()=>null}));
const rating={score:63,analysis_mode:'ai-rating',breakdown:[{name:'Clarity & readability',score:70,weight:20,explanation:'Readable source wording.',evidence:['Source content.']},{name:'Evidence & specificity',score:56,weight:20,explanation:'More examples would help.',evidence:[]}],strengths:['Specific project context.'],suggestions:['Explain the project outcome.'],summary:'The source supports this assessment.',skills:[],ai_status:'AI assessed',note:'Writing guidance.'} as Evaluation;
beforeEach(()=>{
 state.api.mockReset();state.reload.mockReset();
 state.data={cv_version:1,evaluation:null,cv:{name:'Test Candidate',education:'Diploma in IT',skills:['Networking']},profile:{name:'Test Candidate',education:'Diploma in IT'},roles:[],questionnaire:{completed_step:0},onboarding:{cv_uploaded:true,cv_confirmed:false,discover_complete:false}};
 state.reload.mockImplementation(async()=>{state.data={...state.data,evaluation:rating,onboarding:{...state.data.onboarding,cv_confirmed:true}};});
});
afterEach(cleanup);
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><CVReaderScreen/></QueryClientProvider>);}

it('shows analysis progress, then the score and an explicit Discover yourself link',async()=>{
 let complete!:()=>void;
 state.api.mockImplementation((path:string)=>path==='/cv/analyze'?new Promise<void>(resolve=>{complete=resolve;}):Promise.resolve({}));
 mount();fireEvent.click(screen.getByRole('button',{name:'Save test CV'}));
 expect(await screen.findByRole('heading',{name:'Analysing your saved CV'})).toBeVisible();
 expect(screen.getByRole('tabpanel',{name:'AI assessment'})).toHaveFocus();
 expect(screen.queryByRole('link',{name:'Continue to Discover yourself'})).not.toBeInTheDocument();
 complete();
 expect(await screen.findByRole('img',{name:'Overall CV score: 63 out of 100'})).toBeVisible();
 expect(screen.getByRole('link',{name:'Continue to Discover yourself'})).toHaveAttribute('href','/app/questionnaire');
 expect(screen.getByRole('progressbar',{name:'Clarity & readability score'})).toHaveAttribute('aria-valuenow','70');
 expect(screen.getByText('The source supports this assessment.')).not.toBeVisible();
 expect(state.api.mock.calls.map(([path])=>path)).toEqual(['/cv','/cv/analyze']);
 expect(state.data.questionnaire.completed_step).toBe(0);
});

it('keeps a saved CV available when analysis fails and does not continue automatically',async()=>{
 state.api.mockImplementation((path:string)=>path==='/cv/analyze'?Promise.reject(new Error('Provider unavailable.')):Promise.resolve({}));
 state.reload.mockResolvedValue(undefined);
 mount();fireEvent.click(screen.getByRole('button',{name:'Save test CV'}));
 expect(await screen.findByText(/Your CV was saved. Analysis was not completed/)).toBeVisible();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Analyse saved CV'})).toBeEnabled());
 expect(screen.queryByRole('link',{name:'Continue to Discover yourself'})).not.toBeInTheDocument();
});

it.each([0,100])('renders an accessible circular score at %s without an invented value',score=>{
 render(<CVScoreSummary rating={{...rating,score}}/>);
 expect(screen.getByRole('img',{name:`Overall CV score: ${score} out of 100`})).toBeVisible();
 expect(screen.getAllByRole('progressbar')).toHaveLength(2);
});
