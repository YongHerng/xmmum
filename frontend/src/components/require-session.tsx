'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from './session-provider';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';
import { Button } from './ui/button';

export function RequireSession({children}:{children:ReactNode}) {
  const {session,ready,error,retry}=useSession();
  const router=useRouter();
  useEffect(()=>{if(ready&&!error&&!session)router.replace('/auth/login');},[ready,error,session,router]);
  if(ready&&!error&&session)return children;
  return <div className="session-gate"><header><Brand/><ThemeToggle/></header><main>
    {error?<><h1>Let’s reconnect.</h1><p role="alert">{error}</p><Button onClick={retry}>Retry session</Button><Link className="text-link" href="/auth/login">Return to log in</Link></>:<><h1>{ready?'Taking you to log in.':'Checking your session.'}</h1><p role="status">Your next chapter is just a moment away.</p></>}
  </main></div>;
}
