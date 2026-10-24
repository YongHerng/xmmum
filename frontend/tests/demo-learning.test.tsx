import {afterEach,expect,it,vi} from 'vitest';
import type {Course,Attempt,Badge} from '../src/lib/learning';
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
it('provides courses, materials, badges and local quizzes with the API unavailable',async()=>{
 const fetch=vi.fn().mockRejectedValue(new Error('API unavailable'));vi.stubGlobal('fetch',fetch);
 const {learningRequest,materialUrl}=await import('../src/lib/learning');
 const courses=await learningRequest<Course[]>('student','/courses');expect(courses).toHaveLength(4);
 const cloud=courses.find(c=>c.id==='demo-cloud')!;expect(cloud.milestones.map(m=>m.number)).toEqual([2]);
 const chapter=cloud.chapters[0];const answers=Object.fromEntries(chapter.questions.map(q=>[q.id,q.question_type==='matching'?Object.fromEntries((q.answer_key as number[]).map((value,index)=>[index,String(value)])):q.question_type==='fill'?(q.answer_key as string[])[0]:q.answer_key]));
 const attempt=await learningRequest<Attempt>('student',`/courses/${cloud.id}/assessments/${chapter.id}/submit`,'POST',{answers});expect(attempt.passed).toBe(true);expect(attempt.correct_count).toBe(4);
 const saved=await learningRequest<Course>('student','/courses/demo-cloud');expect(saved.milestones.map(m=>m.number)).toEqual([2,1]);
 const materials=await learningRequest<{url:string}[]>('student',`/courses/${cloud.id}/chapters/${chapter.id}/materials`);expect(materialUrl(materials[0].url)).toBe('/demos/cloud-study-guide.pdf');
 const badges=await learningRequest<Badge[]>('professional','/badges');expect(badges[0].skills?.[0].skill_id).toBe('data-center');expect(badges.every(b=>!b.matching_eligible)).toBe(true);
 expect(fetch).not.toHaveBeenCalled();
 await expect(learningRequest('student','/studio/courses','POST',{})).rejects.toThrow(/unavailable|read-only/);
});
