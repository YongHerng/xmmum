'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/api';

type AuthState = { session: Session | null; ready: boolean; error: string | null; retry: () => void };
const AuthContext = createContext<AuthState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [state, setState] = useState<Omit<AuthState, 'retry'>>({ session: null, ready: !supabase, error: null });
  const [attempt, setAttempt] = useState(0);
  const identity = useRef<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let authEvents = 0;
    const timer = window.setTimeout(() => {
      if (active) setState(s => ({ ...s, ready: true, error: 'Session verification is taking too long. Please retry.' }));
    }, 12000);
    const accept = (session: Session | null) => {
      if (!active) return;
      window.clearTimeout(timer);
      const next = session?.user.id ?? null;
      if (identity.current !== next) {
        // Never carry private snapshots, scenario results, or impact data across accounts.
        // Refreshing a token for the SAME account must not destroy its warm cache.
        client.removeQueries({ predicate: q => (q.queryKey[0] === 'workspace' && String(q.queryKey[1]).startsWith('user:')) || q.queryKey[0] === 'hosted-learning' });
        identity.current = next;
      }
      setState({ session, ready: true, error: null });
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEvents++;
      accept(session);
    });
    // An auth event takes precedence over an older getSession promise.
    supabase.auth.getSession().then(result => {
      if (!active || authEvents) return;
      if (result.error) throw result.error;
      accept(result.data.session);
    }).catch(() => {
      if (active && !authEvents) {
        window.clearTimeout(timer);
        setState({ session: null, ready: true, error: 'We could not verify your session. Please retry.' });
      }
    });
    return () => { active = false; window.clearTimeout(timer); data.subscription.unsubscribe(); };
  }, [client, attempt]);

  return <AuthContext.Provider value={{ ...state, retry: () => {
    setState(s => ({ ...s, ready: false, error: null }));
    setAttempt(n => n + 1);
  } }}>{children}</AuthContext.Provider>;
}

export function useSession() {
  const state = useContext(AuthContext);
  if (!state) throw new Error('Missing session provider');
  return state;
}
