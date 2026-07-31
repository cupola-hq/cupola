'use strict';
// themes/hive/render.js -- the hive's ART, on top of theme.json's geometry.
// See themes/house/render.js's header for the full render contract; the
// short version:
//
//   buildActor(session) -> <g>   with .body/.alert/.tag/.sel/.bubble/.bub-text
//   updateActor(g, sp, s)        per-frame reads of heft/tier/activity
//   drawBackground(ctx)          cached hive/meadow furniture
//   drawFX(ctx, t)               per-frame animation on top
//
// sims.css is house-only (every selector in it is scoped under `.sim`), so
// this file injects its OWN stylesheet, same escape hatch car's render.js
// already uses. Root actor class is `.bee` (never bare `.sim` -- see car's
// header comment for why `sim` is ALSO added: index.html's camera-drag
// handler only lets a click through when `e.target.closest('.sim')` matches,
// so the class list is `bee sim`, exactly car's `car sim` pattern).

(function () {

if (!document.getElementById('hive-theme-style')) {
  const style = document.createElement('style');
  style.id = 'hive-theme-style';
  style.textContent = `
.bee { pointer-events: auto; cursor: pointer; transition: opacity .8s ease-in; }
.bee.gone { opacity: 0; }
.bee .hit { fill: transparent; pointer-events: all; }

/* ---- colour: thorax/abdomen take --c (per-session hue), dark stripes on
   top -- same "amplitude, not detail count" doctrine as the house's shirts
   and the car's paint, so a bee stays a recognisable striped insect while
   still reading as ITS OWN session at a glance. ------------------------- */
.bee .thorax { fill: var(--c); stroke: rgba(255,255,255,.25); stroke-width: 1; }
.bee .abdomen, .bee .abd-drone, .bee .abd-queen { fill: var(--c); }
.bee .stripe, .bee .sting { fill: #1d1926; }
.bee .head { fill: #2a2530; }
.bee .eye { fill: #0d0b12; }
.bee .eye-glint { fill: #fff; opacity: .8; }
.bee .drone-eyes ellipse { fill: #2a3550; }
.bee .crown path { fill: #e8c351; }
.bee .abd-queen-tip { fill: #e8c351; }
.bee .leg { stroke: #1d1926; stroke-width: 1.4; fill: none; }
.bee .wing-far { fill: rgba(200,220,255,.35); }
.bee .wing-near { fill: rgba(215,230,255,.55); stroke: rgba(255,255,255,.35); stroke-width: .5; }

/* ---- body carries heft (figure) and tier (caste); .body itself is the
   host-owned face-flip/loop-rotation node (see buildActor's comment: the
   host overwrites .body's transform every frame, and -- for a loop-bound
   or in-transit bee -- overwrites .rotor's instead, so nothing this file
   keyframes can live on either of those two nodes). ---------------------- */
.bee .figure { transform: translateY(calc(var(--heft, 0) * 2.5px)); }
.bee.stale .figure { filter: brightness(.72) saturate(.55); }
.bee .caste { transform: scale(1); transform-origin: 0px 0px; }
.bee.tier-haiku .caste { transform: scale(.78); }
.bee.tier-opus .caste { transform: scale(1.12); }
.bee.tier-fable .caste { transform: scale(1.18); }
.bee .jig { transform-origin: 0px 0px; }
.bee.walking .jig { animation: bee-bob 1.2s cubic-bezier(.4,0,.6,1) infinite; }
@keyframes bee-bob { 0%,100% { transform: translateY(-2px) } 50% { transform: translateY(2px) } }

/* ---- caste overlays: one shared body, parts toggled per tier (car's
   .moto/.sedan/.suv/.limo mechanism, swapping PARTS instead of whole hulls
   since a bee's silhouette is one insect, not four vehicle classes). ----- */
.bee .drone-eyes, .bee .crown, .bee .abd-drone, .bee .abd-queen,
.bee .abd-queen-tip, .bee .sparkle { display: none; }
.bee.tier-opus .drone-eyes, .bee.tier-opus .abd-drone { display: block; }
.bee.tier-opus .sting { display: none; }
.bee.tier-fable .abd-queen, .bee.tier-fable .abd-queen-tip,
.bee.tier-fable .crown, .bee.tier-fable .sparkle { display: block; }
.bee.tier-fable .sparkle { opacity: 0; animation: bee-twinkle 1.8s ease-in-out infinite;
  transform-box: fill-box; transform-origin: 50% 50%; }
.bee.tier-fable .sparkle:nth-of-type(2) { animation-delay: .6s; }
.bee.tier-fable .sparkle:nth-of-type(3) { animation-delay: 1.2s; }
@keyframes bee-twinkle { 0%,100% { opacity: 0; transform: scale(.4) } 50% { opacity: 1; transform: scale(1) } }

/* ---- heft: abdomen distends (attribute writes, see applyHeft), body
   rides lower (.figure above), pollen baskets band-snap on, colour dulls
   (--c itself, applyHeft). Wing-beat rate never changes with heft -- speed
   carries proofs, art carries weight. ------------------------------------ */
.bee .pollen-ball { fill: #e8a33c; opacity: 0; transform-box: fill-box; transform-origin: 50% 50%; }
.bee[data-heft="2"] .pollen-ball { opacity: 1; transform: scale(1); }
.bee[data-heft="3"] .pollen-ball { opacity: 1; transform: scale(1.4); }
.bee[data-heft="4"] .pollen-ball { opacity: 1; transform: scale(1.8); }

/* ---- wings: folded flat (static) when settled; buzzing whenever moving,
   fanning (blocked), flitting (bye) or dancing (delegate, settled). ------ */
.bee .wing-near, .bee .wing-far { transform: rotate(64deg); transform-origin: 4px -6px; }
.bee.walking .wing-near, .bee.blocked .wing-near,
.bee.working:not(.walking)[data-activity="delegate"] .wing-near {
  animation: bee-buzz .12s linear infinite alternate;
}
.bee.walking .wing-far, .bee.blocked .wing-far,
.bee.working:not(.walking)[data-activity="delegate"] .wing-far {
  animation: bee-buzz .12s linear infinite alternate; animation-delay: .06s;
}
@keyframes bee-buzz { 0%,100% { transform: rotate(-32deg) } 50% { transform: rotate(18deg) } }
/* bye: same buzz, larger amplitude -- a flutter/wave, not a plain hover. */
.bee.bye .wing-near, .bee.bye .wing-far { animation: bee-buzz-bye .12s linear infinite alternate; }
.bee.bye .wing-far { animation-delay: .06s; }
@keyframes bee-buzz-bye { 0%,100% { transform: rotate(-48deg) } 50% { transform: rotate(27deg) } }

/* ---- foraging (net): no propslot swap, the bee never stops moving --
   instead a small nectar-drop shows whenever airborne on the loop (J1: the
   host's sprite record exposes sp.onLoop directly, toggled as .flying in
   updateActor -- the cleanest signal, no fallback needed here). --------- */
.bee .nectar-drop { display: none; fill: #ffd76a; }
.bee.flying .nectar-drop { display: block; }

/* ---- abdomen: the tilt target for blocked, the breathing target for
   idle, the shimmy target for the waggle dance. -------------------------- */
.bee .abd { transform-origin: -8px 2px; }
.bee.blocked .abd { transform: rotate(-25deg); }
.bee.idle .abd { animation: bee-breathe 3s ease-in-out infinite; }
.bee.working:not(.walking)[data-activity="delegate"] .abd { animation: bee-shimmy .5s ease-in-out infinite; }
@keyframes bee-breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.03) } }
@keyframes bee-shimmy { 0%,100% { transform: rotate(-8deg) } 50% { transform: rotate(8deg) } }

/* ---- antennae: twitch when idle (awake, ready), faster twitch while
   inspecting a cell, static droop while stale, plain forward otherwise. -- */
.bee .antenna-a, .bee .antenna-b { fill: none; stroke: #1d1926; stroke-width: 1; transform-origin: 9px -4px; }
.bee.idle .antenna-a, .bee.idle .antenna-b { animation: bee-twitch 2.6s ease infinite; }
.bee.working:not(.walking)[data-activity="read"] .antenna-a,
.bee.working:not(.walking)[data-activity="read"] .antenna-b { animation: bee-twitch 1s ease infinite; }
.bee.stale .antenna-a, .bee.stale .antenna-b { animation: none; transform: rotate(28deg); }
@keyframes bee-twitch { 0%,85%,100% { transform: rotate(0deg) } 92% { transform: rotate(9deg) } }

/* ---- inspecting (read): the head dips into the cell it's checking. ---- */
.bee .headg { transform-origin: 4px 0px; }
.bee.working:not(.walking)[data-activity="read"] .headg {
  animation: bee-head-dip 2s ease-in-out infinite alternate;
}
@keyframes bee-head-dip { 0% { transform: rotate(0deg) } 100% { transform: rotate(12deg) } }

/* ---- settled comb props: capping (wax disc + flecks), nursing (jelly
   drops), inspecting (hex outline), building (dashoffset hex draw). ------ */
.bee .wax-disc { fill: #f0e6c8; opacity: .85; }
.bee .wax-fleck { fill: #fff6da; opacity: 0; animation: bee-fleck .6s ease-out infinite; }
@keyframes bee-fleck { 0% { transform: scale(.4); opacity: 0 } 30% { opacity: .9 } 100% { transform: scale(1.3); opacity: 0 } }
.bee .cell-mouth { fill: rgba(0,0,0,.25); }
.bee .jelly-drop { fill: #ffe9a8; opacity: 0; animation: bee-jelly 1.1s ease-in infinite; }
@keyframes bee-jelly { 0% { transform: translateY(0); opacity: 0 } 20% { opacity: .9 } 100% { transform: translateY(8px); opacity: 0 } }
.bee .hex-outline { fill: none; stroke: #e8dca0; stroke-width: 1.1; opacity: .85; }
.bee .hex-draw { fill: none; stroke: #f0d060; stroke-width: 1.2; stroke-dasharray: 36; stroke-dashoffset: 36;
  animation: bee-hexdraw 2.4s ease infinite; }
@keyframes bee-hexdraw { to { stroke-dashoffset: 0; } }

/* ---- blocked: the single most important state -- the ONLY thing on the
   board that blinks. Base visibility (opacity 0/1) is the HOST's job (it
   writes the opacity attribute on .alert every frame); this stylesheet
   only animates the halo/puffs WITHIN whatever visibility the host sets,
   and never puts an opacity rule on .alert itself (car's rule, copied).
   .halo has no rule here at all -- sims.css's .sim.blocked .halo owns its
   color and blink timing for every theme, so this reads identically to
   car/brigade/station's halo. The scent-puffs are hive's own flourish, so
   they keep their own color; their blink half references that SAME shared
   alert-blink keyframe (see buildActor's inline animation string) for
   perfect sync with .halo, layered under their own independent rise/fade. */
.bee .scent-puff { fill: rgba(255,190,60,.55); }
@keyframes bee-scent { 0% { transform: translateY(0) scale(.6); opacity: .7 } 100% { transform: translateY(-14px) scale(1.5); opacity: 0 } }
.bee .scentring { display: none; fill: none; stroke: #ffb43c; stroke-width: 2; }

/* ---- stale: dim, drooped, drifting zzz (idle owns the awake antenna
   twitch exclusively -- see above). --------------------------------------- */
.bee .zzz { display: none; }
.bee.stale .zzz { display: block; animation: bee-drift 3.4s ease-out infinite; }
@keyframes bee-drift {
  0%   { transform: translate(0,0) scale(.7); opacity: 0 }
  30%  { opacity: .8 }
  100% { transform: translate(9px,-16px) scale(1.15); opacity: 0 }
}

/* ---- name tag ------------------------------------------------------------ */
.bee .tag { font: 700 9px ui-monospace, Menlo, monospace; fill: #fff;
  stroke: rgba(0,0,0,.8); stroke-width: 3px; paint-order: stroke; stroke-linejoin: round; }
.bee .tag .room { fill: #cfc3da; font-weight: 600; }

.bee .sel { display: none; fill: none; }
.bee.selected .sel { display: block; stroke: #fff; stroke-width: 2; stroke-dasharray: 4 3; }

/* ---- bye: flutter + "Bzz!" bubble -------------------------------------- */
.bee .bubble { display: none; }
.bee.bye .bubble { display: block; animation: bee-pop .3s cubic-bezier(.2,1.6,.4,1) both; }
.bee .bub-body, .bee .bub-tail { fill: #f3ecf7; }
.bee .bub-text { font: 700 9px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; fill: #241f2b; }
@keyframes bee-pop { 0% { opacity: 0; transform: translateY(4px) scale(.7) } 100% { opacity: 1; transform: translateY(0) scale(1) } }

/* ---- reduced motion: two shapes, same doctrine as car's ---------------
   Continuous animations just need to stop moving -- collapsing duration to
   near-zero does that with no per-animation list to maintain. The stepped
   ones (halo, scent-puff blink) are a different shape: near-zero duration
   strobes instead of stopping, so they get a hard animation:none, with
   .scentring as the static high-contrast fallback (opacity:1, a plain
   stroked ring) -- blocked must never degrade to nothing. The abdomen tilt
   is a static transform, not an animation, so it survives untouched either
   way. */
@media (prefers-reduced-motion: reduce) {
  .bee *, .bee { animation-duration: .001ms !important; }
  .bee .scent-puff { animation: none !important; opacity: 1 !important; }
  .bee .scentring { display: block !important; opacity: 1 !important; }
}
`;
  document.head.appendChild(style);
}

// Shared SMIL motion path for the waggle dance (one <path>, referenced by
// every bee's <mpath> -- duplicating the id per-bee would be invalid HTML).
function ensureDefs() {
  if (document.getElementById('hive-waggle8')) return;
  const defs = el('defs', {});
  defs.appendChild(el('path', { id: 'hive-waggle8',
    d: 'M0,0 C 5,-4 9,4 0,0 C -9,-4 -5,4 0,0' }));
  svg.appendChild(defs);
}

// ---- activity props (mounted forward of the head via .propslot) ----------
function mkProp(activity, mk) { const g = el('g', { class: 'prop', 'data-activity': activity }); mk(g); return g; }

function hexPath(cx, cy, s) {
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    const x = cx + s * Math.cos(a), y = cy + s * Math.sin(a);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2) + ' ';
  }
  return d + 'Z';
}

