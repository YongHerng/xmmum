'use client';

import type {ReactNode} from 'react';
import {useParams,useSearchParams} from 'next/navigation';
import {RequireSession} from './require-session';

export function WorkspaceAccess({children}:{children:ReactNode}) {
  const route=useParams<{persona?:string}>();
  const search=useSearchParams();
  const persona=route.persona||search.get('demo');
  if(persona==='student'||persona==='professional')return children;
  return <RequireSession>{children}</RequireSession>;
}
