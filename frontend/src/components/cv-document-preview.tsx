'use client';

import {useEffect,useRef,useState} from 'react';
import {FileText,Loader2} from 'lucide-react';
import styles from './cv-reader.module.css';

type Props={source:Uint8Array|null;page:number;onReady:(page:number,total:number)=>void;onError:(message:string)=>void};
export function CVDocumentPreview({source,page,onReady,onError}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [ratio,setRatio]=useState(595/842);
  useEffect(()=>{
    if(!source)return;
    let active=true;
    let task:import('pdfjs-dist').PDFDocumentLoadingTask|undefined;
    let render:import('pdfjs-dist').RenderTask|undefined;
    async function draw(){
      try{
        const pdfjs=await import('pdfjs-dist');
        if(!active)return;
        pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.min.mjs';
        task=pdfjs.getDocument({data:source!.slice(),standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/'});
        const document=await task.promise;
        const pdfPage=await document.getPage(Math.min(page+1,document.numPages));
        if(!active||!canvas.current)return;
        const bounds=pdfPage.getViewport({scale:1});
        const scale=Math.min(1.5,2400/Math.max(bounds.width,bounds.height),Math.sqrt(4_000_000/(bounds.width*bounds.height)));
        const viewport=pdfPage.getViewport({scale});
        setRatio(viewport.width/viewport.height);
        const target=canvas.current;
        target.width=Math.floor(viewport.width);target.height=Math.floor(viewport.height);
        const context=target.getContext('2d');
        if(!context)throw new Error('Document preview is unavailable in this browser.');
        render=pdfPage.render({canvas:target,canvasContext:context,viewport});
        await render.promise;
        if(active)onReady(page,document.numPages);
      }catch(error){if(active)onError(error instanceof Error?error.message:'Could not display this document.');}
    }
    void draw();
    return()=>{active=false;render?.cancel();void task?.destroy();};
  },[source,page,onReady,onError]);
  return <div className={styles.paperCanvas} style={{aspectRatio:ratio}}>
    {source?<canvas ref={canvas} aria-label={`CV document preview, page ${page+1}`}/>:<div className={styles.preparing}><FileText size={28}/><Loader2 size={16} className="spin"/><span>Preparing document…</span></div>}
  </div>;
}
