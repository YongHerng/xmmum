'use client';

import {useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {ArrowUpRight,Briefcase,ChevronDown,Compass,Leaf,Newspaper,RefreshCw,ShieldCheck} from 'lucide-react';
import {api} from '@/lib/api';
import type {LiveNews} from '@/lib/sdg';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import styles from './sdg-screen.module.css';

const filters=[['all','Everything for you'],['sdg','SDG news'],['job','Job news']] as const;
type Filter=typeof filters[number][0];
const dateLabel=(value:string|null)=>value?new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'';

export default function NewsScreen(){
  const {data,demo,link}=useWorkspace();const params=useSearchParams();const router=useRouter();
  const requestedRole=params.get('role')||data.selected_role;const roleId=data.roles.some(role=>role.id===requestedRole)?requestedRole:data.selected_role;
  const [filter,setFilter]=useState<Filter>('all');const [goal,setGoal]=useState<number|null>(null);
  const search=new URLSearchParams({role_id:roleId});data.cv.skills.forEach(skill=>search.append('skills',skill));
  // Public endpoint: news is not personal, so demos work too. The query key follows the selected career and CV skills.
  const query=useQuery({queryKey:['live-news',roleId,data.cv.skills],queryFn:({signal})=>api<LiveNews>(`/sdg/live-news?${search}`,'GET',undefined,{signal,public:true,timeoutMs:30000}),enabled:!demo,staleTime:10*60*1000});
  const news:LiveNews|undefined=demo?{items:(data.news||[]).slice(0,6).map(item=>({id:String(item.id),title:item.title,url:item.source_url,source:item.source_name,published_at:null,category:'sdg' as const,sdg_number:item.id,tag:`SDG ${item.id}`})),role:data.impact.role,sdgs:data.impact.goals,partial:false,unavailable:false,disclosure_badge:'Bundled reference examples, not live headlines'}:query.data;const items=(news?.items||[]).filter(item=>(filter==='all'||item.category===filter)&&(goal===null||item.category==='job'||item.sdg_number===goal));
  return <div className={`page-enter ${styles.page}`}>
    <div className="page-title"><div><div className="section-label">STAY CURRENT</div><h1>News for your direction.</h1><p>{demo?'A hardcoded illustration of the news layout using reference topics. No current-news request is made.':'Recent headlines on the SDGs linked to your career and skills, plus job news for the role you selected.'}</p></div></div>
    <div className={styles.direction}><div><span className={styles.directionIcon}><Compass size={18}/></span><div><span className="eyebrow">NEWS FOR</span><strong>{data.roles.find(role=>role.id===roleId)?.title||news?.role||'Your direction'}</strong></div></div><label><span className="sr-only">Career direction for news</span><select aria-label="Career direction for news" value={roleId} onChange={event=>{setGoal(null);router.replace(link('/app/news',{role:event.target.value}),{scroll:false});}}>{data.roles.map(role=><option key={role.id} value={role.id}>{role.title}</option>)}</select><ChevronDown size={14} aria-hidden="true"/></label></div>
    <section className={styles.panel}>
      <div className={styles.readingToolbar}><div className={styles.filters} aria-label="Filter news">{filters.map(([value,label])=><button type="button" key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><Button variant="secondary" size="sm" disabled={Boolean(demo)||query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={14} className={query.isFetching?'spin':undefined}/>Refresh</Button></div>
      {!!news?.sdgs.length&&filter!=='job'&&<div className="chip-row" aria-label="Your goals">{[{number:0,title:'All your goals',color:''},...news.sdgs].map(sdg=><button type="button" key={sdg.number} className="chip" aria-pressed={(goal??0)===sdg.number} style={{borderColor:sdg.color||undefined,fontWeight:(goal??0)===sdg.number?700:400}} onClick={()=>setGoal(sdg.number||null)}>{sdg.number?`SDG ${sdg.number} · ${sdg.title}`:sdg.title}</button>)}</div>}
      {query.error&&<><p className="error-box" role="alert">{query.error instanceof Error?query.error.message:'Could not load news.'}</p><Button variant="secondary" onClick={()=>void query.refetch()}>Retry news</Button></>}
      {news?.unavailable&&<p className="notice" role="status">The news source could not be reached right now. Please try again in a moment.</p>}
      {news?.partial&&<p className="notice" role="status">Some topics could not be loaded. Showing what is available.</p>}
      {!demo&&query.isPending?<p role="status">Finding the latest news for you…</p>:items.length?<div className={styles.readingGrid}>{items.map(item=><article className={styles.readingCard} key={item.id}><header><span className={styles.goalPill}>{item.category==='job'?<Briefcase size={12}/>:<Leaf size={12}/>} {item.tag}</span></header><small>{item.source}{item.published_at?` · ${dateLabel(item.published_at)}`:''}</small><h3 style={{fontSize:18}}>{item.title}</h3><footer><span>{item.category==='job'?'Job market':'Sustainable development'}</span><a href={item.url} target="_blank" rel="noreferrer" aria-label={`Read ${item.title}`}>Read article <ArrowUpRight size={14}/></a></footer></article>)}</div>:!query.error&&!news?.unavailable&&<div className={styles.empty}><Newspaper size={28}/><h3>No headlines in this view.</h3><p>Try another filter or career direction.</p></div>}
      <div className={styles.disclosure}><ShieldCheck size={18}/><p>{news?.disclosure_badge||'Live headlines from Google News'}. Headlines are matched by topic and are not endorsed or verified by FutureProof.</p></div>
    </section>
  </div>;
}
