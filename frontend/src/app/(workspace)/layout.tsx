import { Suspense } from 'react';
import { Workspace } from '@/components/workspace';
import { WorkspaceLoading } from '@/components/workspace-loading';
import { WorkspaceAccess } from '@/components/workspace-access';

// One persistent shell for /demo/* and /app/*: navigation does not reboot auth/data.
export default function Layout({children}:{children:React.ReactNode}) {
  return <Suspense fallback={<WorkspaceLoading/>}><WorkspaceAccess><Workspace>{children}</Workspace></WorkspaceAccess></Suspense>;
}