const PROPS = {
  exec: () => mkProp('exec', g => {
    g.appendChild(el('ellipse', { class: 'wax-disc', cx: 6, cy: -2, rx: 7, ry: 5 }));
    for (let i = 0; i < 3; i++) {
      const f = el('circle', { class: 'wax-fleck', cx: 2 + i * 4, cy: -6, r: 1.3 });
      f.style.animationDelay = (i * 0.15) + 's';
      g.appendChild(f);
    }
  }),
  edit: () => mkProp('edit', g => {
    g.appendChild(el('ellipse', { class: 'cell-mouth', cx: 6, cy: -2, rx: 6, ry: 4 }));
    for (let i = 0; i < 3; i++) {
      const d = el('circle', { class: 'jelly-drop', cx: 4 + i * 3, cy: -5, r: 1.1 });
      d.style.animationDelay = (i * 0.3) + 's';
      g.appendChild(d);
    }
  }),
  read: () => mkProp('read', g => {
    g.appendChild(el('path', { class: 'hex-outline', d: hexPath(7, -2, 6) }));
  }),
  plan: () => mkProp('plan', g => {
    g.appendChild(el('path', { class: 'hex-draw', d: hexPath(7, -2, 6) }));
  }),
};

// ---- the character ---------------------------------------------------------
// Nesting (load-bearing, see the header): the host overwrites .body's
// transform every frame (mirror when settled/walking-without-rotor-heading,
// OR cleared to identity whenever a rotor-bearing sprite is onLoop/walking --
// see index.html's updateSim) and -- when a `.rotor` node exists -- writes
// ITS transform to a real per-frame heading instead (car's mechanism,
// reused here: without a `.rotor`, a loop-bound bee would lose its mirror
// entirely the instant it joined the loop, since updateSim unconditionally
// clears `.body`'s transform whenever sp.onLoop is true, rotor or not --
// J2's resolution, see the design notes at the end of this file). heft
// (.figure) and tier (.caste) therefore live BETWEEN .body and .rotor, so
// they compose with whichever heading the host picks rather than fighting
// it; the bob/waggle jig sits inside .rotor so it turns with the bee's nose.
function buildActor(s) {
  ensureDefs();
  const g = el('g', { class: 'bee sim', 'data-id': s.id });
  g.style.setProperty('--c', `hsl(${hue(s)} 62% 55%)`);

  g.appendChild(el('ellipse', { class: 'shadow', cx: -4, cy: 16, rx: 12, ry: 5,
    fill: 'rgba(0,0,0,.3)', style: 'display:none' }));

  const alert = el('g', { class: 'alert', opacity: 0 });
  alert.appendChild(el('ellipse', { class: 'halo', cx: -4, cy: 0, rx: 40, ry: 26 }));
  const plume = el('g', { class: 'plume' });
  for (let i = 0; i < 3; i++) {
    const puff = el('circle', { class: 'scent-puff', cx: -4 + i * 3, cy: -20, r: 3 });
    // Two animations on one element, positionally paired delays: the blink
    // (alert-blink, the same shared keyframe sims.css's .halo rule uses,
    // referenced by name here so the puffs blink in the same rhythm as the
    // halo without needing their own copy) stays phase-locked across the
    // whole bee (see updateActor's hazard sync, which only touches .halo --
    // puffs keep their own stagger deliberately, so the blink and the rise
    // never fight each other), the rise (bee-scent) staggers per puff. Set
    // inline (not via the class rule above) so this per-puff stagger doesn't
    // need three separate classes.
    puff.style.animation = 'alert-blink .8s steps(1,end) infinite, bee-scent 1.4s ease-out infinite';
    puff.style.animationDelay = `0s, ${(i * 0.27).toFixed(2)}s`;
    plume.appendChild(puff);
  }
  alert.appendChild(plume);
  alert.appendChild(el('ellipse', { class: 'scentring', cx: -4, cy: 0, rx: 40, ry: 26 }));
  g.appendChild(alert);

  const body = el('g', { class: 'body' });
  const figure = el('g', { class: 'figure' });
  const caste = el('g', { class: 'caste' });
  const rotor = el('g', { class: 'rotor' });
  const jig = el('g', { class: 'jig' });

  // Waggle dance: SMIL animateMotion, started/stopped from updateActor via
  // beginElement()/endElement() (begin="indefinite" -- see updateActor's
  // `dancing` toggle). Only active while settled+delegate, so it never
  // fights the CSS bob (.walking .jig), which is never true at the same
  // time (dancing is a SETTLED state, sp.moving is false).
  const waggle = el('animateMotion', { class: 'waggle-motion', dur: '1.6s',
    repeatCount: 'indefinite', begin: 'indefinite', rotate: 'false' });
  const mpath = el('mpath');
  mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#hive-waggle8');
  mpath.setAttribute('href', '#hive-waggle8');
  waggle.appendChild(mpath);
  jig.appendChild(waggle);

  const legs = el('g', { class: 'legs' });
  legs.appendChild(el('line', { class: 'leg', x1: 8, y1: 4, x2: 6, y2: 13 }));
  legs.appendChild(el('line', { class: 'leg', x1: 1, y1: 5, x2: -2, y2: 14 }));
  legs.appendChild(el('line', { class: 'leg', x1: -7, y1: 6, x2: -10, y2: 15 }));
  const pollen = el('g', { class: 'pollen' });
  pollen.appendChild(el('circle', { class: 'pollen-ball', cx: -11, cy: 15, r: 2 }));
  pollen.appendChild(el('circle', { class: 'pollen-ball', cx: -9, cy: 16.5, r: 1.7 }));
  legs.appendChild(pollen);
  jig.appendChild(legs);

  const abd = el('g', { class: 'abd' });
  abd.appendChild(el('ellipse', { class: 'abdomen', cx: -8, cy: 2, rx: 11, ry: 7 }));
  abd.appendChild(el('rect', { class: 'stripe', x: -15.6, y: -3.87, width: 3.2, height: 11.74, rx: 1.6 }));
  abd.appendChild(el('rect', { class: 'stripe', x: -9.6, y: -5, width: 3.2, height: 14, rx: 1.6 }));
  abd.appendChild(el('rect', { class: 'stripe', x: -3.6, y: -3.87, width: 3.2, height: 11.74, rx: 1.6 }));
  abd.appendChild(el('ellipse', { class: 'abd-drone', cx: -6, cy: 2, rx: 9.5, ry: 8 }));
  abd.appendChild(el('path', { class: 'abd-queen', d: 'M4,2 C0,-6 -14,-7 -24,2 C-14,7 0,6 4,2 Z' }));
  abd.appendChild(el('circle', { class: 'abd-queen-tip', cx: -24, cy: 2, r: 2 }));
  abd.appendChild(el('path', { class: 'sting', d: 'M-19,0 L-23,2 L-19,4 Z' }));
  jig.appendChild(abd);

  jig.appendChild(el('circle', { class: 'thorax', cx: 4, cy: 0, r: 6 }));

  const headg = el('g', { class: 'headg' });
  headg.appendChild(el('circle', { class: 'head', cx: 12, cy: -1, r: 4.5 }));
  headg.appendChild(el('circle', { class: 'eye', cx: 13, cy: -2, r: 2 }));
  headg.appendChild(el('circle', { class: 'eye-glint', cx: 13.8, cy: -2.8, r: .6 }));
  const droneEyes = el('g', { class: 'drone-eyes' });
  droneEyes.appendChild(el('ellipse', { cx: 12, cy: -3, rx: 7, ry: 6 }));
  headg.appendChild(droneEyes);
  headg.appendChild(el('path', { class: 'antenna-a', d: 'M9,-4 Q14,-11 21,-11' }));
  headg.appendChild(el('path', { class: 'antenna-b', d: 'M9,-3 Q13,-8 18,-8' }));
  const crown = el('g', { class: 'crown' });
  crown.appendChild(el('path', { d: 'M6,-8 L9,-15 L12,-9 L15,-15 L18,-8 Z' }));
  headg.appendChild(crown);
  headg.appendChild(el('circle', { class: 'nectar-drop', cx: 9, cy: 4, r: 2.2 }));
  jig.appendChild(headg);

  const wings = el('g', { class: 'wings' });
  wings.appendChild(el('path', { class: 'wing-far', d: 'M4,-6 Q-8,-18 -15,-9 Q-6,-5 4,-6 Z' }));
  wings.appendChild(el('path', { class: 'wing-near', d: 'M4,-6 Q-4,-16 -12,-7 Q-4,-3 4,-6 Z' }));
  jig.appendChild(wings);

  const sparkles = el('g', { class: 'sparkles' });
  for (const [sx, sy] of [[-2, -14], [14, 6], [-16, 4]])
    sparkles.appendChild(el('path', { class: 'sparkle',
      d: `M${sx} ${sy - 2.6} L${sx + .9} ${sy} L${sx} ${sy + 2.6} L${sx - .9} ${sy} Z` }));
  jig.appendChild(sparkles);

  const prop = el('g', { class: 'propslot', transform: 'translate(20,-4)' });
  jig.appendChild(prop);

  rotor.appendChild(jig);
  caste.appendChild(rotor);
  figure.appendChild(caste);
  body.appendChild(figure);
  g.appendChild(body);

  const z = el('text', { class: 'zzz', x: 16, y: -18, fill: 'rgba(255,255,255,.5)',
    'font-size': 11, 'font-weight': 700 });
  z.textContent = 'z';
  g.appendChild(z);

  const bub = el('g', { class: 'bubble' });
  bub.appendChild(el('path', { class: 'bub-tail', d: 'M6 -30 L13 -25 L14 -33 Z' }));
  bub.appendChild(el('rect', { class: 'bub-body', x: 5, y: -48, width: 34, height: 17, rx: 6 }));
  const bt = el('text', { class: 'bub-text', x: 22, y: -39.2, 'text-anchor': 'middle' });
  bt.textContent = (typeof THEME !== 'undefined' && THEME.farewell && THEME.farewell.text) || 'Bzz!';
  bub.appendChild(bt);
  g.appendChild(bub);

  g.appendChild(el('circle', { class: 'sel', cx: -2, cy: 0, r: 24 }));
  g.appendChild(el('rect', { class: 'hit', x: -28, y: -22, width: 56, height: 44 }));

  const tag = el('text', { class: 'tag', x: 0, y: 26, 'text-anchor': 'middle' });
  const nm = el('tspan'); nm.textContent = s.name || '?';
  const rm = el('tspan', { class: 'room' });
  tag.appendChild(nm); tag.appendChild(rm);
  g.appendChild(tag);

  g.addEventListener('click', ev => { ev.stopPropagation(); window.selectSim(s.id); });
  return g;
}

