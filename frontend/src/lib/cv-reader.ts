import type { CV } from './types';
import {hasCV} from './cv-status';

export type SourceBox = {page:number;box:[number,number,number,number]};
export type CVEvidence = {key:keyof CV;value:string;sources:SourceBox[];confidence:number|null;needs_review:boolean;reason:string};
export type ParsedCV = {cv:CV;notice:string;characters:number;ai_status?:string;coverage?:{unmapped_skills:string[];notice:string};document:{pages:{number:number;width:number;height:number}[];fields:CVEvidence[];used_ocr:boolean;reformatted:boolean;pdf_base64:string|null}};
export type ReaderDraft = Omit<CV,'skills'|'phone'|'membership_licensure'|'certificates_training'> & Required<Pick<CV,'phone'|'membership_licensure'|'certificates_training'>> & {skillsText:string};
export const primaryFields = [
  {key:'name',label:'Full name',placeholder:'Filled from your CV'},
  {key:'email',label:'Email address',placeholder:'name@example.com'},
  {key:'phone',label:'Phone number',placeholder:'+60 12 345 6789'},
  {key:'skills',label:'Skills',placeholder:'Your skills appear here'},
] as const;
export function toDraft(cv:CV):ReaderDraft {
  return {name:cv.name||'',email:cv.email||'',phone:cv.phone||'',membership_licensure:cv.membership_licensure||'',certificates_training:cv.certificates_training||'',summary:cv.summary||'',education:cv.education||'',experience:cv.experience||'',projects:cv.projects||'',target_role:cv.target_role||'',ai_consent:Boolean(cv.ai_consent),...(cv.course_skill_ids?.length?{course_skill_ids:cv.course_skill_ids}:{}),...(cv.entries?.length?{entries:cv.entries,structure_version:cv.structure_version||2}:{}),...(cv.additional_sections?.length?{additional_sections:cv.additional_sections}:{}),skillsText:(cv.skills||[]).join(', ')};
}
export function toCV(draft:ReaderDraft):CV {
  const {skillsText,...cv}=draft;
  return {...cv,skills:[...new Set(skillsText.split(/[,;|\n]+/).map(s=>s.trim()).filter(Boolean))]};
}
export function validateCV(draft:ReaderDraft):string|null {
  if(!draft.name.trim())return 'Add your full name before confirming.';
  if(draft.name.length>100)return 'Keep your name under 100 characters.';
  if(draft.email.length>200||draft.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email))return 'Enter a valid email address, or leave it blank.';
  if(!hasCV(toCV(draft)))return 'Add a skill, summary, experience, project or credential before confirming.';
  if(draft.phone.length>50||draft.membership_licensure.length>5000||draft.certificates_training.length>5000||draft.summary.length>5000||draft.education.length>5000||draft.skillsText.length>5000||draft.experience.length>10000||draft.projects.length>10000)return 'One of your CV sections is too long. Shorten it before confirming.';
  if(draft.additional_sections?.some(section=>!section.title.trim()||section.title.length>150||section.content.length>10000))return 'Give every additional section a name and keep its text under 10,000 characters.';
  return null;
}
