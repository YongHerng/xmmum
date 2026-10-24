import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useReducedMotionPreference} from '../src/lib/use-reduced-motion';

afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('follows preference changes live and removes its listener on unmount',()=>{
  let matches=false;
  const listeners=new Set<()=>void>();
  vi.stubGlobal('matchMedia',()=>({get matches(){return matches},addEventListener:(_event:string,fn:()=>void)=>listeners.add(fn),removeEventListener:(_event:string,fn:()=>void)=>listeners.delete(fn)}));
  const {result,unmount}=renderHook(()=>useReducedMotionPreference());
  expect(result.current).toBe(false);
  act(()=>{matches=true;listeners.forEach(fn=>fn())});expect(result.current).toBe(true);
  act(()=>{matches=false;listeners.forEach(fn=>fn())});expect(result.current).toBe(false);
  unmount();expect(listeners.size).toBe(0);
});
