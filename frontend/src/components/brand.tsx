import Link from 'next/link';
import { useId } from 'react';

export function Brand({compact=false}:{compact?:boolean}) {
  const gradientId = `pravista-gradient-${useId().replace(/:/g,'')}`;

  return <Link href="/" className="brand" aria-label="Pravista home">
    <span className="brand-mark">
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <defs><linearGradient id={gradientId} x1="9" y1="19" x2="55" y2="48" gradientUnits="userSpaceOnUse"><stop stopColor="#A044F5"/><stop offset=".52" stopColor="#246BFF"/><stop offset="1" stopColor="#00D7E8"/></linearGradient></defs>
        <path d="M7 35a25 25 0 0 1 50 0c-8-7-16-7-25 0-8-7-17-7-25 0Z" fill={`url(#${gradientId})`}/>
        <path d="M32 10v25M32 10c-8 7-12 15-13 23m13-23c8 7 12 15 13 23" stroke="#F8FBFF" strokeWidth="1.7" strokeLinecap="round"/>
        <path d="M17 57c-2-10 5-16 16-23l9-6-4-.2a2 2 0 0 1 .1-4l13 .6a2 2 0 0 1 1.8 2.3l-2 12.5a2 2 0 0 1-4-.6l.6-4.1C39 43 29 49 24 58Z" fill={`url(#${gradientId})`}/>
      </svg>
    </span>
    {!compact&&<span className="brand-wordmark">pravista</span>}
  </Link>;
}
