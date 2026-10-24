export const THEME_KEY = 'futureproof-workspace-theme';

// Runs before paint so a saved dark workspace does not flash light on reload.
// The main page, authentication, and workspace share this preference.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.dataset.workspaceTheme=(t==='light'||t==='dark')?t:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){document.documentElement.dataset.workspaceTheme='light'}})();`;
