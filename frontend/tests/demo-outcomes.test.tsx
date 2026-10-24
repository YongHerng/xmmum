import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {offlineDemo} from '../src/lib/offline-demo';
import {LiveCareerIntelligence} from '../src/components/live-career';
import {CVAIAssessment} from '../src/components/cv-assessment';
import {CVAIAssistance} from '../src/components/ai-assistance';
import NewsScreen from '../src/components/news-screen';
import type {Snapshot} from '../src/lib/types';

const state=vi.hoisted(()=>({data:{} as Snapshot,api:vi.fn()}));
vi.mock('../src/lib/api',()=>({api:state.api}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({replace:vi.fn()})}));
vi.mock('../src/components/workspace',()=>({useWorkspace:()=>({data:state.data,demo:'student',identity:'demo:student',reload:vi.fn(),link:(path:string,params?:Record<string,string>)=>path+'?'+new URLSearchParams({...params,demo:'student'})})}));
vi.mock('../src/components/pdf-reader',()=>({PdfReader:({src}:any)=><div data-testid="pdf-example">{src}</div>}));
beforeEach(async()=>{state.api.mockReset();state.data=(await offlineDemo('/demo/student'))!;});
afterEach(cleanup);
function mount(element:React.ReactNode){return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{element}</QueryClientProvider>);}

it('shows the current vacancy flow, linked courses and all horizons without API calls',()=>{
 mount(<LiveCareerIntelligence/>);
 expect(screen.getByRole('heading',{name:'Career matches, illustrated.'})).toBeVisible();
 expect(screen.getByText('3 fictional vacancy examples')).toBeVisible();
 expect(screen.queryByRole('link',{name:/View original/})).not.toBeInTheDocument();
 expect(screen.getAllByRole('link',{name:/Cloud Fundamentals/})[0]).toHaveAttribute('href','/app/pathway?view=course&course=demo-cloud&demo=student');
 fireEvent.click(screen.getByRole('tab',{name:'Future roles & outlook'}));
 for(const years of [5,10,15]){fireEvent.change(screen.getByLabelText('Forecast horizon'),{target:{value:String(years)}});expect(screen.getByText(`YOUR ${years}-YEAR DEVELOPMENT MAP`)).toBeVisible();}
 expect(state.api).not.toHaveBeenCalled();
});
it('shows the full expected CV assessment and does not request an analysis',()=>{
 mount(<CVAIAssessment/>);
 expect(screen.getByRole('img',{name:'Example CV score: 82 out of 100'})).toBeVisible();
 expect(screen.getAllByRole('progressbar')).toHaveLength(6);
 expect(screen.getByRole('button',{name:'Analyse saved CV'})).toBeDisabled();
 expect(screen.getByRole('link',{name:'Continue to Discover yourself'})).toHaveAttribute('href','/app/questionnaire?demo=student');
 expect(state.api).not.toHaveBeenCalled();
});
it('shows example improvements, a badge addition and a bundled PDF without provider requests',()=>{
 mount(<CVAIAssistance/>);
 expect(screen.getByRole('heading',{name:'A clearer CV, illustrated.'})).toBeVisible();
 expect(screen.getByText(/Networking Fundamentals - Networking, foundation level/)).toBeVisible();
 expect(screen.getByRole('link',{name:'Download example CV PDF'})).toHaveAttribute('href','/demos/student-improved-cv.pdf');
 fireEvent.click(screen.getByRole('button',{name:'Preview example improved CV PDF'}));
 expect(screen.getByTestId('pdf-example')).toHaveTextContent('/demos/student-improved-cv.pdf');
 expect(state.api).not.toHaveBeenCalled();
});
it('shows bundled reference topics rather than requesting live news in a demo',()=>{
 mount(<NewsScreen/>);
 expect(screen.getByText(/A hardcoded illustration of the news layout/)).toBeVisible();
 expect(screen.queryByText('Finding the latest news for you…')).not.toBeInTheDocument();
 expect(state.api).not.toHaveBeenCalled();
});
