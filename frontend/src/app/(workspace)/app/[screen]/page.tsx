import { Screen } from '@/components/screens';
export function generateStaticParams() {
  // Next dev can race while writing the shared manifest for app and demo routes.
  // Generate pages on demand locally; keep production prerendering below.
  if(process.env.NODE_ENV==='development')return [];
  return ['dashboard','questionnaire','cv','results','pathway','profile','sdg','community','news'].map(screen=>({screen}));
}
export default async function Page({params}:{params:Promise<{screen:string}>}) {
  const {screen}=await params;
  return <Screen screen={screen}/>;
}
