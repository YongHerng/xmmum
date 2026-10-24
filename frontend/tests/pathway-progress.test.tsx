import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {LegacyPathway} from '../src/components/screens';
import type {Plan,Snapshot} from '../src/lib/types';

const {call,reload}=vi.hoisted(()=>({call:vi.fn(),reload:vi.fn()}));
const key=['workspace','user:test','snapshot','','',''];
vi.mock('../src/components/workspace',async()=>{
  const {useQuery}=await import('@tanstack/react-query');
  return {useWorkspace:()=>{const {data}=useQuery({queryKey:['workspace','user:test','snapshot','','',''],queryFn:async()=>null,enabled:false});return {data,demo:null,identity:'user:test',link:(path:string)=>path,reload};}};
});
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('../src/lib/api',()=>({api:(...args:unknown[])=>call(...args)}));
vi.mock('../src/lib/use-reduced-motion',()=>({useReducedMotionPreference:()=>true}));

const plan:Plan={id:'fast',role_id:'data-analyst',role_title:'Data Analyst',kind:'fastest',title:'Fastest Transition',hours:6,weeks:1,cost:0,weekly_hours:6,completed_steps:[],uncovered_skills:[],note:'Study estimate.',steps:[{id:'learn',title:'Learn data concepts',provider:'Microsoft Learn',url:'https://learn.microsoft.com/training/',skills:['SQL'],covered_skills:['SQL'],hours:6,cost:0,price_note:'Free'}]};
function mount(){
  const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
  const data={questionnaire:{location:'Singapore'},selected_role:plan.role_id,roles:[{id:plan.role_id,title:plan.role_title}],pathways:[plan,{...plan,id:'low',kind:'lowest-cost',title:'Lowest-Cost Transition'}]} as Snapshot;
  client.setQueryData(key,data);client.setQueryData(['workspace','user:other','snapshot'],data);
  render(<QueryClientProvider client={client}><LegacyPathway/></QueryClientProvider>);
  return client;
}
afterEach(()=>{cleanup();vi.clearAllMocks()});

it('updates completion immediately, applies the response and avoids a dashboard download',async()=>{
  let finish!:(value:Plan)=>void;
  call.mockImplementation(()=>new Promise<Plan>(resolve=>{finish=resolve}));
  const client=mount();
  expect(screen.queryByRole('button',{name:/Choose this pathway/i})).not.toBeInTheDocument();
  expect(screen.getAllByText(/SGD/).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(()=>expect(screen.getByRole('checkbox')).toBeChecked());
  expect(screen.getByText('100%')).toBeInTheDocument();
  expect(screen.getByRole('checkbox')).toBeDisabled();
  expect(client.getQueryData<Snapshot>(['workspace','user:other','snapshot'])!.pathways[0].completed_steps).toEqual([]);
  await act(async()=>finish({...plan,completed_steps:['learn'],selected:true}));
  await waitFor(()=>expect(screen.getByRole('checkbox')).toBeEnabled());
  expect(screen.getByText('Your active learning pathway')).toBeInTheDocument();
  expect(call).toHaveBeenCalledTimes(1);
  expect(call).toHaveBeenCalledWith('/pathways/fast/progress','PATCH',{step_id:'learn',complete:true});
  expect(reload).not.toHaveBeenCalled();
});

it('restores the prior progress and selected plan when saving fails',async()=>{
  let fail!:(reason:Error)=>void;
  call.mockImplementation(()=>new Promise((_resolve,reject)=>{fail=reject}));
  const client=mount();fireEvent.click(screen.getByRole('checkbox'));
  await waitFor(()=>expect(screen.getByRole('checkbox')).toBeChecked());
  await act(async()=>fail(new Error('Could not save progress')));
  await waitFor(()=>expect(screen.getByRole('checkbox')).not.toBeChecked());
  expect(screen.getByRole('alert')).toHaveTextContent('Could not save progress');
  expect(client.getQueryData<Snapshot>(key)!.pathways[0].selected).toBeUndefined();
  expect(reload).not.toHaveBeenCalled();
});

it('selects a plan through its existing option card without a second choose button',async()=>{
  call.mockResolvedValue({...plan,id:'low',kind:'lowest-cost',title:'Lowest-Cost Transition',selected:true});
  const client=mount();fireEvent.click(screen.getByRole('button',{name:/Lowest-Cost Transition/}));
  await waitFor(()=>expect(call).toHaveBeenCalledWith('/pathways/low/select','POST'));
  await waitFor(()=>expect(client.getQueryData<Snapshot>(key)!.pathways.find(p=>p.id==='low')!.selected).toBe(true));
  expect(screen.getByRole('button',{name:/Lowest-Cost Transition/})).toHaveAttribute('aria-pressed','true');
  expect(reload).not.toHaveBeenCalled();
});
