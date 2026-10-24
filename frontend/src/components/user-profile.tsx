'use client';

import Link from 'next/link';
import {useQuery} from '@tanstack/react-query';
import {ArrowRight,Award,BookOpen,Check,Compass,GraduationCap,Loader2,MapPin,UserRound} from 'lucide-react';
import {useWorkspace} from './workspace';
import {Button} from './ui/button';
import {learningRequest,dateLabel,type Badge,type Course} from '@/lib/learning';
import s from './profile.module.css';
import {ProviderLogo} from './provider-logo';
import {profileCategories} from '@/lib/profile-information';
import {ProfileInformation} from './profile-information';

export function UserProfile(){
  const {data,demo,identity,link}=useWorkspace();
  const scope=identity||demo||'signed-in';
  const badges=useQuery({queryKey:['hosted-learning',scope,'badges'],queryFn:()=>learningRequest<Badge[]>(demo,'/badges')});
  const courses=useQuery({queryKey:['hosted-learning',scope,'courses'],queryFn:()=>learningRequest<Course[]>(demo,'/courses')});
  const profile=data.profile;const name=profile.name||'Your profile';
  const initials=profile.name?.split(' ').map(n=>n[0]).slice(0,2).join('')||'YOU';
  const role=data.matches.length?data.roles.find(r=>r.id===data.selected_role):undefined;
  const enrolled=courses.data?.filter(c=>c.enrollment).length;
  return <div className="page-enter">
    <div className="page-title"><div><div className="section-label">YOUR FUTUREPROOF PROFILE</div><h1>A little more you. Every step forward.</h1><p>Your background, your direction and the achievements you’ve earned.</p></div></div>
    <section className={`card ${s.identity}`}>
      <div className={s.avatar} aria-hidden="true">{initials}</div>
      <div><span className="eyebrow">{demo?'DEMO PROFILE':'PERSONAL PROFILE'}</span><h2>{name}</h2><div className={s.identityMeta}><span><UserRound size={14}/>{profileCategories[profile.category]||'FutureProof member'}</span>{profile.location&&<span><MapPin size={14}/>{profile.location}</span>}</div></div>
      <Button asChild variant="secondary"><Link href={link('/app/questionnaire')}>{demo?'View preferences':'Update preferences'}<ArrowRight size={15}/></Link></Button>
    </section>
    <div className={s.layout}>
      <aside className={s.about}>
        <section className="card"><span className="icon-tile"><UserRound size={21}/></span><h2>About you</h2><dl><div><dt>Education</dt><dd>{data.cv.education||profile.education||'Not added yet'}</dd></div><div><dt>Location</dt><dd>{profile.location||'Not added yet'}</dd></div><div><dt>Your goal</dt><dd>{data.questionnaire.career_goal||profile.goal||'Not added yet'}</dd></div></dl><Link className="text-link" href={link('/app/cv')}>Open Your CV <ArrowRight size={14}/></Link></section>
        <section className="card"><span className="icon-tile teal"><Compass size={21}/></span><h2>Your direction</h2><h3>{role?.title||'Room to explore'}</h3><p>{role?.summary||'Discover career possibilities shaped by your interests and experience.'}</p><Link className="text-link" href={link('/app/results')}>Career intelligence <ArrowRight size={14}/></Link></section>
      </aside>
      <div>
        <ProfileInformation/>
        <section className={`card ${s.learningSummary}`} aria-label="Profile learning summary"><div><BookOpen size={20}/><strong>{enrolled??'—'}</strong><span>Enrolled courses</span></div><div><Award size={20}/><strong>{badges.data?.length??'—'}</strong><span>Earned badges</span></div><Link className="text-link" href={link('/app/pathway',{view:'learning'})}>My learning <ArrowRight size={14}/></Link></section>
        {courses.error&&<p className="error-box" role="alert">Learning summary unavailable. {courses.error.message}</p>}
        <div className={s.sectionHead}><div><span className="eyebrow">PROGRESS YOU CAN KEEP</span><h2>Your digital badges</h2><p>Earned by passing every chapter quiz and the final course test.</p></div><Award size={24}/></div>
        {demo&&<p className={s.practiceNote}>These hardcoded badges illustrate the expected profile outcome. They are not real awards and never contribute to a signed-in user’s career scores.</p>}
        {badges.isPending?<div className={s.empty} role="status"><Loader2 className="spin" size={24}/><p>Loading your achievements…</p></div>:badges.error?<div className={`card ${s.empty}`}><Award size={30}/><h3>We couldn’t load your badges.</h3><p role="alert">{badges.error.message}</p><Button variant="secondary" onClick={()=>badges.refetch()}>Try again</Button></div>:badges.data?.length?<div className={s.badgeGrid}>{badges.data.map(badge=><article className={`card ${s.badgeCard}`} key={badge.badge_code}>
          <div className={s.badgeArt}><Award size={48}/></div><span className="tag tag-green"><Check size={12}/>Earned</span><h3>{badge.title}</h3><div className={s.badgeIssuer}><ProviderLogo name={badge.provider} src={badge.provider_logo}/><p>{badge.provider}{badge.sample&&<small>Independent study demo</small>}</p></div>
          <dl><div><dt>Awarded to</dt><dd>{name}</dd></div><div><dt>Earned</dt><dd><time dateTime={badge.completed_at}>{dateLabel(badge.completed_at)}</time></dd></div><div><dt>Final score</dt><dd>{badge.score}% · Passed</dd></div><div><dt>Badge ID</dt><dd>{badge.badge_code}</dd></div></dl>
          {badge.skills?.length?<section aria-label="Badge skill evidence"><strong>Assessed skills</strong><div className="chip-row">{badge.skills.map(skill=><span className="chip" key={skill.skill_id}>{skill.name||skill.skill_id} · {skill.level}</span>)}</div><p className="fine-print">{badge.matching_eligible?'Used as skill evidence in your career matches.':demo?'Included in the fictional matching example only; never used in personal career scores.':'Practice evidence only; not used in personal career scores.'}</p>{badge.matching_eligible&&<Link className="text-link" href={link('/app/results')}>See updated career matches <ArrowRight size={14}/></Link>}</section>:<p className="fine-print">Completion record only. No assessed skills were assigned when this badge was earned.</p>}
          <Link className="text-link" href={link('/app/pathway',{view:'course',course:badge.course_id})}>View course timeline <ArrowRight size={14}/></Link><p className="fine-print">Platform completion badge, not an official industry certification.</p>
        </article>)}</div>:<section className={`card ${s.empty}`}><span className={s.emptyAward}><GraduationCap size={32}/></span><h3>Your first badge is ahead.</h3><p>Finish a course to add your first achievement here. Your badges will be part of this profile.</p><Button asChild variant="secondary"><Link href={link('/app/pathway',{view:'catalogue'})}>Find a course <ArrowRight size={15}/></Link></Button></section>}
      </div>
    </div>
  </div>;
}

