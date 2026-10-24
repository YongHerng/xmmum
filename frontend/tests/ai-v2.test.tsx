import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {LiveCareerIntelligence} from '../src/components/live-career';
import {CVAIAssistance} from '../src/components/ai-assistance';
import {CVAIAssessment} from '../src/components/cv-assessment';
import {CVEntries} from '../src/components/cv-entries';
import {CareerOutlookMap} from '../src/components/career-outlook';

const state=vi.hoisted(()=>({api:vi.fn(),reload:vi.fn(),saved:{} as any,data:{} as any}));
vi.mock('../src/lib/api',()=>({api:state.api}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({data:state.data,demo:null,identity:'account:test',reload:state.reload,link:(path:string,params?:Record<string,string>)=>path+(params?'?'+new URLSearchParams(params):'')})}));
vi.mock('../src/components/cv-document-preview',()=>({CVDocumentPreview:()=> <div role="img" aria-label="Generated CV preview"/>}));
const job={id:'real-source-id',title:'Network Support Associate',company:'Source Company',location:'Kuala Lumpur',description:'Networking and SQL required.',apply_url:'https://example.org/jobs/1',publisher:'Source board',posted_at:'2026-10-25',salary:null,employment_type:'Full time',assessment:{job_id:'real-source-id',score:62,explanation:'Your assessed networking learning connects with this vacancy.',matched_skills:['Networking'],missing_requirements:['SQL required.'],unknowns:['Eligibility has not been verified.'],skill_gaps:[{skill_id:'sql',label:'SQL',courses:[{id:'sql-foundations',title:'SQL Foundations'}]},{skill_id:'data-center',label:'Data Center',courses:[]}]}};
const result={jobs:[job],query:'Network support in Kuala Lumpur',country:'my',fetched_at:'2026-10-25T00:00:00Z',assessed_at:'2026-10-25T00:00:00Z',auto_refresh:false,ai_status:'AI assessed',model:'test-model'};
const outlookReport={role:'Network support',horizon_years:5 as const,target_year:2031,summary:'Long research summary.',drivers:['Technology changes.'],uncertainties:['Local availability is unknown.'],notice:'Not a job-count forecast.',evidence_quality:'Insufficient evidence.',created_at:'2026-10-25',sources:[{id:'wef',title:'WEF',url:'https://www.weforum.org/',period:'2025-2030',scope:'Global expectations.'}],future_roles:[{title:'Network specialist',reason:'Develop practical troubleshooting skills.',development_steps:['Build a lab.','Practice incident documentation.']}]};
beforeEach(()=>{
 state.api.mockReset();state.reload.mockReset();state.reload.mockResolvedValue(undefined);
 state.data={cv_version:1,cv:{skills:['Networking']},questionnaire:{location:'Malaysia'},skill_evidence:[],roles:[],selected_role:'cloud-support'};
 state.saved={search:null,stale:false,configured:true};
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:cv-preview'),revokeObjectURL:vi.fn()}));
 state.api.mockImplementation(async(path:string,_method?:string,body?:any)=>{
   if(path==='/jobs')return state.saved;
   if(path==='/jobs/search'){state.saved={search:result,stale:false,configured:true};return state.saved;}
   if(path==='/jobs/rematch'){state.saved={...state.saved,stale:false};return state.saved;}
   if(path==='/jobs/outlook'){const report={...outlookReport,horizon_years:body.years,target_year:2026+body.years};state.saved={...state.saved,outlook:report};return report;}
   if(path==='/ai/status')return {configured:true};
   if(path==='/cv/ai/context')return {version:1,badges:[],coverage:{unmapped_skills:[]},history:[]};
   if(path==='/cv/ai/preview')return {preview_id:'proposal',base_version:1,changes:[{field:'summary',before:'Built 3 SQL reports.',after:'Created 3 SQL reports.',reason:'Clearer writing.'}],mode:'AI draft',before_rating:null,after_rating:null,notice:'Review before saving.'};
   if(path==='/cv/pdf')return {pdf_base64:btoa('%PDF-synthetic-test'),filename:'futureproof-cv.pdf',notice:'Saved CV unchanged.'};
   if(path==='/cv/analyze')return {};
   throw new Error('Unexpected request '+path);
 });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mount(element:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}>{element}</QueryClientProvider>);}

