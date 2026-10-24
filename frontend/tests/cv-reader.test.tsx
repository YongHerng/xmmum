import {useEffect} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CVReader} from '../src/components/cv-reader';
import type {CV} from '../src/lib/types';
import type {ParsedCV} from '../src/lib/cv-reader';

vi.mock('../src/lib/use-reduced-motion',()=>({useReducedMotionPreference:()=>true}));
vi.mock('../src/components/cv-document-preview',()=>({CVDocumentPreview:({source,page,onReady}:{source:unknown;page:number;onReady:(p:number,n:number)=>void})=>{
  useEffect(()=>{if(source)onReady(page,1);},[source,page,onReady]);return <div aria-label="Document preview"/>;
}}));
const blank:CV={name:'',email:'',summary:'',education:'',experience:'',projects:'',skills:[],target_role:'data-analyst',ai_consent:false};
const parsed:ParsedCV={cv:{...blank,name:'Aisha Rahman',email:'aisha@example.invalid',phone:'+60 12-345 6789',membership_licensure:'Student Member',certificates_training:'First Aid Certificate',skills:['Python','SQL'],education:'Computer Science',experience:'A research project.',projects:'An energy dashboard.'},notice:'Review your fields.',characters:200,document:{pages:[{number:1,width:595,height:842}],pdf_base64:null,used_ocr:false,reformatted:false,fields:[
  {key:'name',value:'Aisha Rahman',sources:[{page:0,box:[.1,.1,.5,.2]}],confidence:65,needs_review:true,reason:'The scan is unclear here. Check this text against the document.'},
  {key:'email',value:'aisha@example.invalid',sources:[{page:0,box:[.1,.2,.6,.3]}],confidence:96,needs_review:false,reason:''},
  {key:'skills',value:'Python, SQL',sources:[{page:0,box:[.1,.4,.7,.5]}],confidence:98,needs_review:false,reason:''},
]}};
beforeEach(()=>{Object.defineProperty(File.prototype,'arrayBuffer',{configurable:true,value:async()=>new ArrayBuffer(12)});});
afterEach(()=>{cleanup();vi.restoreAllMocks();});
function mount(parse=vi.fn().mockResolvedValue(parsed),confirm=vi.fn().mockResolvedValue(undefined)){
  render(<CVReader initialCV={blank} roles={[{id:'data-analyst',title:'Data Analyst'}]} parse={parse} confirm={confirm}/>);
  return {parse,confirm};
}
function upload(){fireEvent.change(screen.getByLabelText('Upload CV'),{target:{files:[new File(['%PDF-example'],'cv.pdf',{type:'application/pdf'})]}});}


it('extracts the full document into section tabs with one save and no skill confirmation',async()=>{
 const {parse,confirm}=mount();upload();
 await waitFor(()=>expect(screen.getByLabelText('Full name')).toHaveValue('Aisha Rahman'));
 expect(parse).toHaveBeenCalledWith(expect.any(File),expect.any(AbortSignal));
 expect(screen.queryByRole('button',{name:'Reviewed'})).not.toBeInTheDocument();
 expect(screen.getByRole('tab',{name:'Skills'})).toBeVisible();
 fireEvent.click(screen.getByRole('tab',{name:'Skills'}));
 expect(screen.getByRole('textbox',{name:'Skills'})).toHaveValue('Python, SQL');
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));
 await waitFor(()=>expect(confirm).toHaveBeenCalledWith(expect.objectContaining({name:'Aisha Rahman',skills:['Python','SQL'],education:'Computer Science',projects:'An energy dashboard.',ai_consent:false})));
});

it('shows additional sections as editable tabs and preserves them when saving',async()=>{
 const confirm=vi.fn().mockResolvedValue(undefined);
 render(<CVReader initialCV={{...parsed.cv,additional_sections:[{title:'Volunteering',content:'Helped at the community centre.'},{title:'Awards',content:'Student project award.'}]}} roles={[{id:'data-analyst',title:'Data Analyst'}]} parse={vi.fn()} confirm={confirm}/>);
 fireEvent.click(screen.getByRole('tab',{name:'Volunteering'}));
 expect(screen.getByLabelText('Volunteering content')).toHaveValue('Helped at the community centre.');
 fireEvent.change(screen.getByLabelText('Volunteering content'),{target:{value:'Documented community events.'}});
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));
 await waitFor(()=>expect(confirm).toHaveBeenCalledWith(expect.objectContaining({additional_sections:[{title:'Volunteering',content:'Documented community events.'},{title:'Awards',content:'Student project award.'}]})));
});

