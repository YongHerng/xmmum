// Supabase sessions last for this browser tab, rather than being remembered
// indefinitely in localStorage. Reloads and in-app navigation keep the session.
const memory = new Map<string, string>();
export const authSessionStorage = {
  getItem(key: string): string | null {
    if (typeof window === 'undefined') return null;
    try { return window.sessionStorage.getItem(key) ?? memory.get(key) ?? null; } catch { return memory.get(key) ?? null; }
  },
  setItem(key: string, value: string) {
    if (typeof window === 'undefined') return;
    try { window.sessionStorage.setItem(key, value); memory.delete(key); } catch { memory.set(key, value); }
  },
  removeItem(key: string) {
    if (typeof window === 'undefined') return;
    memory.delete(key);
    try { window.sessionStorage.removeItem(key); } catch { /* Memory fallback is already cleared. */ }
  },
};