// Five heft bands, house's applyHeft formula verbatim (skip --hair -- a bee
// has no hair channel; stripes are always plain dark #1d1926).
function applyHeft(g, sp, s) {
  const h = Math.min(1, Math.max(0, s.heft || 0));
  if (sp.heft !== undefined && Math.abs(h - sp.heft) < 0.005) return;
  sp.heft = h;
  const H = hue(s);
  g.style.setProperty('--heft', h.toFixed(3));
  g.style.setProperty('--c', `hsl(${H} ${(62 * (1 - 0.55 * h)).toFixed(1)}% ${(55 * (1 - 0.30 * h)).toFixed(1)}%)`);
  g.dataset.heft = Math.min(4, Math.floor(h * 5));

  const set = (sel, attrs) => {
    const n = g.querySelector(sel);
    if (!n) return;
    for (const k in attrs) n.setAttribute(k, attrs[k]);
  };
  set('.abdomen', { rx: 11 + 6 * h, ry: 7 + 4 * h });
  set('.shadow', { rx: 12 + 6 * h });
}

function updateActor(g, sp, s) {
  applyHeft(g, sp, s);

  const cls = g.classList;
  const t = s.tier || 'plain';
  if (sp.tier !== t) {
    sp.tier = t;
    for (const x of ['plain', 'haiku', 'sonnet', 'opus', 'fable']) cls.toggle('tier-' + x, x === t);
  }

  // J1: the host's sprite record exposes the loop placement directly --
  // sp.onLoop (set by index.html's layout()/loopTrack(), see theme-engine's
  // `loop:{id,i,n}` placement field) -- so a `.flying` class is a straight
  // read, no !sp.moving fallback needed. Foraging (net) never settles, so
  // this is also the only "activity" signal that class needs: the
  // nectar-drop and loop-specific styling key off it directly (see the CSS
  // above), not off a swapped propslot prop.
  cls.toggle('flying', !!sp.onLoop);

  // Activity follows THEME's neutral vocabulary (ThemeEngine.activityOf),
  // not s.chore -- car's rule, reused verbatim. Recorded as a data attribute
  // (not just used transiently) so CSS can key comb-station props off it
  // directly, same mechanism car uses for its per-tier prop mounts.
  const activity = (s.state === 'working') ? ThemeEngine.activityOf(s) : null;
  if (sp.activity !== activity) {
    sp.activity = activity;
    g.dataset.activity = activity || '';
  }

  // Prop follows the chore; rebuilt only when it actually changes, and only
  // while settled (house's rule) -- a bee mid-flight to its station doesn't
  // yet have the prop, exactly like a mid-walk house sim.
  const settled = s.state === 'working' && !sp.moving;
  const want = (settled && PROPS[activity]) ? activity : null;
  if (sp.prop !== want) {
    sp.prop = want;
    const slot = g.querySelector('.propslot');
    slot.textContent = '';
    if (want) slot.appendChild(PROPS[want]());
  }

  // Waggle dance: start/stop the SMIL motion exactly on the settled+delegate
  // transition (see buildActor's comment) -- never every frame, so it can't
  // restart its own cycle every broadcast.
  const dancing = settled && activity === 'delegate';
  if (!!sp.dancing !== dancing) {
    sp.dancing = dancing;
    const motion = g.querySelector('.waggle-motion');
    if (motion) {
      try { dancing ? motion.beginElement() : motion.endElement(); } catch (e) { /* SMIL unsupported; dance just won't animate */ }
    }
  }

  // Hazard phase sync (car's call, reused): several bees going `blocked` at
  // different moments would otherwise blink out of phase, reading as chaos
  // instead of a pattern. Only the halo is synced -- the scent-puffs keep
  // their own per-puff stagger (buildActor), which is a different, and
  // deliberately unsynced, rhythm (a plume rising, not a single flasher).
  if (s.state === 'blocked' && !sp.hazSynced) {
    sp.hazSynced = true;
    const halo = g.querySelector('.halo');
    if (halo) halo.style.animationDelay = -(performance.now() % 800) + 'ms';
  } else if (s.state !== 'blocked') {
    sp.hazSynced = false;
  }
}

