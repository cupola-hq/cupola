'use strict';
// Starts the real daemon and hits it over HTTP -- catches "the process
// throws on startup" or "an endpoint 500s" in a way none of the other tests
// (which only check individual files in isolation) can.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Deliberately not 7777 (the real default) or 0 (server.js reads
// `Number(process.env.PORT) || 7777`, and 0 is falsy, so it would silently
// fall back to 7777 instead of an OS-assigned port) -- picked to avoid
// colliding with a dev instance a contributor might have running locally.
const PORT = 47231;

function get(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${PORT}${pathname}`, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
  });
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`server did not come up on port ${PORT} in time`);
}

test('server.js starts and serves the app over HTTP', async t => {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  let stderr = '';
  child.stderr.on('data', c => { stderr += c; });

  t.after(() => { child.kill(); });

  await waitForServer(Date.now() + 10_000);

  await t.test('GET / returns the house page', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /Cupola/);
  });

  await t.test('GET /api/sessions returns JSON', async () => {
    const res = await get('/api/sessions');
    assert.equal(res.status, 200);
    assert.doesNotThrow(() => JSON.parse(res.body));
  });

  await t.test('GET /api/themes returns JSON', async () => {
    const res = await get('/api/themes');
    assert.equal(res.status, 200);
    assert.doesNotThrow(() => JSON.parse(res.body));
  });

  await t.test('process wrote nothing to stderr on startup', () => {
    assert.equal(stderr.trim(), '');
  });
});
