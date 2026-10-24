'use client';

import { CartesianGrid, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import type { Match } from '@/lib/types';

export default function SkillCoverageChart({matches}:{matches:Match[]}) {
  return <div className="coverage-bars" aria-label="Technical skill coverage comparison"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={matches.map(m=>({name:m.title,coverage:m.components[0]?.score||0}))} layout="vertical" margin={{top:0,right:20,bottom:0,left:0}} accessibilityLayer><CartesianGrid horizontal={false} stroke="#edf0f6"/><XAxis type="number" domain={[0,100]} tick={{fontSize:12,fill:'#64748b'}} tickFormatter={n=>n+'%'} axisLine={false} tickLine={false}/><YAxis dataKey="name" type="category" width={180} tick={{fontSize:12,fill:'#53627a'}} axisLine={false} tickLine={false}/><Tooltip formatter={v=>[v+'%','Skill coverage']} contentStyle={{borderRadius:12,border:'1px solid #e2e8f0',fontSize:13}} cursor={{fill:'#f7f8fc'}}/><Bar dataKey="coverage" fill="#8175d5" radius={[0,5,5,0]} barSize={15} isAnimationActive={false}/></BarChart></ResponsiveContainer></div>;
}