it('supports adding and removing a custom section without changing other sections',()=>{
 render(<CVReader initialCV={parsed.cv} roles={[]} parse={vi.fn()} confirm={vi.fn()}/>);
 fireEvent.click(screen.getByRole('button',{name:'Add section'}));
 fireEvent.change(screen.getByLabelText('Section name'),{target:{value:'Publications'}});
 expect(screen.getByRole('tab',{name:'Publications'})).toHaveAttribute('aria-selected','true');
 fireEvent.click(screen.getByRole('button',{name:'Remove section'}));
 expect(screen.queryByRole('tab',{name:'Publications'})).not.toBeInTheDocument();
 expect(screen.getByLabelText('Full name')).toHaveValue('Aisha Rahman');
});

it('starts extraction from the upload action without extra AI consent controls',async()=>{
 const {parse}=mount();
 expect(parse).not.toHaveBeenCalled();
 expect(screen.queryByRole('checkbox',{name:/AI|consent/i})).not.toBeInTheDocument();
 expect(screen.getByText(/Uploading starts AI extraction with RunPod/)).toBeVisible();
 fireEvent.change(screen.getByLabelText('Upload CV'),{target:{files:[new File(['pdf'],'cv.pdf')]}});
 await waitFor(()=>expect(parse).toHaveBeenCalledTimes(1));
});

it('cancels parsing and ignores a late result when the document is removed',async()=>{
 let complete!:(value:ParsedCV)=>void;
 const parse=vi.fn((_file:File,_signal:AbortSignal)=>new Promise<ParsedCV>(resolve=>{complete=resolve;}));
 mount(parse);upload();await waitFor(()=>expect(parse).toHaveBeenCalledTimes(1));
 const signal=parse.mock.calls[0][1];fireEvent.click(screen.getByRole('button',{name:'Remove document'}));
 expect(signal.aborted).toBe(true);await act(async()=>complete(parsed));
 expect(screen.getByLabelText('Full name')).toHaveValue('');
 expect(screen.getByRole('heading',{name:'Drop your CV here'})).toBeVisible();
});

it('rejects unsupported and oversized uploads before parsing',()=>{
 const {parse}=mount();
 fireEvent.change(screen.getByLabelText('Upload CV'),{target:{files:[new File(['x'],'cv.exe')]}});
 expect(screen.getByRole('alert')).toHaveTextContent('PDF, DOCX, JPG or PNG');
 const file=new File(['x'],'cv.pdf');Object.defineProperty(file,'size',{value:11*1024*1024});
 fireEvent.change(screen.getByLabelText('Upload CV'),{target:{files:[file]}});
 expect(parse).not.toHaveBeenCalled();
});

it('keeps the editable draft after save or analysis fails',async()=>{
 const confirm=vi.fn().mockRejectedValueOnce(new Error('Analysis unavailable')).mockResolvedValue(undefined);
 mount(undefined,confirm);upload();await waitFor(()=>expect(screen.getByLabelText('Full name')).toHaveValue('Aisha Rahman'));
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Analysis unavailable');
 fireEvent.click(screen.getByRole('tab',{name:'Skills'}));expect(screen.getByRole('textbox',{name:'Skills'})).toHaveValue('Python, SQL');
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(2));
});

it('offers manual entry and validates before saving',async()=>{
 const {confirm}=mount(vi.fn().mockRejectedValue(new Error('Unreadable scan')));upload();
 expect(await screen.findByRole('alert')).toHaveTextContent('Unreadable scan');
 fireEvent.click(screen.getByRole('button',{name:'Enter details manually'}));
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));expect(screen.getByRole('alert')).toHaveTextContent('full name');
 fireEvent.change(screen.getByLabelText('Full name'),{target:{value:'Sam Lee'}});
 fireEvent.click(screen.getByRole('tab',{name:'Skills'}));fireEvent.change(screen.getByRole('textbox',{name:'Skills'}),{target:{value:'SQL, Python, SQL'}});
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));
 await waitFor(()=>expect(confirm).toHaveBeenCalledWith(expect.objectContaining({name:'Sam Lee',skills:['SQL','Python']})));
});

it('opens old credentials-only CVs and preserves supported target IDs',async()=>{
 const confirm=vi.fn().mockResolvedValue(undefined);
 render(<CVReader initialCV={{...blank,name:'Sam Lee',certificates_training:'First Aid Certificate'}} roles={[{id:'data-analyst',title:'Data Analyst'}]} parse={vi.fn()} confirm={confirm}/>);
 expect(screen.getByRole('heading',{name:'Your CV details are saved'})).toBeVisible();
 fireEvent.click(screen.getByRole('tab',{name:'Certificates and training'}));expect(screen.getByRole('textbox',{name:'Certificates and training'})).toHaveValue('First Aid Certificate');
 fireEvent.click(screen.getByRole('button',{name:'Save & analyse CV'}));
 await waitFor(()=>expect(confirm).toHaveBeenCalledWith(expect.objectContaining({skills:[],certificates_training:'First Aid Certificate',target_role:'data-analyst'})));
});
