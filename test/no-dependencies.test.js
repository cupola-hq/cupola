'use strict';
// Zero dependencies is a hard project constraint (see the "//" guard comment
// at the top of package.json, and CONTRIBUTING.md). This is the machine-
// checked version of that guard: a PR that adds a "dependencies" field
// should fail CI, not just rely on a reviewer noticing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const pkg = require(path.join(__dirname, '..', 'package.json'));

test('package.json has no "dependencies" field', () => {
  assert.equal(pkg.dependencies, undefined,
    'dependencies field is not allowed -- see the "//" comment in package.json and CONTRIBUTING.md');
});

test('package.json has no "peerDependencies" or "optionalDependencies" either', () => {
  assert.equal(pkg.peerDependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
});
