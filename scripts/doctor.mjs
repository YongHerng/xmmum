import { checkBackend, checkFrontend, checkNode, fail, python, run } from './runtime.mjs';

try {
  checkNode();
  checkFrontend();
  checkBackend();
  console.log(`Node ${process.versions.node}; frontend and backend dependencies: OK`);
  run(python, ['backend/doctor.py']);
} catch (error) { fail(error); }
