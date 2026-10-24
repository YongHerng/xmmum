/** Isolated, in-memory practice over authored fixtures. Never calls an API. */
import type {Answer,Attempt,Badge,Course,Question} from './learning';
import {demoOutcomes} from './offline-demo';

const courseSkillName=(course:Course)=>course.category;
const sessions=new Map<string,{courses:Course[];attempts:Record<string,Attempt>}>();
async function session(persona:string){let value=sessions.get(persona);if(!value){value={courses:(await demoOutcomes(persona)).courses,attempts:{}};sessions.set(persona,value);}return value;}
function update(course:Course){const passes=course.enrollment?.chapter_passes||{};course.complete=Boolean(course.enrollment?.completion);course.final_unlocked=course.chapters.every(ch=>Boolean(passes[ch.id]));course.percent=Math.round(100*(Object.keys(passes).length+Number(course.complete))/(course.chapter_count+1));course.milestones=course.chapters.filter(ch=>passes[ch.id]).map((ch,index)=>({...passes[ch.id],chapter_id:ch.id,number:course.chapters.indexOf(ch)+1,title:ch.title})).sort((a,b)=>a.order-b.order);}
function sameAnswer(q:Question,value:Answer|undefined){const key=q.answer_key;if(q.question_type==='fill')return (key as string[]).some(answer=>answer.trim().toLowerCase()===String(value??'').trim().replace(/\s+/g,' ').toLowerCase());if(q.question_type==='multiple')return Array.isArray(value)&&JSON.stringify([...value].map(Number).sort())===JSON.stringify([...(key as number[])].sort());if(q.question_type==='matching')return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&(key as number[]).every((answer,index)=>String(value[index])===String(answer));return String(value)===String(key);}
function answerText(q:Question,value:Answer|Question['answer_key']|undefined,correct=false):string{if(value===undefined)return 'Not answered';if(q.question_type==='fill')return correct?(value as string[]).join(' / '):String(value);if(q.question_type==='matching'){const options=q.options as {left:string[];right:string[]};return options.left.map((left,index)=>`${left} → ${options.right[Number((value as Record<string,string>)[index])]||'Not answered'}`).join('; ');}if(q.question_type==='multiple')return (value as number[]).map(index=>(q.options as string[])[index]).join('; ');return (q.options as string[])[Number(value)]||'Not answered';}
export async function demoLearningRequest<T>(persona:string,path:string,method='GET',body?:unknown):Promise<T>{
 const state=await session(persona);const parts=path.split('/').filter(Boolean);const stamp=new Date().toISOString();
 if(method==='GET'&&path==='/courses')return structuredClone(state.courses) as T;
 if(method==='GET'&&path==='/badges')return structuredClone(state.courses.filter(c=>c.complete).map(c=>({...c.enrollment!.completion!,course_id:c.id,title:c.title,provider:c.provider,sample:true,matching_eligible:false,skills:c.assessed_skills?.map(skill=>({...skill,name:courseSkillName(c)}))} satisfies Badge))) as T;
 if(parts[0]==='attempts'&&method==='GET'){
   let attempt=state.attempts[parts[1]];
   if(!attempt){for(const course of state.courses){const completion=course.enrollment?.completion;const target=completion?.attempt_id===parts[1]?'final':Object.entries(course.enrollment?.chapter_passes||{}).find(([,pass])=>pass.attempt_id===parts[1])?.[0];if(!target)continue;const questions=target==='final'?course.final_questions:course.chapters.find(ch=>ch.id===target)!.questions;attempt={id:parts[1],course_id:course.id,target,created_at:completion?.completed_at||'2026-10-21T02:00:00Z',passed:true,score:100,correct_count:questions.length,total_count:questions.length,details:questions.map(q=>({id:q.id,prompt:q.prompt,question_type:q.question_type,correct:true,selected:answerText(q,q.answer_key,true),expected:answerText(q,q.answer_key,true),explanation:q.explanation||''}))};break;}}
   if(!attempt)throw new Error('This local demo attempt is no longer available. Try the quiz again.');return structuredClone(attempt) as T;
 }
 const course=state.courses.find(c=>c.id===parts[1]);if(!course||parts[0]!=='courses')throw new Error('This action is unavailable in the offline demo. Personal records are unchanged.');
 if(method==='GET'&&parts.length===2)return structuredClone(course) as T;
 if(method==='POST'&&parts[2]==='enroll'){course.enrollment??={course_id:course.id,enrolled_at:stamp,chapter_passes:{},assessments:{},completion:null};return structuredClone(course) as T;}
 if(parts[2]==='chapters'&&parts[4]==='materials'&&method==='GET')return structuredClone(course.chapters.find(ch=>ch.id===parts[3])?.materials||[]) as T;
 if(parts[2]==='chapters'&&parts[4]==='resume'&&method==='POST')return {} as T;
 if(parts[2]==='assessments'&&parts[4]==='submit'&&method==='POST'){
   const target=parts[3];if(!course.enrollment)throw new Error('Start the demo course first.');if(target==='final'&&!course.final_unlocked)throw new Error('Pass every chapter quiz before the final demo test.');
   const questions=target==='final'?course.final_questions:course.chapters.find(ch=>ch.id===target)?.questions;if(!questions)throw new Error('Unknown demo assessment.');
   const answers=(body as {answers:Record<string,Answer>}).answers;
   const details=questions.map(q=>({id:q.id,prompt:q.prompt,question_type:q.question_type,correct:sameAnswer(q,answers[q.id]),selected:answerText(q,answers[q.id]),expected:answerText(q,q.answer_key,true),explanation:q.explanation||''}));
   const correct=details.filter(q=>q.correct).length,score=Math.round(100*correct/questions.length),passed=score>=(target==='final'?course.final_pass_percent:course.pass_percent);
   const id=`demo-attempt-${Object.keys(state.attempts).length+1}`;const attempt:Attempt={id,course_id:course.id,target,created_at:stamp,passed,score,correct_count:correct,total_count:questions.length,details};state.attempts[id]=attempt;
   const previous=course.enrollment.assessments[target];course.enrollment.assessments[target]={count:(previous?.count||0)+1,best_score:Math.max(previous?.best_score||0,score),latest_id:id};
   if(passed&&target!=='final'&&!course.enrollment.chapter_passes[target])course.enrollment.chapter_passes[target]={completed_at:stamp,attempt_id:id,order:Object.keys(course.enrollment.chapter_passes).length+1};
   if(passed&&target==='final')course.enrollment.completion??={completed_at:stamp,attempt_id:id,badge_code:'DEMO-'+course.id.replace(/^demo-/,'').toUpperCase(),score};
   update(course);return structuredClone(attempt) as T;
 }
 throw new Error('Demo content is read-only; quiz practice stays in this browser session.');
}
