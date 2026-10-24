import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeToggle } from '../src/components/theme-toggle';
import { THEME_KEY, themeInitScript } from '../src/lib/workspace-theme';

let systemDark = false;
let systemListeners: Set<() => void>;
beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.workspaceTheme;
  systemDark = false;
  systemListeners = new Set();
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return systemDark; },
    addEventListener: (_: string, listener: () => void) => systemListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => systemListeners.delete(listener),
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('workspace theme preference', () => {
  it('restores the saved choice before hydration, including an explicit light choice over a dark system', () => {
    systemDark = true;
    localStorage.setItem(THEME_KEY, 'light');
    new Function(themeInitScript)();
    expect(document.documentElement.dataset.workspaceTheme).toBe('light');
    localStorage.setItem(THEME_KEY, 'dark');
    new Function(themeInitScript)();
    expect(document.documentElement.dataset.workspaceTheme).toBe('dark');
  });

  it('persists the switch choice and keeps it when the control remounts', () => {
    const view = render(<ThemeToggle/>);
    fireEvent.click(screen.getByRole('switch', {name:'Dark theme'}));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    view.unmount();
    render(<ThemeToggle/>);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
    fireEvent.click(screen.getByRole('switch'));
    expect(document.documentElement.dataset.workspaceTheme).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('follows system changes until the user makes a choice, and syncs changes from another tab', () => {
    render(<ThemeToggle/>);
    act(() => { systemDark=true; systemListeners.forEach(listener=>listener()); });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
    fireEvent.click(screen.getByRole('switch'));
    act(() => { systemListeners.forEach(listener=>listener()); });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','false');
    act(() => {
      localStorage.setItem(THEME_KEY,'dark');
      window.dispatchEvent(new StorageEvent('storage',{key:THEME_KEY,newValue:'dark'}));
    });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
  });

  it('still switches when browser storage is unavailable', () => {
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Storage blocked');});
    render(<ThemeToggle/>);
    fireEvent.click(screen.getByRole('switch'));
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked','true');
  });
});
