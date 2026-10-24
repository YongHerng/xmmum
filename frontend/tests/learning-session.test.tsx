import {afterEach,expect,it,vi} from 'vitest';
import {waitFor} from '@testing-library/react';
vi.mock('../src/lib/api',()=>({API:'http://test/api/v1',supabase:null}));
afterEach(()=>{sessionStorage.clear();vi.unstubAllGlobals();vi.resetModules();});
it('does not erase a new practice session when an older request expires late',async()=>{
  const {sandboxLearningRequest:learningRequest}=await import('../src/lib/learning');
  sessionStorage.setItem('futureproof:learning-practice:student','expired-token');
  const failures:((response:unknown)=>void)[]=[];
  let sessions=0;
  const response=(status:number,data:unknown)=>({status,ok:status===200,json:async()=>data});
  vi.stubGlobal('fetch',vi.fn((url:string,options:RequestInit)=>{
    if(url.endsWith('/sessions')){sessions++;return Promise.resolve(response(200,{data:{token:'new-token-'+sessions}}));}
    if((options.headers as Record<string,string>)['X-Learning-Session']==='expired-token')
      return new Promise(resolve=>failures.push(resolve));
    return Promise.resolve(response(200,{data:{loaded:true}}));
  }));
  const first=learningRequest('student','/courses');
  const second=learningRequest('student','/courses/course-1');
  await waitFor(()=>expect(failures).toHaveLength(2));
  failures[0](response(410,{detail:'Expired.'}));
  await expect(first).resolves.toEqual({loaded:true});
  expect(sessions).toBe(1);
  failures[1](response(410,{detail:'Expired.'}));
  await expect(second).resolves.toEqual({loaded:true});
  expect(sessions).toBe(1);
  expect(sessionStorage.getItem('futureproof:learning-practice:student')).toBe('new-token-1');
  expect(vi.mocked(fetch).mock.calls.every(call=>call[1]?.cache==='no-store')).toBe(true);
});