// ---- hive (canvas) ---------------------------------------------------------
// rr() draws in raw canvas pixels and ignores proj()/cam.zoom entirely (see
// the ground-rule note at the top of this project's session notes and
// house's identical rrw() comment) -- every rounded shape below goes
// through this wrapper, never rr() directly.
function rrw(c, x, y, w, h, r, fill) {
  const [sx, sy] = proj(x, y);
  rr(c, sx, sy, w * cam.zoom, h * cam.zoom, r * cam.zoom, fill);
}

const WOOD = '#6b4f34', WOOD_DK = '#5a4229', INTERIOR = '#241c14', FLOOR = '#2e2517';
const SPINE = ['#8a5cc4', '#d8d2e6', '#6fb3c9', '#d5484a', '#46d17f', '#ffc94a'];
const FLOWERS = [
  [230, 742, 0], [400, 748, 1], [570, 740, 2], [740, 746, 3], [350, 676, 4], [650, 676, 5],
];

// A hexagon's 6 vertices, WORLD space, pointy-top orientation.
function hexVerts(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i - 30);
    pts.push([cx + s * Math.cos(a), cy + s * Math.sin(a)]);
  }
  return pts;
}

// Hex field: every vertex is projected INDIVIDUALLY (not offset from an
// already-projected center) -- straight-edged shapes built this way are
// zoom-safe by construction (the note-2 fix class: raw offsets/radii applied
// AFTER proj() need manual cam.zoom scaling; a poly() of individually-
// projected vertices never has that problem in the first place).
function drawHexField(c, l, t, r, b, s, colors, extra) {
  const dx = Math.sqrt(3) * s, dy = 1.5 * s;
  let row = 0;
  for (let y = t + s; y < b; y += dy, row++) {
    const offset = (row % 2) ? dx / 2 : 0;
    let col = 0;
    for (let x = l + s + offset; x < r; x += dx, col++) {
      const verts = hexVerts(x, y, s).map(([vx, vy]) => proj(vx, vy));
      poly(c, verts, colors[(row + col) % 2]);
      if (extra) extra(c, x, y, row, col);
    }
  }
}

