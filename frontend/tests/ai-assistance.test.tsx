import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CVAIAssistance,AIPersonalisation,AICareerExplanations} from '../src/components/ai-assistance';
import type {Answers,Match} from '../src/lib/types';

const state=vi.hoisted(()=>({api:vi.fn(),reload:vi.fn(),configured:true}));
vi.mock('../src/lib/api',()=>({api:state.api}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({data:{cv:{}},demo:false,identity:'user:test',reload:state.reload})}));
const context={version:1,badges:[{badge_code:'FP-NET',title:'Network basics',provider:'Test provider',skills:[{skill_id:'networking',level:'foundation'}]}],coverage:{unmapped_skills:[],notice:'Curated careers only.'},history:[]};
const proposal={preview_id:'preview-1',base_version:1,mode:'AI wording draft',changes:[{field:'summary',before:'Built 3 SQL dashboards.',after:'Created 3 dashboards using SQL.',reason:'Clearer wording.'}],before_rating:{score:60},after_rating:{score:62},notice:'Review before saving.'};
beforeEach(()=>{
  state.api.mockReset();state.reload.mockReset();state.reload.mockResolvedValue(undefined);state.configured=true;
  state.api.mockImplementation(async(path:string)=>{
    if(path==='/ai/status')return {configured:state.configured};
    if(path==='/cv/ai/context')return context;
    if(path==='/cv/ai/preview')return proposal;
    if(path==='/cv/ai/apply')return {evaluation:{score:63}};
    throw new Error('Unexpected request '+path);
  });
});
afterEach(cleanup);
function mount(component:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{component}</QueryClientProvider>);}

it('starts from an explicit preview action without consent gates and saves only approved edits',async()=>{
  mount(<CVAIAssistance/>);
  const generate=screen.getByRole('button',{name:'Create improvement preview'});
  await screen.findByRole('button',{name:'Preview CV addition'});
  expect(generate).toBeEnabled();
  expect(screen.queryByRole('checkbox',{name:/consent/i})).not.toBeInTheDocument();
  expect(state.api.mock.calls.some(([path])=>path==='/cv/ai/preview')).toBe(false);
  fireEvent.click(generate);
  await screen.findByRole('heading',{name:'Review before saving'});
  expect(state.api.mock.calls.some(([path])=>path==='/cv/ai/apply')).toBe(false);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Built 3 concise SQL dashboards.'}});
  fireEvent.click(screen.getByRole('button',{name:'Approve selected changes'}));
  await waitFor(()=>expect(state.api).toHaveBeenCalledWith('/cv/ai/apply','POST',{preview_id:'preview-1',fields:['summary'],edits:{summary:'Built 3 concise SQL dashboards.'}}));
  expect(await screen.findByRole('status')).toHaveTextContent('63/100');
  expect(state.reload).toHaveBeenCalled();
});

it('discards a preview without saving and blocks unsaved-reader overwrites',async()=>{
  const view=mount(<CVAIAssistance/>);
  await screen.findByRole('button',{name:'Preview CV addition'});
  fireEvent.click(screen.getByRole('button',{name:'Create improvement preview'}));
  fireEvent.click(await screen.findByRole('button',{name:'Discard preview'}));
  expect(state.api.mock.calls.some(([path])=>path==='/cv/ai/apply')).toBe(false);
  view.rerender(<QueryClientProvider client={new QueryClient()}><CVAIAssistance dirty/></QueryClientProvider>);
  expect(screen.getByRole('button',{name:'Create improvement preview'})).toBeDisabled();
  expect(screen.getByText(/Save the CV reader changes above first/)).toBeVisible();
});

it('allows a verified badge preview without live AI configuration',async()=>{
  state.configured=false;mount(<CVAIAssistance/>);
  fireEvent.click(await screen.findByRole('button',{name:'Preview CV addition'}));
  await waitFor(()=>expect(state.api).toHaveBeenCalledWith('/cv/ai/preview','POST',expect.objectContaining({badge_code:'FP-NET'}),expect.anything()));
  expect(state.api.mock.calls.some(([path])=>path==='/cv/ai/apply')).toBe(false);
});

it('leaves CV unchanged when the AI provider fails',async()=>{
  state.api.mockImplementation(async(path:string)=>{if(path==='/ai/status')return {configured:true};if(path==='/cv/ai/context')return context;throw new Error('AI unavailable; nothing saved.');});
  mount(<CVAIAssistance/>);await screen.findByRole('button',{name:'Preview CV addition'});
  fireEvent.click(screen.getByRole('button',{name:'Create improvement preview'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('nothing saved');
  expect(state.reload).not.toHaveBeenCalled();
});

const answers:Answers={category:'student',interests:[],work_style:'analytical',environment:'structured',motivation:'growth',weekly_hours:4,budget:100,location:'Malaysia',relocation:false,completed_step:2};
it('personalisation only updates the draft after explicit approval, retaining constraints',async()=>{
  const useAnswers=vi.fn();
  state.api.mockImplementation(async(path:string)=>path==='/ai/status'?{configured:true}:{summary:'You enjoy practical work.',explanation:'Based on your notes.',answers:{...answers,interests:['technology'],work_style:'practical'},notice:'Not saved.'});
  mount(<AIPersonalisation answers={answers} onUse={useAnswers}/>);
  fireEvent.click(screen.getByText('Prefer to describe your direction?'));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'I enjoy troubleshooting networks.'}});
  await waitFor(()=>expect(screen.getByRole('button',{name:'Suggest my preferences'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Suggest my preferences'}));
  await screen.findByRole('button',{name:'Use these answers'});
  expect(useAnswers).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Use these answers'}));
  expect(useAnswers).toHaveBeenCalledWith(expect.objectContaining({work_style:'practical',weekly_hours:4,budget:100,location:'Malaysia'}));
  expect(state.api.mock.calls.some(([,method])=>method==='PUT')).toBe(false);
});

it('match explanations are explicit and do not submit replacement scores',async()=>{
  const matches=[{id:'cloud-support',title:'Cloud support',score:40,gaps:[],skill_evidence:[]}] as unknown as Match[];
  state.api.mockImplementation(async(path:string)=>path==='/ai/status'?{configured:true}:{explanations:[{role_id:'cloud-support',explanation:'Your foundational networking evidence is relevant.'}],coverage:{unmapped_skills:[],notice:'Curated careers.'},notice:'Not a hiring prediction.'});
  mount(<AICareerExplanations matches={matches}/>);
  fireEvent.click(screen.getByText('Understand your matches with AI'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Explain my matches'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Explain my matches'}));
  expect(await screen.findByText('Your foundational networking evidence is relevant.')).toBeVisible();
  expect(state.api).toHaveBeenCalledWith('/careers/ai/explain','POST',{},expect.anything());
  expect(matches[0].score).toBe(40);
});
