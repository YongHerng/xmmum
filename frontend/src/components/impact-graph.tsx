'use client';

import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export default function ImpactGraph({nodes,edges,onGoalClick}:{nodes:Node[];edges:Edge[];onGoalClick:(goal:number)=>void}) {
  return <ReactFlow nodes={nodes} edges={edges.map(e=>({...e,type:'smoothstep',animated:false,style:{stroke:'#9db0ba',strokeWidth:1.5},markerEnd:{type:MarkerType.ArrowClosed,color:'#9db0ba'}}))} fitView fitViewOptions={{padding:.18}} minZoom={.2} nodesDraggable={false} nodesConnectable={false} onNodeClick={(_e,node)=>{if(node.id.startsWith('goal-'))onGoalClick(+node.id.replace('goal-',''))}}><Background color="#e2e8f0" gap={20}/><Controls showInteractive={false}/></ReactFlow>;
}
