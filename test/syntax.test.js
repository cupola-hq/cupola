'use strict';
// A syntax error in any shipped file is a total, silent failure -- server.js
// won't start, or a theme's render.js throws on first draw. `node -c` on
// every .js file this package actually ships catches that before it ever
// reaches npm.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walk(abs, out);
    else if (name.endsWith('.js')) out.push(abs);
  }
}

// Only the files this package actually publishes -- test/ and .github/ don't
// ship, and don't need to run in whatever Node version a user has either.
function shippedJsFiles() {
  const out = [];
  for (const entry of pkg.files) {
    const abs = path.join(ROOT, entry);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, out);
    else if (entry.endsWith('.js')) out.push(abs);
  }
  return out;
}

for (const file of shippedJsFiles()) {
  const rel = path.relative(ROOT, file);
  test(`${rel} has valid syntax`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['-c', file], { stdio: 'pipe' }));
  });
}
