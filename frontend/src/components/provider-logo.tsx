'use client';

import {useRef,useState} from 'react';
import {Building2,Loader2,Trash2} from 'lucide-react';
import s from './provider-logo.module.css';

export const MAX_LOGO_BYTES=256*1024;
const supported=['image/png','image/jpeg','image/webp'];

export function ProviderLogo({name,src,size='sm'}:{name:string;src?:string;size?:'sm'|'md'|'lg'}){
  const [failed,setFailed]=useState<string|null>(null);
  return <span className={`${s.logo} ${s[size]}`}>{src&&src!==failed?<img src={src} alt={`${name} logo`} referrerPolicy="no-referrer" onError={()=>setFailed(src)} width={size==='lg'?110:size==='md'?64:40} height={size==='lg'?74:size==='md'?48:32}/>:<Building2 size={size==='lg'?30:21} aria-label={`${name} logo placeholder`}/>}</span>;
}

export function readLogoFile(file:File):Promise<string>{
  if(!supported.includes(file.type))return Promise.reject(new Error('Choose a PNG, JPG or WEBP image. SVG is not supported.'));
  if(file.size>MAX_LOGO_BYTES||file.size===0)return Promise.reject(new Error('Choose a non-empty logo no larger than 256 KB.'));
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('This image could not be read. Try another file.'));reader.readAsDataURL(file);});
}

export function PartnerLogoField({value,onChange,onBusyChange}:{value:string;onChange:(value:string)=>void;onBusyChange:(busy:boolean)=>void}){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const fileInput=useRef<HTMLInputElement>(null);
  async function upload(file:File){setError('');setBusy(true);onBusyChange(true);try{onChange(await readLogoFile(file));}catch(cause){setError((cause as Error).message+' Your previous logo has been kept.');}finally{setBusy(false);onBusyChange(false);}}
  return <fieldset className={s.field}><legend>Partner logo <span>(optional)</span></legend><div className={s.preview}><ProviderLogo name="Partner" src={value} size="lg"/><p>{busy?<><Loader2 size={14} className="spin"/>Reading logo…</>:value?'Logo preview':'Your partner’s logo will appear here.'}</p>{value&&<button type="button" onClick={()=>{onChange('');setError('');if(fileInput.current)fileInput.current.value='';}} aria-label="Remove partner logo"><Trash2 size={13}/>Remove logo</button>}</div><label>Upload partner logo<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);}}/></label><label>Or use an HTTPS image URL<input type="url" pattern="https://.*" maxLength={2000} placeholder="https://partner.example/logo.png" value={value.startsWith('data:')?'':value} disabled={busy} onChange={event=>{setError('');onChange(event.target.value);}}/></label><p className={s.help}>PNG, JPG or WEBP · Up to 256 KB. Use only a logo you have permission to display. Shown on course cards, course pages and completion badges.</p>{error&&<p className={s.error} role="alert">{error}</p>}</fieldset>;
}

