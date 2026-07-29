'use strict';
// Catches a package.json "files" entry that points at something renamed or
// deleted -- silent on `npm publish` (npm just skips it), only discovered by
// a user with a broken install.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

test('every package.json "files" entry exists on disk', () => {
  const missing = pkg.files.filter(entry => !fs.existsSync(path.join(ROOT, entry)));
  assert.deepEqual(missing, []);
});

test('the bin entry exists and is executable JS', () => {
  const binPath = path.join(ROOT, pkg.bin.cupola);
  assert.ok(fs.existsSync(binPath), `${pkg.bin.cupola} does not exist`);
  const first = fs.readFileSync(binPath, 'utf8').split('\n')[0];
  assert.match(first, /^#!\/usr\/bin\/env node/);
});

test('package.json parses as valid JSON with no trailing issues', () => {
  // require() above already proved this parses; this asserts the
  // fields npm actually needs at publish time are present.
  for (const field of ['name', 'version', 'license', 'engines']) {
    assert.ok(pkg[field], `package.json is missing "${field}"`);
  }
});
