import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { spawn } from 'node:child_process';

// Exercise the production bundle through a plain file server, under a repository path.
// This is a test harness, not a production server or a deployment command.
const root = resolve(import.meta.dirname, '../dist');
const mount = '/saas-incremental/';
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};
const failures = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/favicon.ico') {
    response.writeHead(204);
    response.end();
    return;
  }
  const relative = pathname.startsWith(mount) ? pathname.slice(mount.length) : pathname.slice(1);
  const file = resolve(root, relative || 'index.html');
  try {
    if (!file.startsWith(root + sep)) throw new Error('Outside build');
    const data = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(data);
  } catch {
    failures.push(pathname);
    response.writeHead(404);
    response.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  for (const path of ['/', mount]) {
    const url = origin + path;
    const html = await fetch(url).then((response) => response.text());
    assert.ok(!html.includes('/src/'), 'Build must use compiled assets');
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(assets.some((asset) => asset.endsWith('.js')));
    assert.ok(assets.some((asset) => asset.endsWith('.css')));
    for (const asset of assets) {
      assert.ok(asset.startsWith('./'), 'Asset paths must be relative');
      assert.equal((await fetch(new URL(asset, url))).status, 200);
    }
  }
  const child = spawn(process.execPath, ['tools/early-game-review.mjs'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: { ...process.env, TEST_URL: origin + mount },
    stdio: 'inherit',
    timeout: 120_000,
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.equal(code, 0, 'Chrome production checks must pass');
  assert.deepEqual(failures, [], 'All browser resources must be served from dist');
  console.log(
    'Static production check passed at / and /saas-incremental/; Chrome gameplay passed under the subdirectory.',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
