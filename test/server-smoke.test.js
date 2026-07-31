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

function post(pathname, bodyStr) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://127.0.0.1:${PORT}${pathname}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      res => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.end(bodyStr);
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

  // Covers what a one-off manual curl session already confirmed live (see
  // the commit that added this): a Cursor or Copilot hook, normalized by
  // server.js's normalizeToolHook(), produces a real session row through
  // the SAME pipeline a Claude Code hook does -- not a parallel code path
  // that could silently diverge. This is the part of the "other tools"
  // integration that's actually testable without a live install of either
  // tool: the normalizer and the hook-only fallback tier in scan() are
  // ordinary JS this repo owns end to end. Whether Cursor/Copilot's real
  // payloads match the shape asserted below is NOT verified here -- see
  // hooks/adapter.sh's own header for that caveat.
  await t.test('a normalized Cursor hook produces a real session row', async () => {
    await post(
      `/hook?tool=cursor&event=SessionStart&pid=1234&pane=`,
      JSON.stringify({ conversation_id: 'test-cursor-session', workspace_roots: ['/tmp/proj'] })
    );
    await post(
      `/hook?tool=cursor&event=PreToolUse&pid=1234&pane=`,
      JSON.stringify({ conversation_id: 'test-cursor-session', tool_name: 'Shell', tool_input: { command: 'npm install' }, cwd: '/tmp/proj' })
    );
    const res = await get('/api/sessions');
    const { sessions } = JSON.parse(res.body);
    const s = sessions.find(x => x.id === 'test-cursor-session');
    assert.ok(s, 'cursor session should appear via the hook-only fallback tier');
    assert.equal(s.source, 'cursor');
    assert.equal(s.state, 'working');
    assert.equal(s.chore, 'cooking');   // Shell -> Bash -> CHORES.Bash
    assert.equal(s.activity, 'exec');
    assert.equal(s.cwd, '/tmp/proj');
  });

  await t.test('a normalized Copilot hook produces a real session row', async () => {
    await post(
      `/hook?tool=copilot&event=SessionStart&pid=5678&pane=`,
      JSON.stringify({ sessionId: 'test-copilot-session', cwd: '/tmp/other' })
    );
    await post(
      `/hook?tool=copilot&event=PostToolUse&pid=5678&pane=`,
      JSON.stringify({ sessionId: 'test-copilot-session', cwd: '/tmp/other', toolName: 'bash', toolResult: { resultType: 'success' } })
    );
    const res = await get('/api/sessions');
    const { sessions } = JSON.parse(res.body);
    const s = sessions.find(x => x.id === 'test-copilot-session');
    assert.ok(s, 'copilot session should appear via the hook-only fallback tier');
    assert.equal(s.source, 'copilot');
    assert.equal(s.chore, 'cooking');   // bash -> Bash -> CHORES.Bash
    assert.equal(s.activity, 'exec');
  });

  await t.test('SessionEnd removes a hook-only session', async () => {
    await post(`/hook?tool=cursor&event=SessionEnd&pid=1234&pane=`, JSON.stringify({ conversation_id: 'test-cursor-session' }));
    const res = await get('/api/sessions');
    const { sessions } = JSON.parse(res.body);
    assert.ok(!sessions.some(x => x.id === 'test-cursor-session'));
  });

  await t.test('an unrecognized tool, event, or malformed body never crashes the daemon', async () => {
    const r1 = await post(`/hook?tool=nonsense&event=PreToolUse`, JSON.stringify({ foo: 'bar' }));
    assert.equal(r1.status, 204);
    const r2 = await post(`/hook?tool=cursor&event=NotARealEvent`, JSON.stringify({ conversation_id: 'x' }));
    assert.equal(r2.status, 204);
    const r3 = await post(`/hook?tool=cursor&event=PreToolUse`, 'not valid json{{{');
    assert.equal(r3.status, 204);
    const alive = await get('/');
    assert.equal(alive.status, 200);
  });
});
