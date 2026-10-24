import type {Answers,Snapshot} from './types';
import {hasCV} from './cv-status';

export const profilePaths=['/app/profile','/app/cv','/app/questionnaire'];

export function profileSetupComplete(data:Snapshot){
  if(data.onboarding)return data.onboarding.cv_confirmed&&data.onboarding.discover_complete&&!data.onboarding.required_step;
  return Boolean(data.profile.onboarding_complete&&data.cv&&hasCV(data.cv)&&data.questionnaire&&
    firstIncompleteSurveyStep(data.questionnaire,data.profile.name,data.profile.education)===5);
}

export function surveyStepMissing(step:number,answers:Answers,name:string,education:string):string[]{
  switch(step){
    case 0:return [!name.trim()&&'Your name',!education.trim()&&'Education',!answers.category&&'Starting point'].filter(Boolean) as string[];
    case 1:return [!answers.interests.some(value=>value.trim())&&'Interests',!answers.strengths?.some(value=>value.trim())&&'Strengths',!answers.career_goal?.trim()&&'Career goal'].filter(Boolean) as string[];
    case 2:return [!answers.work_style&&'Work style',!answers.environment&&'Environment',!answers.social_energy&&'Social energy',!answers.decision_style&&'Decision making'].filter(Boolean) as string[];
    case 3:return answers.motivation?[]:['Motivation'];
    case 4:return [answers.weekly_hours==null&&'Weekly learning time',answers.budget==null&&'Learning budget',!answers.location.trim()&&'Country',answers.relocation==null&&'Relocation preference',!answers.learning_style&&'Learning approach'].filter(Boolean) as string[];
    default:return [];
  }
}

export function firstIncompleteSurveyStep(answers:Answers,name:string,education:string){
  return [0,1,2,3,4].find(step=>surveyStepMissing(step,answers,name,education).length>0)??5;
}

export function requiredSetupPath(data:Snapshot,demo:string|null){
  if(demo||!data.onboarding?.required_step)return null;
  return `/app/${data.onboarding.required_step}`;
}

export function setupAllows(path:string,required:string|null){
  return !required||path===required||(required==='/app/questionnaire'&&path==='/app/cv');
}
