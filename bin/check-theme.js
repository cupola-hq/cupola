#!/usr/bin/env node
'use strict';
// bin/check-theme.js -- the headless half of the conformance contract
// (THEMES.md §2.1.2, §6). Same code as the browser's ?theme=X&fake=N&boxes=1
// harness -- both call theme-engine.js's layoutTheme()/checkContainment(),
// so this can never disagree with what the page draws.
//
//   node bin/check-theme.js <themeDir>       # default: public/themes/house
//
// What it checks, in order:
//   1. format/schema sanity (format:1, world, regions, portals, places, actor)
//   2. every place's overflow chain terminates at a `field` (static -- before
//      a single actor is placed, per THEMES.md's "converts the hardest-won
//      lesson... into a machine-checked property")
//   3. containment: places n synthetic actors, in every state mix, for
//      n in {1,8,17,25,40} (THEMES.md §2.1.2's matrix), and verifies zero
//      ESCAPES at every n (compression/overlap past the room's soft capacity
//      is expected and reported, not failed -- "compression is the doctrine,
//      escape is the bug")
//
// Known, accepted limitation (matches the browser harness exactly, not
// introduced here): a single-shot placement has no prior sprite position, so
// `homeOnly`-restricted slots (idle-only-sits-where-it-already-is) never
// qualify on a fresh run -- those sessions fall through to the field, same
// as `?fake=40` on a cold load. Not a bug in this checker; it is the same
// artifact the task brief calls out for the browser harness.

const path = require('path');
const fs = require('fs');
const ThemeEngine = require(path.join(__dirname, '..', 'public', 'theme-engine.js'));

const dirArg = process.argv[2] || path.join(__dirname, '..', 'public', 'themes', 'house');
const themeDir = path.isAbsolute(dirArg) ? dirArg : path.join(process.cwd(), dirArg);
const themePath = path.join(themeDir, 'theme.json');

let theme;
try {
  theme = JSON.parse(fs.readFileSync(themePath, 'utf8'));
} catch (e) {
  console.error(`could not read/parse ${themePath}: ${e.message}`);
  process.exit(1);
}

let failures = 0;
const fail = msg => { failures++; console.log(`  FAIL  ${msg}`); };
const pass = msg => console.log(`  ok    ${msg}`);

console.log(`theme: ${theme.name || '(unnamed)'} -- ${themePath}\n`);

// ---- 1. schema sanity -------------------------------------------------------
console.log('schema');
if (theme.format !== 1) fail(`format is ${theme.format}, expected 1`); else pass('format: 1');
for (const req of ['world', 'regions', 'portals', 'places', 'actor']) {
  if (!theme[req]) fail(`missing top-level "${req}"`); else pass(`has "${req}"`);
}
if (theme.world && (theme.world.w !== 1000 || theme.world.h !== 790)) {
  console.log(`  note  world is ${theme.world.w}x${theme.world.h}, not the 1000x790 v1 assumes (THEMES.md §5.1)`);
}
if (!theme.actor || !theme.actor.footprint || !theme.actor.footprint.standing || !theme.actor.footprint.posed) {
  fail('actor.footprint.standing/posed required for the containment check');
}

// ---- 2. overflow chains, statically ----------------------------------------
console.log('\noverflow chains');
const chain = ThemeEngine.checkOverflowChains(theme);
if (chain.ok) pass('every non-field, non-loop place terminates at a field');
else for (const e of chain.errors) fail(e);

// ---- 3. containment, n x state-mix matrix -----------------------------------
console.log('\ncontainment (n actors, zero escapes required at every n)');

const N_VALUES = [1, 8, 17, 25, 40];
const ACTIVITIES = ['exec', 'edit', 'read', 'net', 'delegate', 'plan'];
const DEFAULT_STATES = ['working', 'idle', 'stale', 'blocked'];

function synth(n, mix) {
  return Array.from({ length: n }, (_, i) => {
    let state, activity;
    if (mix === 'all-blocked') { state = 'blocked'; activity = null; }
    else if (mix === 'all-stale') { state = 'stale'; activity = null; }
    else if (mix.startsWith('activity:')) { state = 'working'; activity = mix.slice(9); }
    else { state = DEFAULT_STATES[i % DEFAULT_STATES.length]; activity = ACTIVITIES[i % ACTIVITIES.length]; }
    return { id: `chk-${mix}-${n}-${i}`, state, activity, tier: 'plain', heft: 0 };
  });
}

function placeAndCheck(n, mix) {
  const sessions = synth(n, mix);
  const sprites = new Map();
  const held = { heldSeat: new Map(), heldFloor: new Map(), heldLoop: new Map() };
  // t=0: loop-kind places (if any) are evaluated at a fixed instant -- fine
  // for a static containment check, which only cares about the placement
  // formula's spacing guarantee, not any particular animation frame.
  const placed = ThemeEngine.layoutTheme(theme, sessions, sprites, held, 0);
  for (const s of sessions) {
    const p = placed.get(s.id);
    if (p) sprites.set(s.id, { x: p.pt.x, y: p.pt.y, pose: p.pose || null, moving: false });
  }
  return ThemeEngine.checkContainment(theme, sprites);
}

const mixes = ['default', 'all-blocked', 'all-stale', ...ACTIVITIES.map(a => `activity:${a}`)];
const onset = new Map(mixes.map(m => [m, null]));

for (const mix of mixes) {
  let mixOk = true;
  const row = [];
  for (const n of N_VALUES) {
    const r = placeAndCheck(n, mix);
    if (!r.ok) { mixOk = false; fail(`${mix}: n=${n} escaped containment (${r.escapes.length} actor(s): ${r.escapes.slice(0, 5).join(', ')}${r.escapes.length > 5 ? '…' : ''})`); }
    if (r.clashes.length > 0 && onset.get(mix) === null) onset.set(mix, n);
    row.push(`n=${n}: ${r.ok ? 'contained' : 'ESCAPED'}${r.clashes.length ? `, ${r.clashes.length} overlapping` : ''}`);
  }
  if (mixOk) pass(`${mix}: ${row.join(' | ')}`);
}

console.log('\noverlap onset (reported, not judged -- compression is the doctrine):');
for (const [mix, n] of onset) console.log(`  ${mix.padEnd(16)} ${n === null ? 'no overlap up to n=' + N_VALUES[N_VALUES.length - 1] : 'overlap from n=' + n}`);

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} -- ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
