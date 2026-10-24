import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { watch } from 'node:fs';
import { resolve } from 'node:path';
import { checkBackend, checkFrontend, checkNode, fail, next, python, root, run, uvicorn, win } from './runtime.mjs';

const children = new Set();
const intentionalExit = new WeakSet();
let stopping = false;
let apiChild, watcher, reloadTimer;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  watcher?.close();
  clearTimeout(reloadTimer);
  process.exitCode = code;
  for (const child of children) {
    if (!child.pid) continue;
    if (win) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  }
}
function start(name, command, args, cwd = root) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', detached: !win, windowsHide: true });
  children.add(child);
  child.on('error', error => { console.error(`${name} failed to start: ${error.message}`); stop(1); });
  child.on('exit', code => {
    children.delete(child);
    if (!stopping && !intentionalExit.has(child)) { console.error(`${name} exited (code ${code}). Stopping both services.`); stop(code || 1); }
  });
  return child;
}
function available(port) {
  return new Promise((accept, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is already in use. Stop the process using it, then rerun npm run dev.`)));
    server.listen(port, '127.0.0.1', () => server.close(accept));
  });
}
async function waitForAPI() {
  const deadline = Date.now() + 30000;
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/healthz', {signal: AbortSignal.timeout(1000)});
      if (response.ok && (await response.json()).data?.status === 'ok') return true;
    } catch {}
    await new Promise(accept => setTimeout(accept, 500));
  }
  return false;
}
let reloading = false, reloadAgain = false;
async function reloadAPI() {
  if (stopping) return;
  if (reloading) { reloadAgain = true; return; }
  reloading = true;
  console.log('API source changed; restarting the API.');
  const previous = apiChild;
  if (previous && previous.exitCode === null) {
    intentionalExit.add(previous);
    const ended = new Promise(accept => previous.once('exit', accept));
    spawnSync('taskkill', ['/pid', String(previous.pid), '/T', '/F'], { stdio: 'ignore' });
    await ended;
  }
  if (!stopping) {
    apiChild = start('API', python, uvicorn);
    if (!await waitForAPI()) { console.error('API reload failed. Review the error above.'); stop(1); }
  }
  reloading = false;
  if (reloadAgain) { reloadAgain = false; void reloadAPI(); }
}
try {
  checkNode(); checkFrontend(); checkBackend();
  await Promise.all([available(8000), available(3000)]);
  run(process.execPath, ['frontend/scripts/prepare-pdfjs.cjs']);
  process.on('SIGINT', () => stop());
  process.on('SIGTERM', () => stop());
  apiChild = start('API', python, uvicorn);
  if (!await waitForAPI()) throw new Error('API did not become healthy within 30 seconds. Review the API error above, run npm run doctor, then retry.');
  if (stopping) process.exit(1);
  if (win) {
    // Avoid Uvicorn's console-wide CTRL_C_EVENT on Windows. Restart only the
    // API child after Python edits, keeping Next.js and the launcher alive.
    watcher = watch(resolve(root, 'backend/app'), { recursive: true }, (_event, filename) => {
      if (!filename?.endsWith('.py')) return;
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => void reloadAPI(), 250);
    });
    watcher.on('error', error => { console.error(`Backend watcher failed: ${error.message}`); stop(1); });
  }
  start('Website', process.execPath, [next, 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3000'], resolve(root, 'frontend'));
  console.log('\nWebsite: http://127.0.0.1:3000 | Demo: http://127.0.0.1:3000/demo/student | API: http://127.0.0.1:8000/docs');
} catch (error) { fail(error); stop(1); }
