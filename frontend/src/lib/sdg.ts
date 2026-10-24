import type {CV,Impact} from './types';

export type SkillMapping={skill_id:string;skill_name:string;acquired:boolean;sdg_number:number;sdg_title:string;un_target:string;mapping_rationale:string;source_citation:string;source_url:string};
export type SDGImpact=Impact&{role_summary?:string;skill_mappings?:SkillMapping[];generation_engine?:string;simulation?:boolean;disclosure_badge?:string};
export type ReadingItem={id:number;title:string;summary:string;source_name:string;source_url:string;source_kind:string;publication_date:string|null;sdg_tags:string[];skill_tags:string[];is_recommended:boolean;recommendation_reason:string};
export type CommunityComment={id:string;author:string;text:string;timestamp:string;is_owner?:boolean};
export type CommunityPost={id:string;author_name:string;author_role:string;author_sdg_title:string;author_avatar:string;content:string;sdg_badge:string;skill_tag:string;likes_count:number;liked:boolean;is_owner:boolean;comments:CommunityComment[];created_at_label:string};
export type PostPage={posts:CommunityPost[];next_offset:number|null};
export type SDGAllocation={sdg:number;title:string;target:string;xp:number;reason:string};
export type Contribution={id:string;project_title:string;description:string;linked_skill:string;sdg_goal:string;un_target:string;evidence_url:string;xp_awarded:number;verified_status:string;created_at:string;sdg_allocations?:SDGAllocation[];assessed_by?:'ai'|'keywords'};
export type SDGXP={number:number;title:string;color:string;xp:number};
export type TitleTier={min_xp:number;title:string;badge_target:string;perk:string};
export type Tracker={xp_points:number;progress_percent:number;completed_steps:number;total_steps:number;earned_sdg_title:string;unlocked_titles:string[];title_tiers:TitleTier[];next_tier:TitleTier|null;contributions:Contribution[];sdg_xp?:SDGXP[];disclosure_badge:string};
export type LiveNewsItem={id:string;title:string;url:string;source:string;published_at:string|null;category:'sdg'|'job';sdg_number:number|null;tag:string};
export type LiveNews={items:LiveNewsItem[];role:string|null;sdgs:{number:number;title:string;color:string}[];partial:boolean;unavailable:boolean;disclosure_badge:string};
export type CVProposal={mode:'preview';cv:CV;base_version?:number;added_projects:string[];notice:string};

export function localCVPreview(cv:CV,contributions:Contribution[]):CVProposal {
  const skills=[...cv.skills];let projects=cv.projects;
  for(const item of contributions){
    if(!skills.some(skill=>skill.toLowerCase()===item.linked_skill.toLowerCase()))skills.push(item.linked_skill);
    const line=`${item.project_title}: ${item.description}`;
    if(!projects.includes(line))projects=[projects,line].filter(Boolean).join('\n');
  }
  return {mode:'preview',cv:{...cv,skills,projects,ai_consent:false},added_projects:contributions.map(item=>item.project_title),notice:'Fictional preview. Your saved CV has not changed.'};
}