function broodExtra(c, x, y, row, col) {
  if ((row + col) % 5 !== 0) return;
  const [px, py] = proj(x, y); const z = cam.zoom;
  c.beginPath(); c.ellipse(px, py + 1 * z, 3 * z, 2 * z, 0, 0, 7);
  c.fillStyle = '#f2ecd8'; c.fill();
}
function storesExtra(c, x, y, row, col) {
  if ((row + col) % 4 !== 0) return;
  const [px, py] = proj(x, y); const z = cam.zoom;
  c.beginPath(); c.ellipse(px - 2 * z, py - 2 * z, 3 * z, 2 * z, 0, 0, 7);
  c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
}

function drawDormHexes(c) {
  // x=862 matches theme.json's dorm slot x exactly (it used to be 875, ~13
  // world-px off from where the bees actually sit -- harmless when the dorm
  // cells were jammed flush against the comb+wall anyway, but worth fixing
  // now that this area has real breathing room to get right).
  for (const y of [120, 180, 240]) {
    const verts = hexVerts(862, y, 16).map(([vx, vy]) => proj(vx, vy));
    poly(c, verts, 'rgba(20,15,10,.55)');
    c.save();
    c.strokeStyle = 'rgba(232,184,75,.5)';
    c.lineWidth = 1.4 * cam.zoom;
    c.beginPath();
    verts.forEach((p, i) => { i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]); });
    c.closePath(); c.stroke();
    c.restore();
  }
}

