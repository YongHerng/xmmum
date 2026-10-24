'use client';

import {useSyncExternalStore} from 'react';

const preference='(prefers-reduced-motion: reduce)';
const subscribe=(update:()=>void)=>{
  const media=window.matchMedia(preference);
  media.addEventListener('change',update);
  return ()=>media.removeEventListener('change',update);
};
const snapshot=()=>window.matchMedia(preference).matches;

// Follow preference changes while the page is open, not just the mount-time value.
export function useReducedMotionPreference(){return useSyncExternalStore(subscribe,snapshot,()=>true)}
