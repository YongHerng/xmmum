import { createClient } from '@supabase/supabase-js';
import { authSessionStorage } from './session-storage';
const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
export const supabase=key && url ? createClient(url,key,{auth:{storage:authSessionStorage,persistSession:true}}) : null;
export const API=process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api/v1';
type RequestOptions = { signal?: AbortSignal; public?: boolean; accessToken?: string; timeoutMs?: number };
export async function api<T>(path:string, method='GET', body?:unknown, options:RequestOptions={}):Promise<T> {
  // Public expected-outcome demos are bundled, so provider/backend outages cannot break them.
  // Never substitute fixtures for an authenticated account request.
  if(options.public&&method==='GET'&&/^\/demo\/(student|professional)(\?|$)/.test(path)){
    options.signal?.throwIfAborted();
    const {offlineDemo}=await import('./offline-demo');
    const example=await offlineDemo(path);
    options.signal?.throwIfAborted();
    if(example)return example as T;
    throw new Error('This demo view is not available. Choose a supported example.');
  }
  const controller=new AbortController();
  const abort=()=>controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  if(options.signal?.aborted)controller.abort();
  let timedOut=false;
  const aiAction=/^\/(?:cv\/(?:analyze|parse|ai\/preview)|questionnaire\/ai\/preview|careers\/ai\/explain|sdg\/summary$|jobs\/(?:outlook|rematch))/.test(path);
  const timer=setTimeout(()=>{timedOut=true;controller.abort()},options.timeoutMs??(path==='/jobs/search'?270000:aiAction?200000:15000));
  const cancelled=new Promise<never>((_resolve,reject)=>controller.signal.addEventListener('abort',()=>reject(new DOMException('Request cancelled','AbortError')),{once:true}));
  try {
    const request=async()=>{
      // Let a synchronous unmount/Strict Mode replay cancel before starting I/O.
      await Promise.resolve();
      controller.signal.throwIfAborted();
      // Public demos never wait on auth or send a private bearer token.
      const token=options.public?undefined:options.accessToken??(supabase?(await supabase.auth.getSession()).data.session?.access_token:undefined);
      controller.signal.throwIfAborted();
      const form=body instanceof FormData;
      const response=await fetch(`${API}${path}`,{method,signal:controller.signal,headers:{...(body!==undefined&&!form?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:form?body:JSON.stringify(body)});
      const result=await response.json().catch(()=>({detail:'The API returned an unreadable response.'}));
      if(!response.ok)throw new Error(result.detail||'The request failed. Please retry.');
      return result.data as T;
    };
    return await Promise.race([request(),cancelled]);
  } catch(error) {
    if(timedOut)throw new Error('The service is taking too long to respond. Please retry.');
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort',abort);
  }
}
