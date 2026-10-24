import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkBackend, checkFrontendInstallable, checkNode, fail, python, root, run, win } from './runtime.mjs';

try {
  checkNode();
  checkFrontendInstallable();
  for (const [source, target] of [['.env.example', '.env'], ['frontend/.env.example', 'frontend/.env.local']]) {
    if (!existsSync(resolve(root, target))) {
      copyFileSync(resolve(root, source), resolve(root, target));
      console.log(`Created ${target}; existing configuration is never overwritten.`);
    }
  }
  if (!existsSync(python)) {
    const candidates = win ? [['py', '-3.12'], ['python'], ['python3']] : [['python3.12'], ['python3'], ['python']];
    const candidate = candidates.find(([command, ...args]) => spawnSync(command, [...args, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3,12) else 1)'], { stdio: 'ignore' }).status === 0);
    if (!candidate) throw new Error('Install Python 3.12+ and make it available on PATH, then rerun npm run setup.');
    const [command, ...args] = candidate;
    run(command, [...args, '-m', 'venv', 'backend/.venv']);
  }
  run(python, ['-m', 'ensurepip', '--upgrade']);
  run(python, ['-m', 'pip', 'install', '-r', 'backend/requirements.lock']);
  // npm_execpath avoids shell quoting and npm.cmd spawning problems on Windows.
  if (!process.env.npm_execpath) throw new Error('Run this script through npm run setup.');
  run(process.execPath, [process.env.npm_execpath, '--prefix', 'frontend', 'ci']);
  checkBackend();
  console.log('\nSetup complete. Run npm run doctor, then npm run dev.');
  console.log('Demos: http://127.0.0.1:3000/demo/student. Personal accounts need Supabase configuration; see README.md.');
} catch (error) { fail(error); }
