import {afterEach,expect,it,vi} from 'vitest';
import {authSessionStorage} from '../src/lib/session-storage';

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();sessionStorage.clear();localStorage.clear();});
it('keeps authentication in tab storage and does not restore an old localStorage session',()=>{
  localStorage.setItem('test-auth-session','old-persistent-session');
  expect(authSessionStorage.getItem('test-auth-session')).toBeNull();
  authSessionStorage.setItem('test-auth-session','current-tab-session');
  expect(sessionStorage.getItem('test-auth-session')).toBe('current-tab-session');
  expect(authSessionStorage.getItem('test-auth-session')).toBe('current-tab-session');
  sessionStorage.clear();
  expect(authSessionStorage.getItem('test-auth-session')).toBeNull();
  expect(localStorage.getItem('test-auth-session')).toBe('old-persistent-session');
});
it('uses memory when sessionStorage is blocked and clears it on sign-out',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('Blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Blocked');});
  vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('Blocked');});
  authSessionStorage.setItem('blocked-test','temporary');
  expect(authSessionStorage.getItem('blocked-test')).toBe('temporary');
  authSessionStorage.removeItem('blocked-test');
  expect(authSessionStorage.getItem('blocked-test')).toBeNull();
});
it('keeps the memory fallback usable when writes fail but reads are still allowed',()=>{
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Quota exceeded');});
  authSessionStorage.setItem('quota-test','temporary');
  expect(authSessionStorage.getItem('quota-test')).toBe('temporary');
  authSessionStorage.removeItem('quota-test');
  expect(authSessionStorage.getItem('quota-test')).toBeNull();
});