it('searches real vacancies only on request without a consent gate and keeps source application links',async()=>{
 mount(<LiveCareerIntelligence/>);
 const search=screen.getByRole('button',{name:'Search & match real jobs'});
 await screen.findByText('Your next opportunity starts with a search.');await waitFor(()=>expect(search).toBeEnabled());
 expect(screen.queryByRole('checkbox',{name:/consent/i})).not.toBeInTheDocument();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/search')).toBe(false);
 fireEvent.change(screen.getByLabelText('Job title and location'),{target:{value:'Network support in Kuala Lumpur'}});
 await waitFor(()=>expect(search).toBeEnabled());fireEvent.click(search);
 expect(await screen.findByRole('heading',{name:'Network Support Associate'})).toBeVisible();
 expect(screen.getByRole('link',{name:/View original & apply/})).toHaveAttribute('href','https://example.org/jobs/1');
 expect(screen.getByText('Salary not supplied · Full time')).toBeVisible();
 expect(state.api).toHaveBeenCalledWith('/jobs/search','POST',{query:'Network support in Kuala Lumpur',country:'my',auto_refresh:false},expect.anything());
});

it('never substitutes fake jobs or scores when a search fails',async()=>{
 state.api.mockImplementation(async(path:string)=>{if(path==='/jobs')return state.saved;throw new Error('Provider unavailable.');});
 mount(<LiveCareerIntelligence/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Search & match real jobs'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Search & match real jobs'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Provider unavailable');
 expect(screen.queryByRole('link',{name:/View original & apply/})).not.toBeInTheDocument();
});

it('shows current matching skills and leads each skill gap into learning',async()=>{
 state.saved={search:result,stale:false,configured:true};mount(<LiveCareerIntelligence/>);
 await screen.findByRole('heading',{name:'Network Support Associate'});
 expect(screen.getByLabelText('Your skills and learning gaps')).toBeVisible();
 expect(screen.getByText('1 matched · 2 to build')).toBeVisible();
 expect(screen.getByRole('link',{name:'SQL Foundations'})).toHaveAttribute('href','/app/pathway?view=course&course=sql-foundations');
 expect(screen.getByRole('link',{name:'Explore learning pathway'})).toHaveAttribute('href','/app/pathway?view=catalogue&skill=data-center');
 expect(screen.getByText(/Course badges add assessed skills/)).toBeVisible();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/rematch')).toBe(false);
});

it.each([5,10,15])('generates an explicit %i-year development scenario',async years=>{
 mount(<LiveCareerIntelligence/>);
 fireEvent.click(screen.getByRole('tab',{name:'Future roles & outlook'}));
 fireEvent.change(screen.getByLabelText('Forecast horizon'),{target:{value:String(years)}});
 expect(screen.queryByRole('checkbox',{name:/consent|agree/i})).not.toBeInTheDocument();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/outlook')).toBe(false);
 const generate=screen.getByRole('button',{name:`Generate ${years}-year outlook`});
 await waitFor(()=>expect(generate).toBeEnabled());fireEvent.click(generate);
 await waitFor(()=>expect(state.api).toHaveBeenCalledWith('/jobs/outlook','POST',{role:'Entry level jobs in Malaysia',years},expect.anything()));
 expect(await screen.findByText(`YOUR ${years}-YEAR DEVELOPMENT MAP`)).toBeVisible();
 expect(screen.getByText(String(2026+years))).toBeVisible();
});

it('initialises the horizon from the saved outlook and labels a changed horizon clearly',async()=>{
 state.saved={...state.saved,outlook:{...outlookReport,horizon_years:15,target_year:2041}};mount(<LiveCareerIntelligence/>);
 fireEvent.click(screen.getByRole('tab',{name:'Future roles & outlook'}));
 await waitFor(()=>expect(screen.getByLabelText('Forecast horizon')).toHaveValue('15'));
 fireEvent.change(screen.getByLabelText('Forecast horizon'),{target:{value:'10'}});
 expect(screen.getByText(/Showing your saved 15-year outlook/)).toBeVisible();
 expect(screen.getByText('YOUR 15-YEAR DEVELOPMENT MAP')).toBeVisible();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/outlook')).toBe(false);
});

it('hides scores made stale by changed badge evidence until explicit reassessment',async()=>{
 state.saved={search:result,stale:true,configured:true};mount(<LiveCareerIntelligence/>);
 await screen.findByRole('heading',{name:'Network Support Associate'});
 expect(screen.getByText('Not currently assessed')).toBeVisible();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/rematch')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Reassess with current profile'}));
 await screen.findByText('AI vacancy fit');
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/search')).toBe(false);
});

it('keeps current learning gaps visible while an old fit score is stale',async()=>{
 state.saved={search:{...result,jobs:[{...job,assessment:{...job.assessment,current_matched_skills:['Networking']}}]},stale:true,configured:true};
 mount(<LiveCareerIntelligence/>);
 await screen.findByRole('heading',{name:'Network Support Associate'});
 expect(screen.getByRole('link',{name:/SQL Foundations/})).toBeVisible();
 expect(screen.getByText('Not currently assessed')).toBeVisible();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/rematch')).toBe(false);
});

