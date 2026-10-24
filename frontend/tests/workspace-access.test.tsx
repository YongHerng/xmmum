import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {WorkspaceAccess} from '../src/components/workspace-access';

const route=vi.hoisted(()=>({persona:undefined as string|undefined,query:''}));
vi.mock('next/navigation',()=>({useParams:()=>({persona:route.persona}),useSearchParams:()=>new URLSearchParams(route.query)}));
vi.mock('../src/components/require-session',()=>({RequireSession:()=> <p>Sign in required</p>}));
afterEach(()=>{cleanup();route.persona=undefined;route.query='';});

it('opens the fictional demo without requiring an account',()=>{
  route.persona='student';render(<WorkspaceAccess>Demo content</WorkspaceAccess>);
  expect(screen.getByText('Demo content')).toBeVisible();
});
it('preserves public demo access across workspace navigation',()=>{
  route.query='demo=professional';render(<WorkspaceAccess>Demo content</WorkspaceAccess>);
  expect(screen.getByText('Demo content')).toBeVisible();
});
it.each(['','demo=unknown'])('requires sign in for personal or invalid demo routes (%s)',query=>{
  route.query=query;render(<WorkspaceAccess>Private content</WorkspaceAccess>);
  expect(screen.getByText('Sign in required')).toBeVisible();
  expect(screen.queryByText('Private content')).not.toBeInTheDocument();
});
