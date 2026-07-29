'use strict';
// Regression test for a real bug: hook.sh (and every other tracked file) was
// getting CRLF line endings baked into published npm tarballs. Git's own
// history was always clean LF -- the corruption happened at the checkout/
// publish boundary, on a machine with core.autocrlf=true, which .gitattributes
// (eol=lf) now prevents. This test catches a recurrence regardless of cause:
// if any tracked text file has CRLF on disk when this runs, something
// upstream (a stale .gitattributes, a bypassed git config, a bad editor
// setting) let it back in. hook.sh matters most -- CRLF there breaks its
// #!/bin/sh shebang or throws `$'\r': command not found` -- but every
// tracked file is checked, since that's what actually broke last time.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// Binary files don't have "line endings" at all -- checking them for \r\n is
// not just pointless, it's actively wrong: compressed image data is close
// enough to random bytes that a stray 0x0D 0x0A pair turning up by pure
// chance is likely, not exceptional (caught this the hard way: the two PNG
// screenshots on the landing page both tripped this check on their first
// commit). Skip by extension rather than trying to content-sniff -- simpler,
// and every binary type this repo is likely to ever hold is a known format.
const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.pdf', '.zip', '.gz',
]);

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

test('every git-tracked text file has LF line endings, not CRLF', () => {
  const offenders = [];
  for (const rel of trackedFiles()) {
    if (BINARY_EXT.has(path.extname(rel).toLowerCase())) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
    const buf = fs.readFileSync(abs);
    // latin1 keeps a 1:1 byte<->char mapping, so this counts raw \r\n pairs
    // regardless of the file's actual text encoding.
    const text = buf.toString('latin1');
    const crlf = (text.match(/\r\n/g) || []).length;
    if (crlf > 0) offenders.push(`${rel} (${crlf} CRLF occurrences)`);
  }
  assert.deepEqual(offenders, [],
    `found CRLF line endings in: ${offenders.join(', ')} -- check .gitattributes is present and committed`);
});

test('hook.sh specifically has a clean #!/bin/sh shebang (no trailing \\r)', () => {
  const first = fs.readFileSync(path.join(ROOT, 'hook.sh'), 'utf8').split('\n')[0];
  assert.equal(first, '#!/bin/sh');
});
