import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {RequireSession} from '../src/components/require-session';

const auth=vi.hoisted(()=>({state:{ready:false,session:null as unknown,error:null as string|null,retry:vi.fn()},replace:vi.fn()}));
vi.mock('../src/components/session-provider',()=>({useSession:()=>auth.state}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:auth.replace})}));
vi.mock('../src/components/theme-toggle',()=>({ThemeToggle:()=>null}));
afterEach(()=>{cleanup();vi.clearAllMocks();auth.state={ready:false,session:null,error:null,retry:vi.fn()};});

describe('login-first navigation',()=>{
  it('does not flash the main page while a session is being checked',()=>{
    render(<RequireSession><h1>Main page content</h1></RequireSession>);
    expect(screen.queryByText('Main page content')).not.toBeInTheDocument();
    expect(auth.replace).not.toHaveBeenCalled();
  });
  it('redirects signed-out visits to login without mounting protected content',async()=>{
    auth.state.ready=true;
    render(<RequireSession><h1>Main page content</h1></RequireSession>);
    await waitFor(()=>expect(auth.replace).toHaveBeenCalledWith('/auth/login'));
    expect(screen.queryByText('Main page content')).not.toBeInTheDocument();
  });
  it('shows the main page to a signed-in user',()=>{
    auth.state.ready=true;auth.state.session={user:{id:'test-user'}};
    render(<RequireSession><h1>Main page content</h1></RequireSession>);
    expect(screen.getByText('Main page content')).toBeVisible();
    expect(auth.replace).not.toHaveBeenCalled();
  });
  it('offers a retry on an auth error without treating it as a successful sign-in',()=>{
    auth.state.ready=true;auth.state.error='Connection unavailable';
    render(<RequireSession><h1>Main page content</h1></RequireSession>);
    fireEvent.click(screen.getByRole('button',{name:'Retry session'}));
    expect(auth.state.retry).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).toHaveTextContent('Connection unavailable');
    expect(screen.queryByText('Main page content')).not.toBeInTheDocument();
  });
});
