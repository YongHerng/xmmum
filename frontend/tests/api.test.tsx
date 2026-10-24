import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

const auth=vi.hoisted(()=>({getSession:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getSession:auth.getSession}})}));
let api:typeof import('../src/lib/api').api;
beforeEach(async()=>{
  vi.resetModules();vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','test-public-key');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://test.invalid');
  auth.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}}});
  api=(await import('../src/lib/api')).api;
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks();vi.useRealTimers()});
const success=()=>new Response(JSON.stringify({data:{ok:true}}),{headers:{'Content-Type':'application/json'}});

describe('bounded API requests',()=>{
  it('uses labelled offline data only for explicit public demo GET requests',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const result=await api<import('../src/lib/types').Snapshot>('/demo/professional?role_id=data-analyst&scenario=rapid&horizon=10','GET',undefined,{public:true});
    expect(result.offline_demo).toBe(true);expect(result.profile.name).toBe('Daniel Lim');expect(result.forecast.scenario).toBe('rapid');expect(result.forecast.horizon).toBe(10);
    expect((result.news??[]).map(item=>item.id).sort((a,b)=>a-b)).toEqual(Array.from({length:17},(_,index)=>index+1));
    for(const path of ['/dashboard','/sdg/impact-path','/demo/unknown'])await expect(api(path,'GET',undefined,{public:true})).rejects.toThrow('Failed to fetch');
    await expect(api('/demo/student')).rejects.toThrow('Failed to fetch');
  });
  it('does not hide HTTP or write failures behind fictional data',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({detail:'Unavailable'}),{status:503})));
    await expect(api('/jobs','GET',undefined,{public:true})).rejects.toThrow('Unavailable');
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/cv','PUT',{skills:['SQL']})).rejects.toThrow('Failed to fetch');
  });
  it('public demos skip auth and avoid unnecessary JSON GET/preflight headers',async()=>{
    auth.getSession.mockReturnValue(new Promise(()=>{}));
    const fetch=vi.fn().mockResolvedValue(success());vi.stubGlobal('fetch',fetch);
    const result=await api<import('../src/lib/types').Snapshot>('/demo/student','GET',undefined,{public:true});
    expect(result.profile.name).toBe('Aisha Rahman');
    expect(result.demo_outcomes?.career.search?.jobs).toHaveLength(3);
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('uses the supplied session token without acquiring the auth lock again',async()=>{
    const fetch=vi.fn().mockResolvedValue(success());vi.stubGlobal('fetch',fetch);
    await api('/dashboard','GET',undefined,{accessToken:'current-token'});
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].headers).toEqual({Authorization:'Bearer current-token'});
  });
  it('keeps authenticated JSON writes unchanged',async()=>{
    const fetch=vi.fn().mockResolvedValue(success());vi.stubGlobal('fetch',fetch);
    await api('/profile','PUT',{name:'Test'});
    expect(fetch.mock.calls[0][1]).toMatchObject({method:'PUT',headers:{Authorization:'Bearer test-token','Content-Type':'application/json'},body:'{"name":"Test"}'});
  });
  it('times out even when session acquisition never settles',async()=>{
    vi.useFakeTimers();auth.getSession.mockReturnValue(new Promise(()=>{}));
    const pending=api('/dashboard','GET',undefined,{timeoutMs:100});
    const assertion=expect(pending).rejects.toThrow('taking too long');
    await vi.advanceTimersByTimeAsync(100);await assertion;
  });
  it('cancels superseded public reads using the query signal',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise(()=>{})));
    const controller=new AbortController();
    const pending=api('/demo/student','GET',undefined,{signal:controller.signal,public:true});
    const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});
    controller.abort();await assertion;
  });
  it('does not start network I/O when synchronously cancelled before mount settles',async()=>{
    const fetch=vi.fn().mockResolvedValue(success());vi.stubGlobal('fetch',fetch);
    const controller=new AbortController();
    const pending=api('/demo/student','GET',undefined,{signal:controller.signal,public:true});
    const assertion=expect(pending).rejects.toMatchObject({name:'AbortError'});
    controller.abort();await assertion;
    expect(fetch).not.toHaveBeenCalled();
  });
});
