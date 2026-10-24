import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {Session} from '@supabase/supabase-js';
import {SessionProvider,useSession} from '../src/components/session-provider';

const auth=vi.hoisted(()=>({getSession:vi.fn(),callback:null as null|((event:string,session:Session|null)=>void),unsubscribe:vi.fn()}));
vi.mock('../src/lib/api',()=>({supabase:{auth:{getSession:()=>auth.getSession(),onAuthStateChange:(callback:typeof auth.callback)=>{auth.callback=callback;return {data:{subscription:{unsubscribe:auth.unsubscribe}}}}}}}));
const session=(id:string,token='test-token')=>({user:{id},access_token:token}) as Session;
function Probe(){const {session,ready,error}=useSession();return <div>{ready?'ready':'checking'}:{session?.user.id||'signed-out'}{error&&<p role="alert">{error}</p>}</div>}
function mount(){const client=new QueryClient();render(<QueryClientProvider client={client}><SessionProvider><Probe/></SessionProvider></QueryClientProvider>);return client}
beforeEach(()=>{auth.getSession.mockResolvedValue({data:{session:session('a')},error:null})});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers()});

describe('session-scoped workspace caching',()=>{
  it('does not evict warm data on same-user sign-in or token refresh',async()=>{
    const client=mount();await screen.findByText('ready:a');
    client.setQueryData(['workspace','user:a','snapshot'],{name:'Private A'});
    act(()=>auth.callback!('TOKEN_REFRESHED',session('a','new-token')));
    act(()=>auth.callback!('SIGNED_IN',session('a','new-token')));
    expect(client.getQueryData(['workspace','user:a','snapshot'])).toEqual({name:'Private A'});
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });
  it('removes all private result types on account change and sign-out but keeps public demos',async()=>{
    const client=mount();await screen.findByText('ready:a');
    for(const kind of ['snapshot','scenario','impact'])client.setQueryData(['workspace','user:a',kind],{owner:'a'});
    client.setQueryData(['workspace','demo:student','snapshot'],{public:true});
    act(()=>auth.callback!('SIGNED_IN',session('b')));
    await screen.findByText('ready:b');
    expect(client.getQueriesData({queryKey:['workspace','user:a']})).toEqual([]);
    client.setQueryData(['workspace','user:b','snapshot'],{owner:'b'});
    act(()=>auth.callback!('SIGNED_OUT',null));await screen.findByText('ready:signed-out');
    expect(client.getQueriesData({queryKey:['workspace','user:b']})).toEqual([]);
    expect(client.getQueryData(['workspace','demo:student','snapshot'])).toEqual({public:true});
  });
  it('does not overwrite a new auth event with a late getSession result',async()=>{
    let resolve!:(value:unknown)=>void;
    auth.getSession.mockReturnValue(new Promise(r=>{resolve=r}));
    mount();act(()=>auth.callback!('SIGNED_IN',session('b')));
    await screen.findByText('ready:b');
    await act(async()=>resolve({data:{session:session('a')},error:null}));
    expect(screen.getByText('ready:b')).toBeInTheDocument();
  });
  it('cannot repopulate an old account cache from an in-flight response',async()=>{
    const client=mount();await screen.findByText('ready:a');
    let resolve!:(value:unknown)=>void;
    const pending=client.fetchQuery({queryKey:['workspace','user:a','snapshot'],queryFn:()=>new Promise(r=>{resolve=r})});
    const settled=pending.catch(()=>null);
    act(()=>auth.callback!('SIGNED_IN',session('b')));
    await act(async()=>{resolve({owner:'a'});await settled});
    expect(client.getQueriesData({queryKey:['workspace','user:a']})).toEqual([]);
    expect(screen.getByText('ready:b')).toBeInTheDocument();
  });
  it('ends a stuck auth check with a recoverable error',async()=>{
    vi.useFakeTimers();auth.getSession.mockReturnValue(new Promise(()=>{}));
    mount();await act(async()=>{await vi.advanceTimersByTimeAsync(12000)});
    expect(screen.getByRole('alert')).toHaveTextContent('Session verification is taking too long');
    expect(auth.callback).toBeTypeOf('function');
  });
  it('handles a rejected initial auth check without an endless loading state',async()=>{
    auth.getSession.mockRejectedValue(new Error('Test offline'));
    mount();await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('could not verify your session'));
  });
});
