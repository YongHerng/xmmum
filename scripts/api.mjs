import { checkBackend, fail, python, run, uvicorn } from './runtime.mjs';

try {
  checkBackend();
  run(python, process.argv.includes('--test') ? ['-m', 'pytest', 'backend/tests', '-q'] : uvicorn);
} catch (error) { fail(error); }
