import type { NextConfig } from 'next';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
// Export only the two public auth settings, never the database or AI configuration.
const rootEnv=fileURLToPath(new URL('../.env',import.meta.url));
const rootSettings=existsSync(rootEnv)?parseEnv(readFileSync(rootEnv,'utf8')):{};
const config: NextConfig = { poweredByHeader: false, devIndicators: false,
  // Isolate production verification from a running Windows development server.
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  // /app/news and /app/community are real pages now; only the old tracker path still points into the SDG tabs.
  async redirects(){return [{source:'/app/forum',destination:'/app/community',permanent:false},{source:'/app/tracker',destination:'/app/sdg?tab=progress',permanent:false}];},
  env: {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || rootSettings.SUPABASE_URL || '',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || rootSettings.SUPABASE_PUBLISHABLE_KEY || '',
} };
export default config;
