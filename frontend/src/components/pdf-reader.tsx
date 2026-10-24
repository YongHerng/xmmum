'use client';

import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy,PDFDocumentLoadingTask,RenderTask} from 'pdfjs-dist';
import {ChevronLeft,ChevronRight,FileText,Loader2,Minus,Plus} from 'lucide-react';
import m from './learning-materials.module.css';

export function PdfReader({src,name}:{src:string;name:string}){
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null);
  const [page,setPage]=useState(1);
  const [zoom,setZoom]=useState(1);
  const [width,setWidth]=useState(700);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [text,setText]=useState('');
  const [textView,setTextView]=useState(false);
  const stage=useRef<HTMLDivElement>(null);
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let cancelled=false;
    let loading:PDFDocumentLoadingTask|undefined;
    setDocument(null);setPage(1);setBusy(true);setError('');
    void (async()=>{
      const pdfjs=await import('pdfjs-dist');
      if(cancelled)return;
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
      loading=pdfjs.getDocument({url:src,enableXfa:false,useSystemFonts:true});
      loading.onPassword=()=>{if(!cancelled)setError('This PDF is password-protected. Use an unlocked lesson file.');void loading?.destroy().catch(()=>{});};
      const result=await loading.promise;
      if(!cancelled)setDocument(result);
    })().catch(()=>{if(!cancelled){setError('The PDF could not be opened. Reload it, open it in a new tab, or download the file.');setBusy(false);}});
    return ()=>{cancelled=true;void loading?.destroy().catch(()=>{});};
  },[src]);
  useEffect(()=>{
    const element=stage.current;
    if(!element)return;
    const resize=()=>setWidth(Math.max(200,Math.min(1200,element.clientWidth-32||700)));
    resize();
    if(typeof ResizeObserver==='undefined')return;
    const observer=new ResizeObserver(resize);observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>{
    if(!document)return;
    let cancelled=false;
    let rendering:RenderTask|undefined;
    setBusy(true);setError('');
    void (async()=>{
      const pdfPage=await document.getPage(page);
      const surface=canvas.current;
      if(cancelled||!surface)return;
      const context=surface.getContext('2d');
      if(!context)throw new Error('Canvas unavailable.');
      const natural=pdfPage.getViewport({scale:1});
      const viewport=pdfPage.getViewport({scale:width/natural.width*zoom});
      const ratio=Math.min(window.devicePixelRatio||1,2,Math.sqrt(6_000_000/(viewport.width*viewport.height)));
      surface.width=Math.ceil(viewport.width*ratio);surface.height=Math.ceil(viewport.height*ratio);
      surface.style.width=viewport.width+'px';surface.style.height=viewport.height+'px';
      rendering=pdfPage.render({canvas:surface,canvasContext:context,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
      await rendering.promise;
      const content=await pdfPage.getTextContent();
      if(!cancelled){setText(content.items.map(item=>'str' in item?item.str:'').join(' '));setBusy(false);}
    })().catch(reason=>{if(!cancelled&&reason?.name!=='RenderingCancelledException'){setError('This page could not be rendered. Try another page, or download the PDF.');setBusy(false);}});
    return ()=>{cancelled=true;rendering?.cancel();};
  },[document,page,width,zoom]);
  return <section className={m.pdfReader} aria-label="PDF reader">
    <div className={m.pdfToolbar}>
      <div><button type="button" aria-label="Previous PDF page" disabled={!document||page<=1||busy} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={16}/></button><span role="status" aria-live="polite">{document?`Page ${page} of ${document.numPages}`:'Opening PDF…'}</span><button type="button" aria-label="Next PDF page" disabled={!document||page>=document.numPages||busy} onClick={()=>setPage(value=>value+1)}><ChevronRight size={16}/></button></div>
      <div><button type="button" aria-label="Zoom out PDF" disabled={busy||zoom<=.75} onClick={()=>setZoom(value=>value-.25)}><Minus size={14}/></button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="Zoom in PDF" disabled={busy||zoom>=2} onClick={()=>setZoom(value=>value+.25)}><Plus size={14}/></button><button type="button" aria-pressed={textView} disabled={!text} onClick={()=>setTextView(value=>!value)}><FileText size={14}/><span>Text view</span></button></div>
    </div>
    {error&&<p className="error-box" role="alert">{error}</p>}
    <div className={m.pdfStage} ref={stage} aria-busy={busy&&!error}>
      {busy&&!error&&<span className={m.pdfLoading}><Loader2 className="spin" size={17}/>Rendering PDF…</span>}
      <canvas ref={canvas} className={textView||error?m.hiddenCanvas:undefined} role="img" aria-label={`${name}, page ${page}`}/>
      {text&&<div className={textView?m.pdfText:'sr-only'}>{text}</div>}
    </div>
  </section>;
}

