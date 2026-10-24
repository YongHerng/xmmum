import type {Snapshot} from './types';
import type {SDGImpact,SkillMapping} from './sdg';

type Context=Pick<Snapshot,'impact'|'news'|'pathways'|'tracker'>&{forecasts:Record<string,Snapshot['forecast']>};
type Bundle={skills:Record<string,{mapping:SkillMapping;aliases:string[]}>;personas:Record<string,{base:Snapshot;contexts:Record<string,Context>;matches:Record<string,Snapshot['matches']>}>};
async function bundle(){return (await import('./data/offline-demos.json')).default as unknown as Bundle;}

export async function demoOutcomes(persona:string){
  const example=(await bundle()).personas[persona]?.base.demo_outcomes;
  if(!example)throw new Error('Unknown expected-outcome demo.');
  return structuredClone(example);
}

export async function offlineDemo(path:string):Promise<Snapshot|undefined>{
  const url=new URL(path,'https://demo.invalid');
  const match=/^\/demo\/(student|professional)$/.exec(url.pathname);
  if(!match)return;
  const data=(await bundle()).personas[match[1]];
  const role=url.searchParams.get('role_id')||data.base.selected_role;
  const scenario=url.searchParams.get('scenario')||'moderate';
  const horizon=url.searchParams.get('horizon')||'5';
  const context=data.contexts[role];
  if(!context||!context.forecasts[`${scenario}-${horizon}`])return;
  const {forecasts,...snapshotContext}=context;
  return structuredClone({...data.base,...snapshotContext,forecast:forecasts[`${scenario}-${horizon}`],matches:data.matches[scenario],selected_role:role,offline_demo:true});
}

export async function offlineSimulation(roleId:string,skills:string[]):Promise<SDGImpact>{
  const data=await bundle();const context=data.personas.student.contexts[roleId];
  if(!context)throw new Error('Unknown career direction.');
  const normalize=(value:string)=>Object.entries(data.skills).find(([,item])=>item.aliases.some(alias=>alias.toLowerCase()===value.trim().toLowerCase()))?.[0]||value.trim().toLowerCase();
  const current=new Set(skills.map(normalize));
  const role=data.personas.student.base.roles.find(role=>role.id===roleId)!;
  const mappings=[...new Set([...current,...role.technical])].map(id=>({...data.skills[id]?.mapping||{skill_id:id,skill_name:skills.find(s=>normalize(s)===id)||id,sdg_number:4,sdg_title:'Quality Education',un_target:'Target 4.4',mapping_rationale:'Practising this skill can support learning for work. A specific impact connection needs project evidence.',source_citation:'UN Sustainable Development Goal 4',source_url:'https://sdgs.un.org/goals/goal4'},acquired:current.has(id)}));
  return {...structuredClone(context.impact),skill_mappings:mappings,skills:context.impact.skills.map(skill=>({...skill,acquired:current.has(skill.id)})),simulation:true,note:'What-if simulation based on bundled curated data. Your CV has not changed.'};
}
