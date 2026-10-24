import type {Answers} from './types';
import {currencyForLocation,formatMoney} from './currency';

export const profileCategories={'':'Not provided',student:'Student',graduate:'Graduate',professional:'Professional',switcher:'Career explorer'};
const labels:Record<string,string>={data:'Data & analytics',technology:'Technology & AI',sustainability:'Sustainability',creative:'Creative',people:'People-focused',practical:'Hands-on work',business:'Business',investigation:'Investigation',analytical:'Analytical',structured:'Structured',flexible:'Flexible',growth:'Growth & opportunity',stability:'Stability',impact:'Meaningful impact',balance:'Work-life balance',independent:'Working independently',collaborative:'Working with others',mixed:'A mix of both',evidence:'Evidence and analysis',values:'Values and effects on people',both:'Both',practice:'Hands-on practice',reading:'Reading and reflection',discussion:'Discussion and feedback'};
const label=(value?:string)=>value?labels[value]||value:'';

export function discoveryFields(answers:Answers):[string,string][]{
  return [
    ['Starting point',profileCategories[answers.category]||''],
    ['Interests',(answers.interests||[]).map(label).join(', ')],
    ['Strengths',(answers.strengths||[]).join(', ')],['Career goal',answers.career_goal||''],
    ['Work style',label(answers.work_style)],['Environment',label(answers.environment)],
    ['Motivation',label(answers.motivation)],['Social energy',label(answers.social_energy)],
    ['Decision making',label(answers.decision_style)],['Learning approach',label(answers.learning_style)],
    ['Weekly learning time',answers.weekly_hours==null?'':`${answers.weekly_hours} hours`],
    ['Budget',answers.budget==null?'':formatMoney(answers.budget,currencyForLocation(answers.location||''))],
    ['Location',answers.location||''],['Open to relocation',answers.relocation==null?'':answers.relocation?'Yes':'No'],
  ];
}
