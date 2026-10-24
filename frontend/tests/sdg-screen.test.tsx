import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import SDGScreen,{CommunityScreen} from '../src/components/sdg-screen';
import type {Snapshot} from '../src/lib/types';
import type {Tracker} from '../src/lib/sdg';

const state=vi.hoisted(()=>({query:'',demo:'student' as string|null,call:vi.fn(),replace:vi.fn(),data:{} as Snapshot,reload:vi.fn()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(state.query),useRouter:()=>({replace:state.replace})}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({data:state.data,demo:state.demo,identity:state.demo?'demo:student':'user:one',link:(path:string,params:Record<string,string>={})=>`${path}?${new URLSearchParams({...params,...(state.demo?{demo:state.demo}:{})})}`,reload:state.reload})}));
vi.mock('../src/lib/api',()=>({api:(...args:unknown[])=>state.call(...args)}));
vi.mock('../src/components/impact-graph',()=>({default:()=> <div>Connection graph</div>}));
const reading={id:4,title:'Skills that open doors',summary:'Explore learning for work.',source_name:'United Nations',source_url:'https://sdgs.un.org/goals/goal4',publication_date:null,source_kind:'Official goal overview',sdg_tags:['SDG 4'],skill_tags:['Python'],is_recommended:true,recommendation_reason:'Connected to your direction'};
const project={id:'one',project_title:'Energy notebook',description:'Explored synthetic readings.',linked_skill:'Python',sdg_goal:'SDG 8',un_target:'Target 8.2',evidence_url:'',xp_awarded:150,verified_status:'Self-reported',created_at:'2026-10-23'};
const tracker:Tracker={xp_points:150,progress_percent:0,completed_steps:0,total_steps:0,earned_sdg_title:'SDG Explorer',unlocked_titles:['SDG Explorer'],title_tiers:[{title:'SDG Explorer',min_xp:0,badge_target:'Learning',perk:'Progress only'}],next_tier:null,contributions:[project],disclosure_badge:'Self-reported practice'};
beforeEach(()=>{
  state.query='';state.demo='student';state.call.mockReset();state.replace.mockReset();state.reload.mockResolvedValue(undefined);
  state.data={profile:{name:'Aisha'},cv:{name:'Aisha',skills:['Excel'],projects:'Existing project.',target_role:'data-analyst',ai_consent:false},pathways:[],roles:[{id:'data-analyst',title:'Data Analyst'}],selected_role:'data-analyst',impact:{role:'Data Analyst',role_id:'data-analyst',activity:'Analyze information.',skills:[],goals:[{number:4,title:'Quality Education',target:'4.4',description:'Learning for work.',color:'#c5192d',url:'https://sdgs.un.org/goals/goal4'}],skill_mappings:[{skill_id:'python',skill_name:'Python',acquired:false,sdg_number:8,sdg_title:'Decent Work',un_target:'Target 8.2',mapping_rationale:'Practise reproducible analysis.',source_citation:'UN goal',source_url:'https://sdgs.un.org/goals/goal8'}],note:'Potential alignment.',source:'https://sdgs.un.org/goals'},news:[reading],forum_posts:[],tracker} as unknown as Snapshot;
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','');}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.removeAttribute('open');}});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
function mount(Screen=SDGScreen){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return render(<QueryClientProvider client={client}><Screen/></QueryClientProvider>);}

it('switches between confirmed and potential skills with official citations',()=>{
  mount();expect(screen.getByRole('link',{name:'UN source for Python'})).toHaveAttribute('href','https://sdgs.un.org/goals/goal8');
  fireEvent.click(screen.getByRole('button',{name:'Skills you bring'}));
  expect(screen.queryByRole('heading',{name:'Python'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'To develop'}));
  expect(screen.getByRole('heading',{name:'Python'})).toBeVisible();expect(state.call).not.toHaveBeenCalled();
});
it('keeps tab changes scoped to the selected career and demo identity',()=>{
  mount();fireEvent.click(screen.getByRole('tab',{name:'Reading'}));
  expect(state.replace).toHaveBeenCalledWith('/app/sdg?tab=reading&role=data-analyst&demo=student',{scroll:false});
});
it('previews selected reading without claiming to send email or writing demo data',()=>{
  state.query='tab=reading';mount();
  expect(screen.getByRole('button',{name:'Preview reading list'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:/Include Skills that open doors/}));
  fireEvent.click(screen.getByRole('button',{name:'Preview reading list'}));
  expect(screen.getByText('Preview only. No email has been sent or scheduled.')).toBeVisible();expect(state.call).not.toHaveBeenCalled();
});
it('allows a fictional CV preview while preventing demo confirmation',async()=>{
  state.query='tab=progress';mount();
  fireEvent.click(screen.getByRole('checkbox',{name:'Include Energy notebook in CV preview'}));
  const trigger=screen.getByRole('button',{name:'Preview CV additions'});trigger.focus();fireEvent.click(trigger);
  await screen.findByRole('dialog');
  expect(screen.getByLabelText('Projects and achievements')).toHaveValue('Existing project.\nEnergy notebook: Explored synthetic readings.');
  expect(screen.getByRole('button',{name:'Confirm and update CV'})).toBeDisabled();expect(state.call).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Close dialog'}));expect(trigger).toHaveFocus();
});
it('submits personal reflections without client-supplied authorship fields',async()=>{
  state.demo=null;state.query='';
  state.call.mockImplementation(async(path:string,method='GET')=>path.startsWith('/community')?method==='GET'?{posts:[],next_offset:null}:{}:state.data.impact);
  mount(CommunityScreen);await screen.findByText('Every community starts with a conversation.');
  fireEvent.change(screen.getByLabelText('Your reflection'),{target:{value:'I practised documenting the assumptions in my analysis.'}});
  fireEvent.click(screen.getByRole('button',{name:'Share reflection'}));
  await waitFor(()=>expect(state.call).toHaveBeenCalledWith('/community/posts','POST',{content:'I practised documenting the assumptions in my analysis.',skill_tag:'',sdg_badge:'SDG 4 · Learning'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Your reflection has been shared.');
});
it('requires confirmation before saving a reviewed CV through the normal versioned flow',async()=>{
  state.demo=null;state.query='tab=progress';
  state.call.mockImplementation(async(path:string)=>{
    if(path==='/tracker')return tracker;
    if(path==='/tracker/reskill-done')return {mode:'preview',base_version:3,cv:{...state.data.cv,skills:['Excel','Python'],projects:'Existing project.\nEnergy notebook.'},added_projects:['Energy notebook.'],notice:'Review'};
    return state.data.impact;
  });
  mount();await screen.findByRole('checkbox',{name:'Include Energy notebook in CV preview'});
  fireEvent.click(screen.getByRole('checkbox',{name:'Include Energy notebook in CV preview'}));fireEvent.click(screen.getByRole('button',{name:'Preview CV additions'}));
  await screen.findByRole('dialog');expect(screen.getByRole('button',{name:'Confirm and update CV'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:/I confirm these skills/}));fireEvent.click(screen.getByRole('button',{name:'Confirm and update CV'}));
  await waitFor(()=>expect(state.call).toHaveBeenCalledWith('/cv?expected_version=3','PUT',expect.objectContaining({skills:['Excel','Python'],ai_consent:false})));
  expect(state.call).toHaveBeenCalledWith('/cv/analyze','POST');
});

it('logs a personal project and refreshes progress without changing the CV',async()=>{
  state.demo=null;state.query='tab=progress';
  state.call.mockImplementation(async(path:string)=>path==='/tracker'?{...tracker,xp_points:0,contributions:[]}:path==='/tracker/contributions'?tracker:state.data.impact);
  mount();fireEvent.click(await screen.findByRole('button',{name:'Log your first project'}));
  await screen.findByRole('dialog');
  fireEvent.change(screen.getByLabelText('Project title'),{target:{value:'Energy notebook'}});
  fireEvent.change(screen.getByLabelText('What did you do and learn?'),{target:{value:'Explored synthetic readings.'}});
  fireEvent.change(screen.getByLabelText('Skill you practised'),{target:{value:'Python'}});
  fireEvent.click(screen.getByRole('button',{name:'Save project'}));
  await waitFor(()=>expect(state.call).toHaveBeenCalledWith('/tracker/contributions','POST',expect.objectContaining({project_title:'Energy notebook',linked_skill:'Python',description:'Explored synthetic readings.'})));
  expect(await screen.findByText('Project added to your practice log. Keep building.')).toBeVisible();
  expect(state.call.mock.calls.some(call=>String(call[0]).startsWith('/cv'))).toBe(false);
});

it('explores hypothetical skills and resets without saving or modifying the workspace CV',async()=>{
  mount();fireEvent.change(screen.getByLabelText('Skills to explore'),{target:{value:'SQL, Statistics'}});
  fireEvent.click(screen.getByRole('button',{name:'Explore these skills'}));
  expect(await screen.findByText(/What-if simulation .*These are hypothetical/)).toBeVisible();
  expect(screen.getAllByText('Included in your simulation').length).toBeGreaterThan(0);
  expect(state.data.cv.skills).toEqual(['Excel']);expect(state.call).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Use my CV skills'}));
  expect(screen.queryByText(/These are hypothetical skills/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('Skills to explore')).toHaveValue('Excel');
});

it('filters reading and preserves selected topics for an email draft preview',()=>{
  state.query='tab=reading';mount();
  fireEvent.click(screen.getByRole('checkbox',{name:/Include Skills that open doors/}));
  fireEvent.change(screen.getByLabelText('Find a topic'),{target:{value:'unmatched topic'}});
  expect(screen.getByText('No reading matches these filters. Try another topic or goal.')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Preview reading list'}));
  expect(screen.getByRole('link',{name:/Draft in your email app/})).toHaveAttribute('href',expect.stringContaining('mailto:'));
  expect(decodeURIComponent(screen.getByRole('link',{name:/Draft in your email app/}).getAttribute('href')!)).toContain('https://sdgs.un.org/goals/goal4');
});

it('keeps a failed personal reflection editable without inventing a saved post',async()=>{
  state.demo=null;state.query='';
  state.call.mockImplementation(async(path:string,method='GET')=>{
    if(path.startsWith('/community')){if(method==='GET')return {posts:[],next_offset:null};throw new Error('Could not save reflection');}
    return state.data.impact;
  });
  mount(CommunityScreen);await screen.findByText('Every community starts with a conversation.');
  fireEvent.change(screen.getByLabelText('Your reflection'),{target:{value:'My unsaved reflection'}});
  fireEvent.click(screen.getByRole('button',{name:'Share reflection'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save reflection');
  expect(screen.getByLabelText('Your reflection')).toHaveValue('My unsaved reflection');
  expect(screen.queryByText('Your reflection has been shared.')).not.toBeInTheDocument();
});

it('requests optional AI wording directly and leaves the CV untouched',async()=>{
  state.demo=null;
  state.call.mockImplementation(async(path:string)=>path==='/sdg/summary/status'?{available:true}:path==='/sdg/summary'?{role_summary:'Explore resource patterns through analysis.',generation_engine:'gemini',notice:'AI wording - not verified impact'}:state.data.impact);
  mount();const button=await screen.findByRole('button',{name:'Request AI wording'});expect(button).toBeEnabled();
  expect(screen.queryByRole('checkbox',{name:/I agree to send/})).not.toBeInTheDocument();
  expect(state.call.mock.calls.some(([path])=>path==='/sdg/summary')).toBe(false);fireEvent.click(button);
  expect(await screen.findByText('Explore resource patterns through analysis.')).toBeInTheDocument();
  expect(state.call).toHaveBeenCalledWith('/sdg/summary','POST',{role_id:'data-analyst',skills:['Excel']});
  expect(state.call.mock.calls.some(call=>String(call[0]).startsWith('/cv'))).toBe(false);
});
