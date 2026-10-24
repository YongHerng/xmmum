import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Workspace} from '../src/components/workspace';

vi.mock('next/navigation',()=>({usePathname:()=>'/app/dashboard',useSearchParams:()=>new URLSearchParams('demo=student'),useParams:()=>({}),useRouter:()=>({replace:vi.fn()})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:undefined,error:null,isFetching:false}),useQueryClient:()=>({clear:vi.fn()})}));
vi.mock('../src/components/session-provider',()=>({useSession:()=>({session:null,ready:true,error:null,retry:vi.fn()})}));
vi.mock('../src/components/theme-toggle',()=>({ThemeToggle:()=>null}));
vi.mock('../src/lib/api',()=>({api:vi.fn(),supabase:null}));
beforeEach(()=>{localStorage.clear();vi.stubGlobal('matchMedia',(query:string)=>({matches:query.includes('1024')||query.includes('reduced-motion'),addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('collapses without losing accessible link names and shows keyboard tooltips',()=>{
  const view=render(<Workspace><span>Example screen</span></Workspace>);
  fireEvent.click(screen.getByRole('button',{name:'Collapse sidebar'}));
  expect(view.container.querySelector('.workspace')).toHaveAttribute('data-sidebar-collapsed','true');
  expect(localStorage.getItem('futureproof-sidebar-collapsed')).toBe('true');
  const career=screen.getByRole('link',{name:'Career matches'});
  fireEvent.focus(career);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Career matches');
  expect(career).toHaveAttribute('aria-describedby','rail-tooltip');
  fireEvent.click(screen.getByRole('button',{name:'Expand sidebar'}));
  expect(view.container.querySelector('.workspace')).toHaveAttribute('data-sidebar-collapsed','false');
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
});
it('restores a compact sidebar after remounting',()=>{
  localStorage.setItem('futureproof-sidebar-collapsed','true');
  render(<Workspace><span>Example screen</span></Workspace>);
  expect(screen.getByRole('button',{name:'Expand sidebar'})).toHaveAttribute('aria-expanded','false');
});
