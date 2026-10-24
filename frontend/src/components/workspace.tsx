'use client';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, UserRound, ArrowRight, ArrowUpRight, CheckCircle2, CircleHelp, Compass, FileText, GraduationCap, Home, LayoutDashboard, Leaf, LogOut, Menu, MessagesSquare, Newspaper, PanelLeftClose, PanelLeftOpen, RefreshCw, X } from 'lucide-react';
import { api, supabase } from '@/lib/api';
import type { Snapshot } from '@/lib/types';
import {profilePaths,profileSetupComplete,requiredSetupPath,setupAllows} from '@/lib/onboarding';
import { Brand } from './brand';
import { Button } from './ui/button';
import { useSession } from './session-provider';
import { WorkspaceLoading } from './workspace-loading';
import { ThemeToggle } from './theme-toggle';
import s from './workspace.module.css';
import { motion } from 'motion/react';
import { useReducedMotionPreference } from '@/lib/use-reduced-motion';

type WorkspaceValue={data:Snapshot;demo:string|null;identity:string;scenario:'moderate'|'rapid';setScenario:(s:'moderate'|'rapid')=>void;horizon:3|5|10;setHorizon:(n:3|5|10)=>void;link:(path:string,params?:Record<string,string>)=>string;reload:()=>Promise<unknown>};
const Context=createContext<WorkspaceValue|null>(null);
export function useWorkspace(){const value=useContext(Context);if(!value)throw new Error('Missing workspace');return value;}
const navigation=[['/app/dashboard','Overview',LayoutDashboard],['/app/profile','My profile',UserRound],['/app/cv','Your CV',FileText],['/app/questionnaire','Discover yourself',Compass],['/app/results','Career matches',Compass],['/app/pathway','Learning pathway',GraduationCap],['/app/sdg','SDG impact',Leaf],['/app/community','Community',MessagesSquare],['/app/news','News',Newspaper]] as const;
export function Workspace({children}:{children:React.ReactNode}) {
  const reduced=useReducedMotionPreference();
  const pathname=usePathname();const params=useSearchParams();const router=useRouter();const client=useQueryClient();
  const route=useParams<{persona?:string}>();const persona=route.persona;
  const demo=persona||params.get('demo');const role=params.get('role');
  const classroom=pathname==='/app/pathway'&&params.get('view')==='learn'&&Boolean(params.get('course'));
  const [scenario,setScenario]=useState<'moderate'|'rapid'>('moderate');const [horizon,setHorizon]=useState<3|5|10>(5);
  const {session,ready,error:authError,retry:retryAuth}=useSession();const [mobile,setMobile]=useState(false);
  const [desktop,setDesktop]=useState(false);const sidebarRef=useRef<HTMLElement>(null);
  const [collapsed,setCollapsed]=useState(false);
  const [railTooltip,setRailTooltip]=useState<{label:string;top:number}|null>(null);
  const [logoutError,setLogoutError]=useState('');
  const [guideError,setGuideError]=useState('');
  useEffect(()=>{try{setCollapsed(localStorage.getItem('futureproof-sidebar-collapsed')==='true')}catch{}},[]);
  useEffect(()=>setRailTooltip(null),[collapsed,desktop]);
  function toggleSidebar(){setRailTooltip(null);setCollapsed(previous=>{const next=!previous;try{localStorage.setItem('futureproof-sidebar-collapsed',String(next))}catch{}return next})}
  function showRailTooltip(label:string,element:HTMLElement){if(desktop&&collapsed){const box=element.getBoundingClientRect();setRailTooltip({label,top:box.top+box.height/2})}}

  useEffect(()=>{const media=window.matchMedia('(min-width:1024px)');const update=()=>{setDesktop(media.matches);if(media.matches)setMobile(false)};update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);
  useEffect(()=>{
    if(!mobile||desktop||classroom)return;
    const previous=document.activeElement as HTMLElement|null;const sidebar=sidebarRef.current;
    const originalOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const focusable=()=>Array.from(sidebar?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')||[]);
    focusable().find(el=>el.getAttribute('aria-label')==='Close navigation')?.focus();
    const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setMobile(false)}if(event.key==='Tab'){const items=focusable();const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
    document.addEventListener('keydown',keydown);return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=originalOverflow;previous?.focus()};
  },[mobile,desktop,classroom]);
  const identity=demo?`demo:${demo}`:`user:${session?.user.id??'signed-out'}`;
  const query=useQuery({
    queryKey:['workspace',identity,'snapshot',demo?scenario:'',demo?role||'':'',demo?horizon:''],
    queryFn:({signal})=>api<Snapshot>(demo?`/demo/${demo}?scenario=${scenario}&horizon=${horizon}${role?`&role_id=${encodeURIComponent(role)}`:''}`:'/dashboard','GET',undefined,{signal,public:Boolean(demo),accessToken:session?.access_token}),
    enabled:Boolean(demo)||(ready&&!authError&&Boolean(session)),
    staleTime:demo?5*60*1000:60000,
    retry:false,
    // Keep the current view while changing a demo scenario; NEVER bridge personas/accounts.
    placeholderData:(previous,previousQuery)=>previousQuery?.queryKey[1]===identity?previous:undefined,
  });
  const previous=useRef<{identity:string;data:Snapshot}|null>(null);
  useEffect(()=>{if(query.data&&!query.isPlaceholderData)previous.current={identity,data:query.data}},[identity,query.data,query.isPlaceholderData]);
  const link=(path:string,extra?:Record<string,string>)=>{const q=new URLSearchParams(extra);if(demo)q.set('demo',demo);return path+(q.size?'?'+q:'');};
  async function logout(){setLogoutError('');try{const result=await supabase?.auth.signOut({scope:'local'});if(result?.error)throw result.error;client.clear();router.replace('/auth/login');}catch{setLogoutError('Could not log out. Please try again.');}}
  const active=persona?'/app/dashboard':pathname;
  const data=query.data||(query.isError&&previous.current?.identity===identity?previous.current.data:undefined);
  const profileComplete=Boolean(data&&profileSetupComplete(data));
  // The URL restores the correct sidebar after refresh, direct links and history navigation.
  const profileNav=profileComplete&&profilePaths.includes(pathname);
  const sidebarCollapsed=collapsed&&!profileNav;
  function openProfileNavigation(){setRailTooltip(null);if(!desktop)setMobile(true);}
  useEffect(()=>{
    // Entering a feature through any link also finishes the introduction.
    if(demo||!data?.onboarding?.feature_guide_pending||!profileComplete||!navigation.slice(4).some(([path])=>path===active))return;
    let current=true;setGuideError('');
    void api('/onboarding/guide/complete','POST',undefined,{accessToken:session?.access_token}).then(()=>{
      if(current)return client.invalidateQueries({queryKey:['workspace',identity]});
    }).catch(()=>{if(current)setGuideError('Could not save introduction progress. You can keep using this page and retry from Overview.');});
    return()=>{current=false;};
  },[active,identity,demo,data?.onboarding?.feature_guide_pending,profileComplete,session?.access_token,client]);
  const setupPath=data?requiredSetupPath(data,demo):null;
  const setupRedirect=Boolean(setupPath&&!setupAllows(pathname,setupPath));
  useEffect(()=>{if(setupRedirect&&setupPath)router.replace(setupPath);},[setupRedirect,setupPath,router]);
  const showingPrevious=Boolean(demo&&data&&(query.isPlaceholderData||query.isError));
  const title=navigation.find(([path])=>path===active)?.[1]||'Your future';
  const navItems=(items:typeof navigation[number][])=>items.map(([path,label,Icon])=>!setupAllows(path,setupPath)?<span key={path} role="link" aria-label={label} aria-disabled="true" className="sidebar-link" style={{opacity:.45,cursor:'not-allowed'}} title="Complete both setup steps to unlock this page"><Icon size={21}/><span className="nav-label">{label}</span></span>:<Link key={path} href={link(path)} aria-label={label} aria-describedby={railTooltip?.label===label?'rail-tooltip':undefined} aria-current={active===path?'page':undefined} onClick={()=>{setMobile(false);setRailTooltip(null)}} onMouseEnter={event=>showRailTooltip(label,event.currentTarget)} onMouseLeave={()=>setRailTooltip(null)} onFocus={event=>showRailTooltip(label,event.currentTarget)} onBlur={()=>setRailTooltip(null)} className={`sidebar-link ${active===path?'active':''}`}><Icon size={21}/><span className="nav-label">{label}</span></Link>);
  return <div className={`workspace ${classroom?s.focusShell:''}`} data-sidebar-collapsed={sidebarCollapsed} data-navigation={profileNav?'profile':'main'}><a className="skip-link" href="#main-content">Skip to content</a>
  {!classroom&&<aside ref={sidebarRef} id="workspace-navigation" inert={!desktop&&!mobile} aria-hidden={!desktop&&!mobile} role={!desktop&&mobile?'dialog':undefined} aria-modal={!desktop&&mobile?true:undefined} aria-label={profileNav?'Profile navigation':'Workspace navigation'} className={`sidebar ${mobile?'sidebar-open':''}`}>
    <div className="sidebar-brand"><Brand/>{!profileNav&&<button type="button" className="icon-button sidebar-collapse" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-navigation" onClick={toggleSidebar}>{collapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</button>}<button className="icon-button mobile-close" onClick={()=>setMobile(false)} aria-label="Close navigation"><X size={20}/></button></div>
    <nav aria-label={profileNav?'Profile':'Workspace'}>
      {profileNav?<><button type="button" className={`sidebar-link ${s.back}`} onClick={()=>{setMobile(false);setRailTooltip(null);router.push(link('/app/dashboard'));}}><ArrowLeft size={20}/><span>Back to main navigation</span></button><div className="sidebar-group"><span className="sidebar-label">YOUR PROFILE</span>{navItems(navigation.slice(1,4))}</div></>:<>{navItems(navigation.slice(0,1))}
      {data&&!profileComplete&&<div className="sidebar-group"><span className="sidebar-label">MY PROFILE</span>{navItems(navigation.slice(1,4))}</div>}
      <div className="sidebar-group"><span className="sidebar-label">EXPLORE</span>{navItems(navigation.slice(4))}</div></>}
    </nav>
    <div className="sidebar-bottom">
      <div className="profile-bottom"><div className="small-avatar" role="img" aria-label={data?.profile.name||'Your profile'}>{data?.profile.name?.split(' ').map(n=>n[0]).slice(0,2).join('')||'YOU'}</div><div><strong>{data?.profile.name||session?.user.email?.split('@')[0]||'Your workspace'}</strong><small>{demo?'Fictional demo profile':'Personal account'}</small></div>{session&&<button className="icon-button" aria-label="Log out" onClick={logout}><LogOut size={17}/></button>}</div>
      {!profileNav&&<div className="sidebar-utilities"><Link href="/" className="sidebar-link" aria-label="Main page" onMouseEnter={event=>showRailTooltip('Main page',event.currentTarget)} onMouseLeave={()=>setRailTooltip(null)} onFocus={event=>showRailTooltip('Main page',event.currentTarget)} onBlur={()=>setRailTooltip(null)}><Home size={20}/><span className="nav-label">Main page</span></Link>
      <Link href="/#how-it-works" className="sidebar-link" aria-label="How it works" onMouseEnter={event=>showRailTooltip('How it works',event.currentTarget)} onMouseLeave={()=>setRailTooltip(null)} onFocus={event=>showRailTooltip('How it works',event.currentTarget)} onBlur={()=>setRailTooltip(null)}><CircleHelp size={19}/><span className="nav-label">How it works</span></Link></div>}
    </div>
  </aside>}
  {!classroom&&desktop&&sidebarCollapsed&&railTooltip&&<div id="rail-tooltip" role="tooltip" className="rail-tooltip" style={{top:railTooltip.top}}>{railTooltip.label}</div>}
  {!classroom&&mobile&&<button className="sidebar-scrim" onClick={()=>setMobile(false)} aria-label="Close navigation"/>}
  <div className="workspace-body" inert={mobile&&!desktop&&!classroom}>
    <header className="app-header">{classroom?<div className={s.focusBrand}><Brand/><span className={s.focusLabel}>Learning workspace</span></div>:<div className="header-context">
      <button className="icon-button menu-toggle" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={mobile} onClick={()=>setMobile(true)}><Menu size={21}/></button>
      {demo?<div className="demo-banner"><span className="demo-indicator" aria-hidden="true"/><strong>{demo==='student'?'Aisha’s':'Daniel’s'} demo workspace</strong><span className="demo-description">Fictional profile · Read-only</span></div>:<span className="breadcrumb"><span className="breadcrumb-root">Your workspace</span><span className="breadcrumb-separator">/</span><strong>{title}</strong></span>}
    </div>}<div className="header-right"><ThemeToggle/>{classroom?<><Link className={s.exitLink} href={link('/app/pathway',{view:'learning'})}><ArrowLeft size={15}/>My learning</Link><Link className={s.avatarLink} href={link(setupPath||'/app/profile')} aria-label="My profile" aria-controls="workspace-navigation" onClick={openProfileNavigation}><UserRound size={18}/></Link></>:<>{data&&<button className="icon-button refresh-workspace" aria-label="Refresh workspace" title="Refresh workspace" disabled={query.isFetching} onClick={()=>query.refetch()}><RefreshCw size={17} className={query.isFetching?'spin':undefined}/></button>}<Link className="icon-button" href={link(setupPath||'/app/profile')} aria-label="My profile" aria-controls="workspace-navigation" onClick={openProfileNavigation}><UserRound size={18}/></Link></>}</div></header>
    <main id="main-content" className="main-content">{demo&&data?.offline_demo&&<p className="notice" role="status">Backup-ready demo · Bundled expected outcomes. No AI, job API or account data is used. <button type="button" className="text-link" onClick={()=>void query.refetch()}>Reload example data</button></p>}{logoutError&&<p role="alert" className="error-box">{logoutError}</p>}{guideError&&<p role="alert" className="error-box">{guideError}</p>}
  {!demo&&!ready?<WorkspaceLoading/>:!demo&&authError?<div className="center-state"><h2>We couldn’t verify your session.</h2><p role="alert">{authError}</p><Button onClick={retryAuth}>Retry session</Button><Link href="/demo/student">Explore demo</Link></div>:!demo&&!session?<div className="center-state"><Compass size={35}/><h2>Your future starts here.</h2><p>Sign in to save your profile, or explore a fictional demo.</p><div className="two-buttons"><Button asChild><Link href="/auth/login">Log in <ArrowRight size={17}/></Link></Button><Button asChild variant="secondary"><Link href="/demo/student">Explore demo</Link></Button></div></div>:data?<>
    <div className="workspace-sync" aria-live="polite">{query.isFetching?'Updating workspace… Your current view stays available.':query.error?<span role="alert">Could not update: {query.error.message} Showing the last loaded version. <button className="text-link" onClick={()=>query.refetch()}>Retry update</button></span>:null}</div>
    {setupPath&&!setupRedirect&&<section className={s.setup} aria-label="Required account setup"><div><span className="section-label">REQUIRED SETUP</span><strong>{setupPath==='/app/cv'?'Step 1 of 2 · Upload and confirm your CV':'Step 2 of 2 · Discover yourself'}</strong><p>Complete both steps to unlock your personal workspace.</p></div><ol><li data-complete={data.onboarding?.cv_confirmed}>1. Upload and confirm CV</li><li aria-current={setupPath==='/app/questionnaire'?'step':undefined}>2. Complete Discover Yourself</li></ol></section>}
    <Context.Provider key={identity} value={{data,demo,identity,scenario:showingPrevious?data.forecast.scenario as 'moderate'|'rapid':scenario,setScenario,horizon:showingPrevious?data.forecast.horizon as 3|5|10:horizon,setHorizon,link,reload:async()=>{await client.invalidateQueries({queryKey:['workspace',identity],refetchType:'none'});return query.refetch({throwOnError:true})}}}><motion.div key={active} className="workspace-route" initial={reduced?false:{y:12,opacity:.65}} animate={{y:0,opacity:1}} transition={reduced?{duration:0}:{duration:.4,ease:[.22,1,.36,1]}}>{setupRedirect?<WorkspaceLoading/>:children}</motion.div></Context.Provider>
  </>:query.error?<div className="center-state"><CircleHelp size={35}/><h2>We couldn’t load your workspace.</h2><p role="alert">{query.error.message}</p><Button onClick={()=>query.refetch()}>Try again</Button><Link href="/demo/student">Explore the student demo</Link></div>:<WorkspaceLoading/>}
  <footer className="app-footer"><span><CheckCircle2 size={13}/> Your direction. Your decision.</span><span>{demo?'Fictional demo · Curated career data':'Source-based vacancies · AI guidance'}<span className="footer-dot">·</span><Link href="/#how-it-works">How it works <ArrowUpRight size={12}/></Link></span></footer></main></div></div>;
}
