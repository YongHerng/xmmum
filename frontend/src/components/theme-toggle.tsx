'use client';

import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_KEY } from '@/lib/workspace-theme';

type Theme = 'light' | 'dark';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch { return null; }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.workspaceTheme = theme;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onSystemChange = () => { if (!storedTheme()) applyTheme(systemTheme()); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === null) applyTheme(storedTheme() ?? systemTheme());
  };
  media.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}

function snapshot(): Theme {
  return document.documentElement.dataset.workspaceTheme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => 'light' as const);
  const dark = theme === 'dark';
  function toggle() {
    const next = dark ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* The switch still works without storage. */ }
  }
  return <button type="button" role="switch" aria-label="Dark theme" aria-checked={dark}
    className="theme-toggle" onClick={toggle} title={`Switch to ${dark ? 'light' : 'dark'} theme`}>
    <span key={theme} className="theme-toggle-icon" aria-hidden="true">{dark ? <Moon size={18}/> : <Sun size={18}/>}</span>
  </button>;
}
