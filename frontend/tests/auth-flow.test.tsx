import {Suspense} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import Auth from '../src/app/auth/[mode]/page';

const auth=vi.hoisted(()=>({login:vi.fn(),signup:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:auth.replace})}));
vi.mock('../src/lib/api',()=>({supabase:{auth:{signInWithPassword:auth.login,signUp:auth.signup}}}));
vi.mock('../src/components/theme-toggle',()=>({ThemeToggle:()=>null}));
const loginParams=Promise.resolve({mode:'login'});
const registerParams=Promise.resolve({mode:'register'});
beforeEach(()=>{auth.login.mockResolvedValue({data:{session:{user:{id:'test'}}},error:null});auth.signup.mockResolvedValue({data:{session:{user:{id:'test'}}},error:null});});
afterEach(()=>{cleanup();vi.clearAllMocks();});

async function submit(mode:'login'|'register') {
  await act(async()=>{render(<Suspense fallback={<span>Loading form</span>}><Auth params={mode==='login'?loginParams:registerParams}/></Suspense>);});
  await screen.findByLabelText('Email address');
  fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'test@example.invalid'}});
  fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-password'}});
  fireEvent.click(screen.getByRole('button',{name:mode==='login'?'Log in':'Create my account'}));
}
describe('authentication leads to the main page',()=>{
  it('sends successful login to the main page instead of the workspace',async()=>{
    await submit('login');
    await waitFor(()=>expect(auth.replace).toHaveBeenCalledWith('/'));
    expect(auth.login).toHaveBeenCalledWith({email:'test@example.invalid',password:'test-password'});
    expect(screen.queryByRole('link',{name:'Student demo'})).not.toBeInTheDocument();
  });
  it('sends an immediately confirmed signup to the main page',async()=>{
    await submit('register');
    await waitFor(()=>expect(auth.replace).toHaveBeenCalledWith('/'));
  });
  it('stays on the form when account confirmation is still required',async()=>{
    auth.signup.mockResolvedValue({data:{session:null},error:null});
    await submit('register');
    await screen.findByRole('status');
    expect(auth.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Check your email');
  });
  it('keeps failed login on the form with a useful error',async()=>{
    auth.login.mockResolvedValue({data:{session:null},error:{message:'Invalid login credentials'}});
    await submit('login');
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials');
    expect(auth.replace).not.toHaveBeenCalled();
  });
});