function drawPerches(c) {
  for (const y of [370, 430, 490]) {
    rrw(c, 850 - 45, y + 16, 90, 8, 4, WOOD_DK);
    rrw(c, 150 - 45, y + 16, 90, 8, 4, WOOD_DK);
  }
}

// Figure-8 dance-floor marks, world-space lemniscate sampled into a
// polyline -- projected point-by-point (proj() per sample) so the stroke
// stays correct at any zoom without a manual scale beyond lineWidth itself
// (note 2's dash/lineWidth class of bug -- lineWidth is a raw canvas
// setting, so it's the one thing here that still needs `* cam.zoom`).
function danceMarks() {
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const s = 46;
    pts.push({ x: 280 + s * Math.sin(t), y: 400 + s * 0.55 * Math.sin(t) * Math.cos(t) });
  }
  return pts;
}
function drawDanceFloor(c, bright) {
  fxArc(c, 280, 400, 0, 95, 55, 'rgba(60,42,20,.55)', 'fill');
  c.save();
  c.strokeStyle = bright ? 'rgba(240,216,120,.55)' : 'rgba(240,216,120,.18)';
  c.lineWidth = 2 * cam.zoom;
  c.beginPath();
  danceMarks().forEach((p, i) => {
    const [sx, sy] = proj(p.x, p.y);
    i ? c.lineTo(sx, sy) : c.moveTo(sx, sy);
  });
  c.stroke();
  c.restore();
}

