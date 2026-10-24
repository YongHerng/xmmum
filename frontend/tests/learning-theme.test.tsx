import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {Workspace} from '../src/components/workspace';
import {THEME_KEY} from '../src/lib/workspace-theme';

const route=vi.hoisted(()=>({query:'view=learn&course=networking&demo=student'}));
vi.mock('next/navigation',()=>({usePathname:()=>'/app/pathway',useSearchParams:()=>new URLSearchParams(route.query),useParams:()=>({}),useRouter:()=>({replace:vi.fn()})}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:undefined,error:null,isFetching:false}),useQueryClient:()=>({clear:vi.fn()})}));
vi.mock('../src/components/session-provider',()=>({useSession:()=>({session:null,ready:true,error:null,retry:vi.fn()})}));
vi.mock('../src/lib/api',()=>({api:vi.fn(),supabase:null}));

const css=(name:string)=>readFileSync(resolve(__dirname,`../src/components/${name}.module.css`),'utf8');
beforeEach(()=>{
  localStorage.clear();document.documentElement.dataset.workspaceTheme='light';
  route.query='view=learn&course=networking&demo=student';
  vi.stubGlobal('matchMedia',(query:string)=>({matches:query.includes('1024')||query.includes('reduced-motion'),addEventListener:vi.fn(),removeEventListener:vi.fn()}));
});
afterEach(()=>{cleanup();delete document.documentElement.dataset.workspaceTheme;vi.unstubAllGlobals();});

describe('learning uses the main workspace theme',()=>{
  it('separates publish checklist rows from the badge notice and spaces skills panels',()=>{
    const source=css('learning');
    expect(source).not.toMatch(/\.publish\s*>\s*div\b/);
    expect(source).toMatch(/\.publishItem\{[^}]*grid-template-columns:44px minmax\(0,1fr\) auto/);
    expect(source).toMatch(/\.badgeAutomation\{[^}]*display:flex;align-items:flex-start;gap:14px/);
    expect(source).toMatch(/\.badgeAutomation>span\{[^}]*min-width:0/);
    expect(source).toMatch(/\.skillMapping\{[^}]*margin:24px 0/);
    expect(source).toContain('.skillMapping[open] .skillMappingChevron{transform:rotate(180deg)}');
  });
  it('keeps the shared theme switch available in the full-page classroom',()=>{
    const view=render(<Workspace><span>Classroom</span></Workspace>);
    expect(view.container.querySelector('.sidebar')).not.toBeInTheDocument();
    const toggle=screen.getByRole('switch',{name:'Dark theme'});
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked','true');
    expect(document.documentElement.dataset.workspaceTheme).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    route.query='view=catalogue&demo=student';
    view.rerender(<Workspace><span>Catalogue</span></Workspace>);
    expect(view.container.querySelector('.sidebar')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
    fireEvent.click(screen.getByRole('switch'));
    expect(document.documentElement.dataset.workspaceTheme).toBe('light');
    route.query='view=learn&course=networking&demo=student';
    view.rerender(<Workspace><span>Classroom again</span></Workspace>);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','false');
  });

  it('does not shadow main theme tokens or force the classroom to light mode',()=>{
    const focus=css('workspace');
    expect(focus).not.toMatch(/--(?:bg|surface|text|muted|border|indigo|lavender)\s*:/);
    expect(focus).not.toMatch(/color-scheme\s*:\s*light|data-workspace-theme/);
    expect(focus).toContain('background:var(--bg)');
  });

  it.each(['learning','classroom','course-curriculum','profile','match-skill-evidence'])('%s UI colours come from shared semantic tokens',name=>{
    const source=css(name);
    expect(source).not.toMatch(/#[\da-f]{3,8}\b|(?:background|color)\s*:\s*(?:white|black)\b/i);
    expect(source).toContain('var(--muted)');
    expect(source).toContain('var(--border)');
  });

  it('only keeps original document pixels, video canvas and partner artwork unthemed',()=>{
    expect(css('learning-materials').match(/#[\da-f]{3,8}\b/gi)).toEqual(['#17181b','#fff']);
    expect(css('learning-materials')).toMatch(/\.pdfText\{[^}]*color:var\(--muted\);background:var\(--surface\)/);
    expect(css('provider-logo').match(/#[\da-f]{3,8}\b/gi)).toEqual(['#fff']);
    expect(css('provider-logo')).toContain('.logo:has(img){background:#fff');
    expect(css('provider-logo')).toMatch(/\.logo\{[^}]*background:var\(--surface\)/);
  });

  it.each(['light','dark'])('main token pairs keep readable contrast in %s mode',mode=>{
    const source=readFileSync(resolve(__dirname,'../src/app/workspace-redesign.css'),'utf8');
    const blocks=Array.from(source.matchAll(/[^{}]+\{([^{}]*)\}/g));
    const block=blocks.find(match=>mode==='dark'?match[0].includes("data-workspace-theme='dark'"):match[0].trimStart().startsWith('/*')&&match[0].includes('.workspace'));
    expect(block).toBeDefined();
    const tokens=Object.fromEntries(Array.from(block![1].matchAll(/(--[\w-]+):\s*(#[\da-f]{3,6})/gi),m=>[m[1],m[2]]));
    const luminance=(hex:string)=>{
      const full=hex.length===4?'#'+hex.slice(1).split('').map(c=>c+c).join(''):hex;
      return [0.2126,0.7152,0.0722].reduce((sum,weight,index)=>{
        const value=parseInt(full.slice(1+index*2,3+index*2),16)/255;
        return sum+weight*(value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4));
      },0);
    };
    for(const [fg,bg] of [['--text','--surface'],['--muted','--surface'],['--indigo','--lavender'],['--green-text','--mint'],['--warning-text','--warning-bg'],['--error-text','--error-bg']]){
      const values=[luminance(tokens[fg]),luminance(tokens[bg])].sort((a,b)=>b-a);
      expect((values[0]+0.05)/(values[1]+0.05),`${mode}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
