import {API, supabase} from './api';

export const questionTypes = {single:'Single Answer',multiple:'Multiple Answer',fill:'Fill in the Blank',matching:'Mix Match'} as const;
export type QuestionKind = keyof typeof questionTypes;
export type Answer = string | number | number[] | Record<string,string>;
export type Question = {id:string;prompt:string;question_type:QuestionKind;options:string[]|{left:string[];right:string[]};matching_choices?:{value:number;label:string}[];answer_key?:number|number[]|string[];correct_index?:number;explanation?:string;deleted_at?:string|null};
export type LearningMaterial = {id:string;name:string;kind:'pdf'|'video';mime:string;size:number;created_at?:string;removed_at?:string|null;subsection_id?:string;storage_provider?:'supabase';storage_bucket?:string;storage_path?:string;sha256?:string};
export type MaterialAccess = LearningMaterial & {url:string;download_url?:string;expires_at:number};
export type Subsection = {id:string;title:string;body:string;video_url?:string;removed_at?:string|null};
export type Chapter = {id:string;title:string;body:string;skill:string;minutes:number;video_url?:string;materials?:LearningMaterial[];subsections?:Subsection[];questions:Question[];question_count:number};
export function activeSubsections(chapter:Chapter){return (chapter.subsections||[]).filter(section=>!section.removed_at);}
export function hasSubsectionContent(chapter:Chapter,section:Subsection){return Boolean(section.body.trim()||section.video_url||chapter.materials?.some(file=>!file.removed_at&&file.subsection_id===section.id));}
export function hasLegacyContent(chapter:Chapter){return Boolean(chapter.body.trim()||chapter.video_url||chapter.materials?.some(file=>!file.removed_at&&!file.subsection_id));}
export function hasLearningContent(chapter:Chapter){const sections=activeSubsections(chapter);return (hasLegacyContent(chapter)||sections.length>0)&&sections.every(section=>hasSubsectionContent(chapter,section));}
export function learningSections(chapter:Chapter,number:number):[string,string,string][]{
  const sections=activeSubsections(chapter);
  if(!sections.length)return [['overview','Overview','01'],['content','Learn','02'],['summary','Recap','03'],['quiz','Quiz','04']];
  return [...(hasLegacyContent(chapter)?[['content','Chapter introduction','—'] as [string,string,string]]:[]),...sections.map((section,index):[string,string,string]=>[`subsection:${section.id}`,section.title,`${number}.${index+1}`]),['quiz','Chapter quiz','']];
}
export function materialUrl(path:string){return path.startsWith('/demos/')?path:/^https?:\/\//.test(API)?new URL(path,API).href:path;}
export function fileSize(size:number){return size<1024*1024?`${Math.max(1,Math.round(size/1024))} KB`:`${(size/1024/1024).toFixed(1)} MB`;}
export function validateLearningFile(file:File){
  const extension=file.name.toLowerCase().split('.').at(-1);
  if(!['pdf','mp4','webm'].includes(extension||''))throw new Error('Choose a PDF, MP4 or WEBM file.');
  if(!file.size)throw new Error('Empty files cannot be uploaded.');
  if(file.name.length>180)throw new Error('Use a file name no longer than 180 characters.');
  if(file.size>(extension==='pdf'?20:100)*1024*1024)throw new Error(extension==='pdf'?'PDFs must be 20 MB or smaller.':'Videos must be 100 MB or smaller.');
}
export type AssessedSkill = {skill_id:string;level:'foundation'|'intermediate'|'advanced';name?:string};
export type SkillCatalogue = {skills:{id:string;name:string}[];levels:{id:AssessedSkill['level'];credit:number}[]};
export type Completion = {completed_at:string;attempt_id:string;badge_code:string;score:number};
export type Enrollment = {course_id:string;enrolled_at:string;chapter_passes:Record<string,{completed_at:string;attempt_id:string;order:number}>;assessments:Record<string,{count:number;best_score:number;latest_id:string}>;completion:Completion|null;resume?:Record<string,number>};
export type Course = {assessed_skills?:AssessedSkill[];revision?:number;id:string;title:string;provider:string;provider_logo?:string;disclaimer?:string;sources?:{label:string;url:string}[];description:string;category:string;published:boolean;unpublished_at?:string;sample?:boolean;owned?:boolean;chapters:Chapter[];final_questions:Question[];pass_percent:number;final_pass_percent:number;enrollment:Enrollment|null;minutes:number;chapter_count:number;final_question_count:number;percent:number;final_unlocked:boolean;complete:boolean;milestones:{chapter_id:string;number:number;title:string;completed_at:string;order:number}[]};
export type Badge = Completion & {course_id:string;title:string;provider:string;provider_logo?:string;sample?:boolean;skills?:AssessedSkill[];course_revision?:number;matching_eligible?:boolean};
export type Attempt = {id:string;course_id:string;target:string;created_at:string;passed:boolean;score:number;correct_count:number;total_count:number;details:{id:string;prompt:string;question_type:QuestionKind;correct:boolean;selected:string;expected:string;explanation:string}[]};
export type DraftQuestion = {question_type:QuestionKind;prompt:string;explanation:string;correct_index:string;correct_indices:number[];accepted_answers:string;[key:string]:string|number[]};
export const emptyQuestion = ():DraftQuestion => ({question_type:'single',prompt:'',explanation:'',correct_index:'',correct_indices:[],accepted_answers:'',option_0:'',option_1:'',option_2:'',option_3:'',match_left_0:'',match_right_0:'',match_left_1:'',match_right_1:''});
export function authorFields(q:Question):DraftQuestion {
  const draft:DraftQuestion={...emptyQuestion(),question_type:q.question_type,prompt:q.prompt,explanation:q.explanation||''};
  if(q.question_type==='single'||q.question_type==='multiple') (q.options as string[]).forEach((option,index)=>{draft[`option_${index}`]=option});
  if(q.question_type==='single') draft.correct_index=String(q.answer_key??q.correct_index);
  if(q.question_type==='multiple') draft.correct_indices=q.answer_key as number[];
  if(q.question_type==='fill') draft.accepted_answers=(q.answer_key as string[]).join('\n');
  if(q.question_type==='matching') {const options=q.options as {left:string[];right:string[]};options.left.forEach((left,index)=>{draft[`match_left_${index}`]=left;draft[`match_right_${index}`]=options.right[(q.answer_key as number[])[index]]});}
  return draft;
}

export function answered(q:Question,value:Answer|undefined):boolean {
  if(q.question_type==='multiple')return Array.isArray(value)&&value.length>0;
  if(q.question_type==='matching'){const total=(q.options as {left:string[]}).left.length;const values=value&&typeof value==='object'&&!Array.isArray(value)?Object.values(value).filter(x=>x!==''):[];return values.length===total&&new Set(values).size===total;}
  return value!==undefined&&String(value).trim()!=='';
}
export function dateLabel(date:string){return new Intl.DateTimeFormat('en-MY',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(date))+' MYT';}

const pendingSessions=new Map<string,Promise<string>>();
async function practiceToken(persona:string){
  const key=`futureproof:learning-practice:${persona}`;
  let saved:string|null=null;
  try{saved=sessionStorage.getItem(key)}catch{/* Storage is optional. */}
  if(saved)return saved;
  let pending=pendingSessions.get(key);
  if(!pending){pending=(async()=>{const response=await fetch(`${API}/learning/sandbox/sessions`,{method:'POST',cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.detail||'Could not start learning practice.');const token=body.data.token as string;try{sessionStorage.setItem(key,token)}catch{}return token;})();pendingSessions.set(key,pending);pending.catch(()=>pendingSessions.delete(key));}
  return pending;
}
export async function learningRequest<T>(demo:string|null,path:string,method='GET',body?:unknown,retry=true):Promise<T>{
  if(demo==='student'||demo==='professional')return (await import('./demo-learning')).demoLearningRequest<T>(demo,path,method,body);
  return sandboxLearningRequest<T>(demo,path,method,body,retry);
}
export async function sandboxLearningRequest<T>(demo:string|null,path:string,method='GET',body?:unknown,retry=true):Promise<T>{
  const headers=await learningHeaders(demo);
  const response=await fetch(`${API}/learning${demo?'/sandbox':''}${path}`,{method,headers,cache:'no-store',body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json().catch(()=>({detail:'The learning service returned an unreadable response.'}));
  if(response.status===410&&demo&&retry){await forgetExpiredPractice(demo,headers['X-Learning-Session']);if(method==='GET')return sandboxLearningRequest<T>(demo,path,method,body,false);throw new Error('Your practice session expired. Refresh this page to start again.');}
  if(!response.ok)throw new Error(result.detail||'The learning request failed. Please try again.');
  return result.data as T;
}

async function learningHeaders(demo:string|null){
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(demo)headers['X-Learning-Session']=await practiceToken(demo);
  else{const session=supabase?(await supabase.auth.getSession()).data.session:null;if(session)headers.Authorization=`Bearer ${session.access_token}`;}
  return headers;
}

async function forgetExpiredPractice(persona:string,failedToken:string){
  const key=`futureproof:learning-practice:${persona}`;
  const pending=pendingSessions.get(key);
  const cached=await pending?.catch(()=>null);
  // A late 410 from an old request must not erase a freshly rotated session.
  try{if(sessionStorage.getItem(key)===failedToken)sessionStorage.removeItem(key);}catch{}
  if(cached===failedToken&&pendingSessions.get(key)===pending)pendingSessions.delete(key);
}

export async function uploadLearningFile(demo:string|null,path:string,file:File,onProgress:(percent:number)=>void,signal?:AbortSignal,subsectionId?:string):Promise<LearningMaterial>{
  if(demo)throw new Error('Sign in to your personal workspace to upload private course files.');
  validateLearningFile(file);
  const headers=await learningHeaders(demo);
  if(signal?.aborted)throw new Error('Upload cancelled.');
  const extension=file.name.toLowerCase().split('.').at(-1);
  headers['Content-Type']=extension==='pdf'?'application/pdf':extension==='mp4'?'video/mp4':'video/webm';
  return new Promise((resolve,reject)=>{
    const upload=new XMLHttpRequest();
    upload.open('POST',`${API}/learning${demo?'/sandbox':''}${path}?filename=${encodeURIComponent(file.name)}${subsectionId?`&subsection_id=${encodeURIComponent(subsectionId)}`:''}`);
    Object.entries(headers).forEach(([name,value])=>upload.setRequestHeader(name,value));
    upload.timeout=5*60*1000;
    upload.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(100*event.loaded/event.total));};
    upload.onload=async()=>{
      let result:{data:LearningMaterial;detail?:string};
      try{result=JSON.parse(upload.responseText);}catch{reject(new Error('The upload service returned an unreadable response.'));return;}
      if(upload.status===410&&demo){
        await forgetExpiredPractice(demo,headers['X-Learning-Session']);
        reject(new Error('Your temporary practice session expired. Refresh this page to start a new session.'));
      }
      else if(upload.status>=200&&upload.status<300)resolve(result.data);
      else reject(new Error(result.detail||'Upload failed. Your remaining files are kept for retry.'));
    };
    upload.onerror=()=>reject(new Error('Upload interrupted. Check your connection and try again.'));
    upload.ontimeout=()=>reject(new Error('Upload timed out. Try a smaller file or a faster connection.'));
    upload.onabort=()=>reject(new Error('Upload cancelled.'));
    const cancel=()=>upload.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    upload.onloadend=()=>signal?.removeEventListener('abort',cancel);
    upload.send(file);
  });
}