function drawFlower(c, fx, fy, petalColor, swayDeg) {
  isoFlat(c, fx - 0.8, fy - 10, 1.6, 10, '#3a5a34');
  const [px, py] = proj(fx, fy - 10);
  const z = cam.zoom;
  const rad = Math.PI / 180 * (swayDeg || 0);
  for (let i = 0; i < 5; i++) {
    const a = i * (Math.PI * 2 / 5) + rad;
    c.beginPath();
    c.ellipse(px + Math.cos(a) * 5 * z, py + Math.sin(a) * 5 * z, 4 * z, 2.6 * z, a, 0, 7);
    c.fillStyle = petalColor; c.fill();
  }
  c.beginPath(); c.ellipse(px, py, 3 * z, 3 * z, 0, 0, 7);
  c.fillStyle = '#e8b84b'; c.fill();
}

function drawOutside(c) {
  c.fillStyle = '#141119'; c.fillRect(0, 0, W, H);
  isoFlat(c, -200, 600, 1600, 400, '#243a28');
  for (const [fx, fy, i] of FLOWERS) drawFlower(c, fx, fy, SPINE[i % SPINE.length], 0);
}

function drawHive(c) {
  isoFlat(c, 116, 66, 768, 446, INTERIOR);
  drawHexField(c, 130, 80, 470, 300, 12, ['#8a5f2a', '#a5721f'], broodExtra);
  // Stores comb stops well short of the east wall now (810, not the old 870)
  // -- the dorm cells used to sit in a ~14px sliver between the comb's edge
  // and the wall with nothing marking a boundary, reading as "part of the
  // same comb, just darker" instead of a separate resting spot. The freed
  // gap holds a real wooden frame divider (drawFrameDivider) plus honest
  // breathing room around the dorm cells themselves.
  drawHexField(c, 530, 80, 810, 300, 12, ['#c9932f', '#e8b84b'], storesExtra);
  isoFlat(c, 116, 300, 768, 212, FLOOR);
  drawDanceFloor(c, false);
  drawFrameDivider(c);
  drawDormHexes(c);
  drawPerches(c);
  // walls, drawn last so they frame the interior cleanly.
  rrw(c, 100, 50, 800, 16, 4, WOOD);
  rrw(c, 100, 50, 16, 478, 4, WOOD);
  rrw(c, 884, 50, 16, 478, 4, WOOD);
  rrw(c, 100, 512, 370, 16, 4, WOOD);
  rrw(c, 530, 512, 370, 16, 4, WOOD);
}

// A real Langstroth-frame-style wooden divider between the working comb and
// the dorm cells -- same WOOD tone and rrw() idiom as the hive's own outer
// walls, just an interior post instead of a perimeter one, so it reads as
// "built into the hive" rather than a debug rectangle. Two horizontal rails
// (top/bottom) plus the vertical post give it an actual frame silhouette
// instead of a single undifferentiated bar.
function drawFrameDivider(c) {
  rrw(c, 828, 66, 12, 240, 3, WOOD);
  rrw(c, 818, 66, 32, 10, 3, WOOD_DK);
  rrw(c, 818, 296, 32, 10, 3, WOOD_DK);
}

