import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({resolve:{alias:{'@':resolve(__dirname,'src')}},test:{environment:'jsdom',include:['tests/**/*.test.{ts,tsx}'],setupFiles:['./tests/setup.ts'],globals:true}});
