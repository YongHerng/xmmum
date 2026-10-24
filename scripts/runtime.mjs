import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const win = process.platform === 'win32';
export const python = resolve(root, win ? 'backend/.venv/Scripts/python.exe' : 'backend/.venv/bin/python');
export const next = resolve(root, 'frontend/node_modules/next/dist/bin/next');
export const uvicorn = ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000', ...(!win ? ['--reload', '--reload-dir', 'backend/app'] : [])];

export function checkNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) throw new Error('Node.js 22.13+ is required. Node.js 24 is recommended.');
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error(`${command} failed${result.error ? `: ${result.error.message}` : ` (exit ${result.status})`}.`);
  return result;
}

export function checkBackend() {
  if (!existsSync(python)) throw new Error('Backend virtual environment is missing. Run npm run setup from the repository root.');
  const result = spawnSync(python, ['-c', 'import sys; assert sys.version_info >= (3, 12); import uvicorn, app.main'], {
    cwd: resolve(root, 'backend'), encoding: 'utf8',
  });
  if (result.error || result.status !== 0) {
    // Invalid settings can include secrets in tracebacks; never echo captured output.
    throw new Error('Backend preflight failed. Use Python 3.12+, run npm run setup, and check root .env values.');
  }
}

export function checkFrontend() {
  if (!existsSync(next)) throw new Error('Frontend dependencies are missing. Run npm run setup.');
}

export function checkFrontendInstallable(frontend = resolve(root, 'frontend')) {
  if (!win || !existsSync(resolve(frontend, 'node_modules'))) return;
  // A loaded Windows DLL can still be opened exclusively, but cannot be deleted.
  // Check loaded native modules before npm ci starts removing node_modules.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', String.raw`
    $ErrorActionPreference = 'Stop'
    $prefix = [System.IO.Path]::GetFullPath($env:FUTUREPROOF_SETUP_FRONTEND).TrimEnd('\') + '\node_modules\'
    Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
      $nodeProcess = $_
      try { $modules = @($nodeProcess.Modules) } catch { return }
      foreach ($module in $modules) {
        if ($module.FileName.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -and $module.FileName.EndsWith('.node')) {
          Write-Output "PID $($nodeProcess.Id): $($module.FileName)"
        }
      }
    }
  `], { cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, FUTUREPROOF_SETUP_FRONTEND: frontend } });
  if (result.error || result.status !== 0) {
    throw new Error('Could not check for running frontend processes. Stop this project\'s dev/build/test commands, then rerun npm run setup.');
  }
  if (result.stdout.trim()) {
    throw new Error(`Frontend native dependencies are in use:\n${result.stdout.trim()}\nStop this project's dev/build/test commands (Ctrl+C in their terminals), then rerun npm run setup. Dependencies have not been changed.`);
  }
}

export function fail(error) {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
}
