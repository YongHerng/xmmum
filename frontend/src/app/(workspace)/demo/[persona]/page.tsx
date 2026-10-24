import { notFound } from 'next/navigation';
import { Screen } from '@/components/screens';
export function generateStaticParams() {
  // Avoid concurrent development prerender-manifest writes with the app routes.
  if(process.env.NODE_ENV==='development')return [];
  return ['student','professional'].map(persona=>({persona}));
}
export default async function Page({params}:{params:Promise<{persona:string}>}) {
  const {persona}=await params;
  if(!['student','professional'].includes(persona))notFound();
  return <Screen screen="dashboard"/>;
}
