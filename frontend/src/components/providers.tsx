'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SessionProvider } from './session-provider';
export function Providers({children}:{children:React.ReactNode}) { const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{retry:1,refetchOnWindowFocus:false,staleTime:60000}}})); return <QueryClientProvider client={client}><SessionProvider>{children}</SessionProvider></QueryClientProvider>; }
