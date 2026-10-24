import type {Evaluation} from '@/lib/types';
import s from './cv-score-summary.module.css';

export function CVScoreSummary({rating,example=false}:{rating:Evaluation;example?:boolean}){
 const score=Math.max(0,Math.min(100,Math.round(rating.score)));
 const circumference=2*Math.PI*70;
 return <div className={s.layout}>
   <div className={s.overall}>
     <div className={s.ring} role="img" aria-label={`${example?'Example':'Overall'} CV score: ${score} out of 100`}>
       <svg viewBox="0 0 164 164" aria-hidden="true"><circle className={s.track} cx="82" cy="82" r="70"/><circle className={s.value} cx="82" cy="82" r="70" strokeDasharray={circumference} strokeDashoffset={circumference*(1-score/100)}/></svg>
       <div><strong>{score}</strong><span>out of 100</span></div>
     </div>
     <span className={s.overallLabel}>{example?'Fictional demo score':'Your overall CV score'}</span>
     <p>{example?'An illustration of the score view.':'AI writing assessment'}</p>
   </div>
   <div className={s.breakdown}><div className={s.breakdownHeading}><h3>Your score breakdown</h3><span>{rating.breakdown.length} areas assessed</span></div>{rating.breakdown.map(row=>{
     const value=Math.max(0,Math.min(100,row.score));
     return <div className={s.metric} key={row.name}><div><span>{row.name}</span><strong>{value}<small>/100</small></strong></div><div className={s.bar} role="progressbar" aria-label={`${row.name} score`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><span style={{width:`${value}%`}}/></div><small>{row.weight}% of overall score</small></div>;
   })}</div>
 </div>;
}