it('can retry AI matching on saved real listings without retrieving jobs again',async()=>{
 state.saved={search:{...result,assessed_at:null,jobs:[{...job,assessment:undefined}],ai_status:'Provider temporarily unavailable.'},stale:false,configured:true};
 mount(<LiveCareerIntelligence/>);
 fireEvent.click(await screen.findByRole('button',{name:'Reassess with current profile'}));
 await waitFor(()=>expect(state.api).toHaveBeenCalledWith('/jobs/rematch','POST',{},expect.anything()));
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/search')).toBe(false);
});

it('reassesses automatically only when the saved search has explicit opt-in',async()=>{
 state.saved={search:{...result,auto_refresh:true},stale:true,configured:true};mount(<LiveCareerIntelligence/>);
 await waitFor(()=>expect(state.api).toHaveBeenCalledWith('/jobs/rematch','POST',{},expect.anything()));
 await screen.findByText('AI vacancy fit');
 expect(state.api.mock.calls.filter(([path])=>path==='/jobs/rematch')).toHaveLength(1);
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/search')).toBe(false);
});

it('previews the selected edited improvements as a PDF without saving',async()=>{
 mount(<CVAIAssistance/>);
 await waitFor(()=>expect(screen.getByRole('button',{name:'Create improvement preview'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'Create improvement preview'}));
 await screen.findByRole('heading',{name:'Review before saving'});
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Delivered 3 SQL reports.'}});
 fireEvent.click(screen.getByRole('button',{name:'Preview improved CV PDF'}));
 expect(await screen.findByRole('img',{name:'Generated CV preview'})).toBeVisible();
 expect(screen.getByRole('link',{name:'Download CV PDF'})).toHaveAttribute('download','futureproof-cv.pdf');
 expect(state.api).toHaveBeenCalledWith('/cv/pdf','POST',{preview_id:'proposal',fields:['summary'],edits:{summary:'Delivered 3 SQL reports.'}});
 expect(state.api.mock.calls.some(([path])=>path==='/cv/ai/apply')).toBe(false);
});

it('uses a direct analysis action with a provider notice, not another consent checkbox',async()=>{
 mount(<CVAIAssessment/>);const button=screen.getByRole('button',{name:'Analyse saved CV'});expect(button).toBeEnabled();
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();expect(screen.getByText(/Analyse sends relevant saved CV text/)).toBeVisible();fireEvent.click(button);
 await waitFor(()=>expect(state.api).toHaveBeenCalledWith('/cv/analyze','POST',{},expect.anything()));
 await waitFor(()=>expect(state.reload).toHaveBeenCalled());
 expect(screen.getByText(/No AI assessment for this CV version yet/)).toBeVisible();
});

it('shows the AI suggested direction and uses it as the initial job search',async()=>{
 state.saved={...state.saved,direction:{title:'Network support',explanation:'Your networking learning supports a practical support direction.',supporting_skills:['Networking'],next_steps:['Practice troubleshooting.']}};
 mount(<LiveCareerIntelligence/>);
 expect(await screen.findByRole('heading',{name:'Network support'})).toBeVisible();
 await waitFor(()=>expect(screen.getByLabelText('Job title and location')).toHaveValue('Network support in Malaysia'));
 expect(screen.queryByRole('tab',{name:'AI CV assessment'})).not.toBeInTheDocument();
 expect(state.api.mock.calls.some(([path])=>path==='/jobs/search')).toBe(false);
});

it('keeps outlook evidence expandable and visual stages separate from vacancy promises',()=>{
 mount(<CareerOutlookMap report={outlookReport} skills={['Networking']}/>);
 expect(screen.getByLabelText('Development stages')).toBeVisible();
 expect(screen.getByRole('heading',{name:'Network specialist'})).toBeVisible();
 expect(screen.getByText('Long research summary.')).not.toBeVisible();
 fireEvent.click(screen.getByText(/Full outlook, uncertainties & sources/));expect(screen.getByText('Long research summary.')).toBeVisible();
 expect(screen.getByText(/No guaranteed jobs/)).toBeVisible();
});

it('edits structured jobs separately instead of merging employers into one field',()=>{
 const changed=vi.fn();mount(<CVEntries entries={[{section:'experience',title:'Support Intern',organisation:'Example Employer',dates:'2024-2025',bullets:['Configured 2 routers.']}]} onChange={changed}/>);
 fireEvent.click(screen.getByText(/Structured entries/));fireEvent.change(screen.getByLabelText('Employer / institution'),{target:{value:'Correct Employer'}});
 expect(changed).toHaveBeenCalledWith([expect.objectContaining({organisation:'Correct Employer',title:'Support Intern',dates:'2024-2025'})]);
});
