import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { checkFrontendInstallable, root, win } from './runtime.mjs';

const swc = resolve(root, 'frontend/node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node');

test('Windows setup detects loaded native modules only in the target project', {
  skip: !win || !existsSync(swc), timeout: 30000,
}, async () => {
  const fixture = mkdtempSync(join(tmpdir(), "futureproof setup ' "));
  const frontend = join(fixture, 'frontend');
  const native = join(frontend, 'node_modules', '@next', 'swc-win32-x64-msvc', 'next-swc.win32-x64-msvc.node');
  let child;
  try {
    assert.doesNotThrow(() => checkFrontendInstallable(frontend));
    mkdirSync(dirname(native), { recursive: true });
    copyFileSync(swc, native);
    assert.doesNotThrow(() => checkFrontendInstallable(frontend));
    child = spawn(process.execPath, ['-e', 'require(process.argv[1]); process.send("loaded"); setInterval(() => {}, 1000);', native], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'], windowsHide: true,
    });
    await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => { throw new Error(`Native module loader exited early (${code})`); }),
    ]);
    assert.throws(() => checkFrontendInstallable(frontend), error => {
      assert.match(error.message, /Frontend native dependencies are in use/);
      assert.ok(error.message.includes(`PID ${child.pid}: ${native}`));
      assert.match(error.message, /Ctrl\+C/);
      assert.match(error.message, /Dependencies have not been changed/);
      return true;
    });
    assert.ok(existsSync(native));
    const otherFrontend = join(fixture, 'other-frontend');
    mkdirSync(join(otherFrontend, 'node_modules'), { recursive: true });
    assert.doesNotThrow(() => checkFrontendInstallable(otherFrontend));
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    assert.doesNotThrow(() => checkFrontendInstallable(frontend));
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    rmSync(fixture, { recursive: true, force: true });
  }
});
