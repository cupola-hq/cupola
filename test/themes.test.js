'use strict';
// Wraps the existing headless conformance checker (bin/check-theme.js) so it
// runs as part of the regular test suite / CI, not just something a
// contributor has to remember to run by hand.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHECKER = path.join(ROOT, 'bin', 'check-theme.js');

function checkTheme(themeDir) {
  return spawnSync(process.execPath, [CHECKER, themeDir], { cwd: ROOT, encoding: 'utf8' });
}

for (const theme of ['house', 'car']) {
  test(`${theme} theme passes containment conformance`, () => {
    const result = checkTheme(path.join('public', 'themes', theme));
    assert.equal(result.status, 0, `check-theme.js exited ${result.status}:\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /PASS -- 0 failure\(s\)/);
  });
}
