'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/api';
import { ThemeToggle } from '@/components/theme-toggle';
import styles from '@/components/auth.module.css';
const schema=z.object({email:z.email('Enter a valid email.'),password:z.string().min(8,'Use at least 8 characters.')});
export default function Auth({params}:{params:Promise<{mode:string}>}) {
  const {mode}=use(params); const register=mode==='register'; const router=useRouter();
  const [message,setMessage]=useState(''); const [error,setError]=useState('');
  const {register:field,handleSubmit,formState:{errors,isSubmitting}}=useForm<z.infer<typeof schema>>({resolver:zodResolver(schema)});
  async function submit(values:z.infer<typeof schema>) {setError('');setMessage('');try {if(!supabase)throw new Error('Add the Supabase publishable key to frontend/.env.local and restart the web server. Authentication must be configured before continuing.');const result=register?await supabase.auth.signUp({...values,options:{emailRedirectTo:window.location.origin+'/auth/login'}}):await supabase.auth.signInWithPassword(values);if(result.error)throw result.error;if(result.data.session)router.replace('/');else setMessage('Check your email to confirm your account, then sign in here.');}catch(e){setError((e as Error).message)}}
  return <main className={styles.page}>
    <div className={styles.theme}><ThemeToggle/></div>
    <section className={styles.formSection} aria-labelledby="auth-title"><div className={styles.brand}><Brand/></div><div className={styles.formContent}>
      <h1 id="auth-title">{register?'Create an account.':'Welcome back.'}</h1><p className={styles.intro}>{register?'Start your next chapter.':'Log in to your account.'}</p>
      {!supabase&&<div className="notice">Supabase setup is pending. Configure authentication to log in and continue.</div>}
      <form onSubmit={handleSubmit(submit)} aria-busy={isSubmitting}>
        <label>Email address<input type="email" autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email?'email-error':undefined} {...field('email')}/>{errors.email&&<span id="email-error" className="field-error">{errors.email.message}</span>}</label>
        <label>Password<input type="password" autoComplete={register?'new-password':'current-password'} placeholder={register?'At least 8 characters':'Your password'} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password?'password-error':undefined} {...field('password')}/>{errors.password&&<span id="password-error" className="field-error">{errors.password.message}</span>}</label>
        <div className={styles.status}>{error&&<p role="alert" className="error-box">{error}</p>}{message&&<p role="status" className="success-box">{message}</p>}</div>
        <Button type="submit" disabled={isSubmitting}>{isSubmitting?'Connecting…':register?'Create my account':'Log in'}<ArrowRight size={17}/></Button>
      </form>
      <p className={styles.switch}>{register?'Already have an account?':'New here?'} <Link href={register?'/auth/login':'/auth/register'}>{register?'Log in':'Create an account'}</Link></p>
    </div></section>
  </main>;
}
