import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {WorkspaceIntroduction} from '../src/components/workspace-introduction';

const state=vi.hoisted(()=>({api:vi.fn(),reload:vi.fn(),push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:state.push})}));
vi.mock('../src/lib/api',()=>({api:(...args:unknown[])=>state.api(...args)}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({reload:state.reload,link:(path:string)=>path})}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
function mount(){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{mutations:{retry:false}}})}><WorkspaceIntroduction/></QueryClientProvider>);}

it('explains each core function and records completion before entering a chosen function',async()=>{
  state.api.mockResolvedValue({});state.reload.mockResolvedValue({});mount();
  for(const title of ['Career matches','Learning pathway','SDG impact','Community','News'])expect(screen.getByRole('heading',{name:title})).toBeVisible();
  expect(screen.getByText(/Find courses, build skills/)).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Open learning pathway'}));
  await waitFor(()=>expect(state.push).toHaveBeenCalledWith('/app/pathway'));
  expect(state.api).toHaveBeenCalledWith('/onboarding/guide/complete','POST');
  expect(state.reload).toHaveBeenCalledOnce();
});

it('keeps failed completion explicit and allows retry without claiming it was saved',async()=>{
  state.api.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValue({});state.reload.mockResolvedValue({});mount();
  fireEvent.click(screen.getByRole('button',{name:'Go to my overview'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted');expect(state.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Go to my overview'}));
  await waitFor(()=>expect(state.push).toHaveBeenCalledWith('/app/dashboard'));
});