function drawLandingBoard(c) {
  rrw(c, 330, 545, 340, 40, 8, '#8a6a48');
  rrw(c, 330, 545, 340, 6, 3, 'rgba(255,255,255,.08)');
  fxArc(c, 500, 520, 0, 40, 14, 'rgba(255,210,120,.10)', 'fill');
}

function drawBackground(ctx) {
  drawOutside(ctx);
  drawHive(ctx);
  drawLandingBoard(ctx);
}

// ---- fx (per-frame, on top of the cached background) -----------------------

// Settled-only occupancy per comb activity (house's occupancy() pattern).
function occupancy() {
  const occ = { exec: 0, edit: 0, read: 0, plan: 0, delegate: 0 };
  for (const s of sessions) {
    if (s.state !== 'working') continue;
    const a = ThemeEngine.activityOf(s);
    if (!(a in occ)) continue;
    const sp = sprites.get(s.id);
    if (sp && !sp.moving) occ[a]++;
  }
  return occ;
}
// Forage is never settled (it's always mid-flight on the loop), so it gets
// its own count with no !sp.moving filter.
function forageOccupancy() {
  let n = 0;
  for (const s of sessions) if (s.state === 'working' && ThemeEngine.activityOf(s) === 'net') n++;
  return n;
}

function drawDormFX(c, t) {
  const dormPlace = THEME.places.find(p => p.id === 'dorm');
  if (!dormPlace) return;
  const ry = 10 + 3 * (0.5 - 0.5 * Math.cos(t / 3.4 * Math.PI * 2));
  for (const [id, key] of heldSeat) {
    if (!key.startsWith('dorm:')) continue;
    const sp = sprites.get(id);
    if (!sp || sp.moving || sp.pose !== 'sleep') continue;
    const idx = Number(key.split(':')[1]);
    const slot = dormPlace.slots[idx];
    if (slot) fxArc(c, slot.x - 13, slot.y, 0, 20, ry, 'rgba(232,184,75,.28)', 'fill');
  }
}

function drawFX(c, t) {
  const occ = occupancy();
  const forageN = forageOccupancy();

  if (occ.exec > 0) {
    // A gentle breathing glow over the capping comb, not a moving light --
    // this used to sweep 140 world-px back and forth (a tall 18x90 patch
    // of light visibly roaming the honeycomb), which read as an unexplained
    // wandering light rather than a subtle glossy sheen. Every other
    // occupied-station glow in this theme (nursing's pulse, below) is a
    // stationary breathe; this one now matches.
    const pulse = 0.08 + 0.05 * Math.sin(t / 4 * Math.PI * 2);
    fxArc(c, 610, 140, 0, 55, 70, `rgba(255,244,200,${pulse.toFixed(3)})`, 'fill');
  }
  if (occ.edit > 0) {
    const pulse = 0.15 + 0.1 * Math.sin(t / 3 * Math.PI * 2);
    fxArc(c, 210, 140, 0, 130, 90, `rgba(255,190,90,${pulse.toFixed(3)})`, 'fill');
  }
  drawDanceFloor(c, occ.delegate > 0);
  if (forageN > 0) {
    const sway = 2 * Math.sin(t * 1.3);
    for (const [fx, fy, i] of FLOWERS) drawFlower(c, fx, fy, SPINE[i % SPINE.length], sway);
    for (let i = 0; i < 3; i++) {
      const cyc = (t * 20 + i * 130) % 220;
      const mx = 200 + i * 260 + Math.sin(t + i) * 10;
      const my = 748 - cyc;
      if (my < 604) continue;
      fxArc(c, mx, my, 0, 2, 2, 'rgba(255,236,150,.5)', 'fill');
    }
  }
  drawDormFX(c, t);
}

(window.THEME_RENDERERS = window.THEME_RENDERERS || {}).hive = {
  buildActor, updateActor, drawBackground, drawFX,
};

// ---- trust note -------------------------------------------------------------
// Same status as themes/house/render.js and themes/car/render.js: first-
// party plain JS, not a sanitized declarative pack. See house's closing
// comment (THEMES.md §4) for the full reasoning; it applies here unchanged.
//
// ---- design notes for J1/J2 (asked for explicitly, kept with the code) -----
// J1 (loop flight styling): resolved via the PREFERRED path -- sp.onLoop is
// a real field on the sprite record index.html already maintains (see
// index.html's layout()/loopTrack()), so updateActor reads it directly and
// toggles `.flying`. No fallback needed.
// J2 (loop tangent rotation): the spec's stated default was face-flip only,
// worried that full rotation would nose the bee up/down on the loop's short
// ends. In practice, index.html's updateSim() unconditionally clears
// `.body`'s transform (dropping the mirror entirely, not falling back to
// it) whenever sp.onLoop is true -- that branch isn't gated on `.rotor`
// existing, only on whether the THEME wants one. Skipping `.rotor` therefore
// doesn't buy "mirror only": it buys "no facing information at all" while
// flying, a strictly worse bug than banking. This file adds a `.rotor` (car's
// exact mechanism) so the host's generic per-frame heading/lean math applies;
// labels (zzz/alert/tag/sel/bubble) are root-level siblings of `.body`, never
// inside `.rotor`, so they stay upright regardless (verified live at
// cam.zoom=2 and default zoom, see the task's final report).
})();
