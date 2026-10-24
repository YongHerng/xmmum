import { Landing } from '@/components/marketing/landing';
import { RequireSession } from '@/components/require-session';
export default function Home() { return <RequireSession><Landing /></RequireSession>; }
