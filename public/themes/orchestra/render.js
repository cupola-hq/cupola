'use strict';
// themes/orchestra/render.js -- the concert hall's ART, on top of
// theme.json's geometry (grid sections, backstage slots, the warmup field).
// See themes/house/render.js's header for the full render contract; short
// version:
//
//   buildActor(session) -> <g class="musician">   .body/.alert/.tag/.sel/.bubble/.bub-text
//   updateActor(g, sp, s)                          per-frame heft/tier/activity reads
//   drawBackground(ctx)                             cached hall furniture
//   drawFX(ctx, t)                                  conductor + footlights, per frame
//
// ---- why the root is "musician sim", not just "musician" -------------------
// index.html's camera-drag handler only lets a click through to a sim's own
// listener when `e.target.closest('.sim')` matches (see the pointerdown
// handler): without `sim` on the root, pressing a musician arms a camera pan
// and steals the click instead of selecting it -- the exact trap car's own
// header comment documents. `sim` is included here for that reason alone.
//
// ---- why almost nothing else reuses sims.css's names ------------------------
// sims.css is loaded unconditionally (a plain <link> in index.html) and every
// one of its selectors keys off bare `.sim`, so it silently ALSO matches any
// theme that (like this one, like car) needs the `sim` co-class. Reusing a
// name sims.css already animates is a real, not theoretical, collision --
// `.sim .figure{transform:scale(...)}` for heft, `.sim.working:not(.walking)
// .arm-r{animation:fuss}`, `.sim.blocked .arm-r{animation:wave}`, and (most
// dangerous) `.sim.blocked .alert{animation:pulse; ...opacity:.55->0}` would
// all apply to elements sharing those class names here, and the last one
// would fight the host's own opacity-attribute contract on `.alert` (the
// exact thing THEMES.md forbids a theme from doing itself). house/car survive
// this by (a) using names sims.css doesn't touch (car: chassis/rotor/hull/
// paint/...) or (b) redeclaring the handful of shared, harmless ones (tag,
// sel, bubble, bub-text, zzz). This file follows the same doctrine: `.body`/
// `.alert`/`.tag`/`.sel`/`.bubble`/`.bub-tail`/`.bub-body`/`.bub-text` are the
// mandatory, harmless-to-share contract names (redeclared below, same as
// car); a small handful of proven-inert-when-shared names (`.figure`,
// `.arm-l`/`.arm-r`, `.arm-mount-l`/`.arm-mount-r`, `.leg-l`/`.leg-r`,
// `.headg`, `.torso`, `.shadow`, `.head`, `.hair`, `.eye`) are reused ON
// PURPOSE for the free walking-swing/sitting-tuck sims.css already provides
// (verified: every rule this file actually cares about there is beaten by an
// equal-or-boosted-specificity rule declared later in THIS stylesheet, which
// always loads after sims.css's static <link>); and `.alert` gets one
// `animation: none !important` hard reset so sims.css's blocked-pulse can
// never reach it (ground rule: never let CSS touch `.alert`'s opacity).
// Everything else this theme needs (attire, instruments, stand, case, notes,
// chair, spotlight pool) uses fresh names with zero shadow in sims.css.

(function () {

if (!document.getElementById('orchestra-theme-style')) {
  const style = document.createElement('style');
  style.id = 'orchestra-theme-style';
  style.textContent = `
.musician { pointer-events: auto; cursor: pointer; transition: opacity .8s ease-in; }
.musician.gone { opacity: 0; }
.musician .hit { fill: transparent; pointer-events: all; }

/* ---- alert: originally a slow-breathing three-layer "spotlight" pool
   instead of a blink (the theme's own quiet-hall doctrine argued a blink
   would clash with the calm register) -- reverted after live use turned out
   the opposite of the intent: a uniquely different "needs you" signal in
   this one theme read as distracting and confusing rather than calm,
   defeating the actual point of a "needs you" signal, which is to be
   instantly recognizable. Uses the same shared .halo every other theme
   uses (sims.css's .sim.blocked .halo owns its color/timing) so "needs you"
   looks and blinks identically switching from any other theme into this
   one. Opacity 0/1 is still the HOST's job (setAttribute every frame) --
   CSS must never rule that property on .alert itself. .halo's own geometry
   (cx/cy/rx/ry) is set as plain SVG attributes in buildActor, same as every
   other theme -- not here, CSS geometry properties on SVG shapes are too
   inconsistent cross-browser to lean on. */

/* ---- heft: theme transforms live on .figure, never .body (the host
   overwrites .body's transform ATTRIBUTE -- scale(face,1) -- every frame; a
   CSS rule on that same node would permanently outrank the attribute, same
   trap as car's .chassis). This intentionally beats sims.css's own
   '.sim .figure{transform-origin:0 18px; transform:scale(...)}' -- equal
   (0,2,0) specificity, this stylesheet always loads after sims.css's static
   <link>, so cascade order alone settles the tie in this rule's favour. */
.musician .figure { transform-origin: 0px 0px; transform: translateY(calc(var(--heft, 0) * 2px)); }
.musician .headg  { transform-origin: 0px -9px; transform: rotate(calc(var(--heft, 0) * 8deg)); }
/* Lying flattens the whole figure (folds the heft term in via calc so a
   heavy, asleep musician still reads as heavy) -- a stronger "put to bed"
   read than leg-hide + blanket alone gave it. */
.musician.lying .figure { transform: translateY(calc(4px + var(--heft, 0) * 2px)) scale(.92, .74); }

/* ---- limbs: reused sims.css transform-origins on purpose (0px -8px / 0px 6px
   already match this file's own house-derived proportions), and reused
   walking-swing + sitting-tuck-rotate for free -- see file header. Only the
   working/blocked defaults get overridden, below. */
.musician .torso { fill: var(--c); }
.musician .arm   { fill: var(--c); filter: brightness(.88); }
.musician .leg   { fill: #2c2636; }
.musician .shoe  { fill: #1c1824; }
.musician .head  { fill: #f2c9a0; }
.musician .hair  { fill: var(--hair); }
.musician .eye   { fill: #241f2b; }
.musician .shadow { fill: rgba(0,0,0,.34); }
.musician.stale .eye { transform: scaleY(.12); transform-box: fill-box; transform-origin: center; }

/* Blocked now leaves the section entirely -- theme.json's grids only accept
   'working', so a blocked musician routes to the dedicated 'help' place at
   the front of the stage and stands there normally (no 'pose', so never
   '.sitting'); nothing to override here any more, the ordinary standing
   footprint is already correct. Lying still needs its own override below,
   since idle/stale keep the chair/seated pose that blocked no longer has. */
/* Lying overrides the tie with .sitting (both present together for pose
   'sleep', same doctrine sims.css itself documents) by coming after it. */
.musician.lying .leg-l, .musician.lying .leg-r, .musician.lying .chair { display: none; }
.musician .blanket { display: none; }
.musician.lying .blanket { fill: var(--c); opacity: .82; }
.musician.lying .blanket { display: block; }

/* Reset sims.css's generic "fuss" default for working -- this theme's
   working tell is per-instrument (bow/strike/pluck), not a generic limb
   wiggle. The [data-id] bump matches sims.css's :not(.walking)-boosted
   (0,4,0) fuss rule so this always wins regardless of source order.
   blocked is deliberately NOT reset here any more: a blocked musician now
   walks to the front of the stage and waves for help exactly like every
   other theme's actor, via sims.css's own shared .sim.blocked .arm-r{wave}
   rule -- previously overridden to animation:none because blocked used to
   stay seated in-chair with the instrument lowered instead. */
.musician[data-id].working .arm-r, .musician[data-id].working .arm-l { animation: none; }
.musician.bye .arm-r { animation: none; }

/* ---- chair: a musician's own small stool. Travels WITH them (drawn on the
   actor, not scenery) because grid cells move but furniture can't -- see
   theme.json's section comment. */
.musician .chair { display: none; fill: #4a3524; }
.musician.sitting .chair { display: block; }

/* ---- instruments: exactly one visible per data-act, regardless of state
   (a session's instrument is WHO they are, not just what they're doing right
   now -- idle/blocked keep holding theirs). */
.musician .instrument > g { display: none; }
.musician[data-act="edit"]     .instrument .violin   { display: block; }
.musician[data-act="read"]     .instrument .cello    { display: block; }
.musician[data-act="net"]      .instrument .trumpet  { display: block; }
.musician[data-act="plan"]     .instrument .oboe     { display: block; }
.musician[data-act="exec"]     .instrument .timpani  { display: block; }
.musician[data-act="delegate"] .instrument .harp     { display: block; }
.musician.stale .instrument { display: none; }   /* packed away in the case */
.musician.blocked .instrument { display: none; } /* set down before stepping out to wave */

.musician .instr-body  { fill: #6b4a34; }
.musician .instr-metal { fill: #9a97a3; }
.musician.tier-opus .instr-metal { fill: #cdd2db; stroke: #fff; stroke-width: .5; }
.musician.tier-fable .instr-body, .musician.tier-fable .instr-metal,
.musician.tier-fable .instr-string { fill: #e8c351 !important; stroke: #b8860b; stroke-width: .35; }

/* Bow / mallets live INSIDE .arm-r (and .arm-l for the second timpani stick)
   so they move with the playing arm itself, not the static instrument body. */
.musician .bow-line, .musician .mallet, .musician .mallet-l { display: none; stroke: #3a2c1e; stroke-width: 1.6; stroke-linecap: round; }
.musician[data-act="edit"] .bow-line, .musician[data-act="read"] .bow-line { display: block; }
.musician[data-act="exec"] .mallet, .musician[data-act="exec"] .mallet-l { display: block; }
.musician.tier-fable .bow-line, .musician.tier-fable .mallet, .musician.tier-fable .mallet-l { stroke: #e8c351; }

@keyframes orch-bow    { 0%,100% { transform: rotate(-9deg) }  50% { transform: rotate(11deg) } }
@keyframes orch-strike { 0%      { transform: rotate(-30deg) } 12% { transform: rotate(18deg) } 100% { transform: rotate(-30deg) } }
@keyframes orch-pluck  { 0%,100% { transform: rotate(-4deg) }  50% { transform: rotate(6deg) } }
.musician.working[data-act="edit"]     .arm-r,
.musician.working[data-act="read"]     .arm-r { animation: orch-bow 1.6s ease-in-out infinite; }
.musician.working[data-act="exec"]     .arm-r { animation: orch-strike .8s cubic-bezier(.2,.9,.4,1) infinite; }
.musician.working[data-act="delegate"] .arm-r { animation: orch-pluck 1.4s ease-in-out infinite; }

@keyframes orch-skin { 0%,100% { transform: scaleY(1) } 12% { transform: scaleY(1.06) } }
.musician.working[data-act="exec"] .timpani-skin {
  animation: orch-skin .8s cubic-bezier(.2,.9,.4,1) infinite;
  transform-box: fill-box; transform-origin: 50% 50%;
}

@keyframes orch-trumpet { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(4deg) } }
.musician.working[data-act="net"] .trumpet {
  animation: orch-trumpet 2s ease-in-out infinite;
  transform-origin: 3px -15px;
}

@keyframes orch-key { 0%,100% { opacity: .95 } 50% { opacity: .35 } }
.musician.working[data-act="plan"] .oboe .key { animation: orch-key 1.6s ease-in-out infinite; }
.musician .oboe .key:nth-child(2) { animation-delay: 0s; }
.musician .oboe .key:nth-child(3) { animation-delay: .3s; }
.musician .oboe .key:nth-child(4) { animation-delay: .6s; }

@keyframes orch-gliss { 0% { transform: translateX(-9px); opacity: 0 } 10% { opacity: 1 } 30% { transform: translateX(9px); opacity: 0 } 100% { transform: translateX(9px); opacity: 0 } }
.musician.working[data-act="delegate"] .harp-gliss { animation: orch-gliss 4s linear infinite; }

/* ---- rising notes: the WORKING tell, all sections alike. GPU-friendly
   (transform+opacity only), peak opacity capped well under the spotlight's
   floor so nothing on stage ever out-contrasts a blocked musician's light. */
.musician .notes .note { opacity: 0; }
@keyframes orch-note { 0% { transform: translate(0,0) scale(.6); opacity: 0 } 18% { opacity: .32 } 100% { transform: translate(5px,-30px) scale(1.1); opacity: 0 } }
.musician.working .notes .note { animation: orch-note 2.6s ease-out infinite; }
.musician .notes .note:nth-child(1) { animation-delay: 0s; }
.musician .notes .note:nth-child(2) { animation-delay: .9s; }
.musician .notes .note:nth-child(3) { animation-delay: 1.8s; }

/* ---- case: closed on the floor, idle (open lid) vs stale (closed lid) --
   the one hard silhouette delta between "resting, ready" and "asleep". */
.musician .case { display: none; }
.musician.idle .case, .musician.stale .case { display: block; }
.musician .case-lid { transform: rotate(0deg); transform-origin: -9px 0px; fill: #241f2b; }
.musician.idle .case-lid { transform: rotate(-55deg); }

/* ---- music stand: the heft carrier, and furniture at THIS musician's own
   section chair -- it has no business floating over a backstage bench or
   cot, so it only shows for working/blocked (the two states that keep a
   musician AT their stand), never idle/stale/walking/bye. */
.musician .stand { display: none; }
.musician.working .stand { display: block; }
/* Blocked musicians walk to the front of the stage empty-handed (see
   .instrument above) -- leaving their music stand behind with them is the
   same idea: they stepped away from their station, not just their
   instrument, so nothing from the station should still be in view. */
.musician .stand .page { display: none; fill: #f3ecf7; stroke: #cfc3da; stroke-width: .4; }
.musician .stand .clutter { display: none; }
.musician[data-heft="0"] .stand .pages .page:nth-child(1),
.musician[data-heft="1"] .stand .pages .page:nth-child(-n+2),
.musician[data-heft="2"] .stand .pages .page:nth-child(-n+3),
.musician[data-heft="3"] .stand .pages .page:nth-child(-n+4),
.musician[data-heft="4"] .stand .pages .page:nth-child(-n+4) { display: block; }
.musician[data-heft="3"] .stand .clutter, .musician[data-heft="4"] .stand .clutter { display: block; }

/* ---- tier: formalwear, display-toggled like car's vehicle classes -- every
   costume is built once, only visibility changes. */
.musician .attire > g { display: none; }
.musician.tier-plain  .attire-plain  { display: block; }
.musician.tier-haiku  .attire-haiku  { display: block; }
.musician.tier-sonnet .attire-sonnet { display: block; }
.musician.tier-opus   .attire-opus   { display: block; }
.musician.tier-fable  .attire-fable  { display: block; }
.musician .att-sparkle { fill: #ffe9a3; opacity: 0; animation: orch-twinkle 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
.musician .att-sparkle:nth-of-type(2) { animation-delay: .6s; }
.musician .att-sparkle:nth-of-type(3) { animation-delay: 1.2s; }
@keyframes orch-twinkle { 0%,100% { opacity: 0; transform: scale(.4) } 50% { opacity: 1; transform: scale(1) } }

/* ---- zzz / tag / sel / bubble: shared, harmless names with sims.css --
   redeclared here exactly like car does (own colour scheme, no functional
   fight since both agree on display:none/block toggling). */
.musician .zzz { display: none; fill: rgba(255,255,255,.55); }
.musician.stale .zzz { display: block; animation: orch-drift 2.8s ease-out infinite; }
@keyframes orch-drift { 0% { transform: translate(0,0) scale(.7); opacity: 0 } 30% { opacity: .8 } 100% { transform: translate(8px,-16px) scale(1.15); opacity: 0 } }

.musician .tag { font: 600 10px ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
  fill: #fff; stroke: rgba(0,0,0,.75); stroke-width: 3px; paint-order: stroke; stroke-linejoin: round; }
.musician .tag .room { fill: #e8c351; }

.musician .sel { display: none; }
.musician.selected .sel { display: block; stroke: #fff; stroke-width: 2; stroke-dasharray: 4 3; fill: none; }

.musician .bubble { display: none; }
.musician.bye .bubble { display: block; animation: orch-pop .3s cubic-bezier(.2,1.6,.4,1) both; }
.musician .bub-body, .musician .bub-tail { fill: #f3ecf7; }
.musician .bub-text { font: 700 9px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; fill: #241f2b; }
@keyframes orch-pop { 0% { opacity: 0; transform: translateY(4px) scale(.7) } 100% { opacity: 1; transform: translateY(0) scale(1) } }

/* ---- farewell: a bow, not a wave. Targets .figure (never .body), 28deg at
   the hips, twice, per THEMES.md's translation of the wave gesture. */
@keyframes orch-bow-out {
  0%,100% { transform: rotate(0deg) }
  30%,45% { transform: rotate(28deg) }
  55%     { transform: rotate(0deg) }
  75%,88% { transform: rotate(28deg) }
}
.musician.bye .figure { animation: orch-bow-out 2.4s ease-in-out 1; transform-origin: 0px 8px; }

/* ---- reduced motion: sims.css's own blanket '.sim *, .sim{animation:none
   !important}' already stops everything under this root (musician carries
   'sim'), and its own .sim.blocked .halo override already freezes the halo
   at full opacity -- nothing theme-specific left to add now that this
   theme shares the same halo as everyone else. */
`;
  document.head.appendChild(style);
}

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- instrument builders ---------------------------------------------------
// Local coordinate system matches house's figure exactly (head r8.6 at
// cy-17, torso 18x17 rect at y-8, waist/anchor at y0, feet ~y17-19) --
// "reskin, don't reinvent" (spec's own instruction).

function noteGlyph(x, y) {
  const g = el('g', { class: 'note', transform: `translate(${x},${y})` });
  g.appendChild(el('ellipse', { cx: 0, cy: 0, rx: 2, ry: 1.4, transform: 'rotate(-18)', fill: '#fff8dd' }));
  g.appendChild(el('rect', { x: 1.6, y: -7, width: .8, height: 7.2, fill: '#fff8dd' }));
  g.appendChild(el('path', { d: 'M2.4 -7 Q5.4 -6 4.6 -3', stroke: '#fff8dd', 'stroke-width': .8, fill: 'none' }));
  return g;
}

function buildInstrument() {
  const wrap = el('g', { class: 'instrument' });

  const violin = el('g', { class: 'violin' });
  violin.appendChild(el('ellipse', { class: 'instr-body', cx: -6, cy: -19, rx: 6, ry: 2.6, transform: 'rotate(-32 -6 -19)' }));
  violin.appendChild(el('rect', { class: 'instr-body', x: -9.6, y: -25.5, width: 1.6, height: 7, rx: .6, transform: 'rotate(-32 -6 -19)' }));
  wrap.appendChild(violin);

  const cello = el('g', { class: 'cello' });
  cello.appendChild(el('rect', { class: 'instr-body', x: -4, y: 6, width: 8, height: 22, rx: 3.4 }));
  cello.appendChild(el('rect', { class: 'instr-body', x: -1.1, y: -8, width: 2.2, height: 15, rx: .8 }));
  wrap.appendChild(cello);

  const trumpet = el('g', { class: 'trumpet' });
  trumpet.appendChild(el('path', { class: 'instr-metal', d: 'M2 -16 L15 -13.4', stroke: '#9a97a3', 'stroke-width': 2.2, 'stroke-linecap': 'round', fill: 'none' }));
  trumpet.appendChild(el('circle', { class: 'instr-metal', cx: 15.5, cy: -13.2, r: 3 }));
  wrap.appendChild(trumpet);

  const oboe = el('g', { class: 'oboe' });
  oboe.appendChild(el('rect', { class: 'instr-body', x: 1.4, y: -15, width: 2.2, height: 15, rx: .8 }));
  oboe.appendChild(el('circle', { class: 'instr-metal key', cx: 2.5, cy: -11, r: .8 }));
  oboe.appendChild(el('circle', { class: 'instr-metal key', cx: 2.5, cy: -7,  r: .8 }));
  oboe.appendChild(el('circle', { class: 'instr-metal key', cx: 2.5, cy: -3,  r: .8 }));
  wrap.appendChild(oboe);

  const timpani = el('g', { class: 'timpani' });
  timpani.appendChild(el('ellipse', { class: 'instr-metal', cx: 0, cy: 16, rx: 11, ry: 5.5 }));
  timpani.appendChild(el('ellipse', { class: 'timpani-skin instr-body', cx: 0, cy: 13, rx: 9, ry: 3, fill: '#cdb896' }));
  wrap.appendChild(timpani);

  const harp = el('g', { class: 'harp' });
  harp.appendChild(el('path', { class: 'instr-body', d: 'M-17 6 L-6 -25 L-4 -25 L-4 6 Z', opacity: .9 }));
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    harp.appendChild(el('line', {
      class: 'instr-string', x1: -17 + t * 13, y1: 6 - t * 31, x2: -4, y2: 6 - t * 26.8,
      stroke: '#e8e3ef', 'stroke-width': .5,
    }));
  }
  harp.appendChild(el('rect', { class: 'harp-gliss', x: -17, y: -22, width: 3, height: 24, fill: 'rgba(255,255,255,.55)', opacity: 0 }));
  const crown = el('g', { class: 'att-fable-crown' });
  crown.appendChild(el('path', { d: 'M-8 -27 L-5 -32 L-2 -28 L1 -32 L4 -27 Z', fill: '#e8c351' }));
  harp.appendChild(crown);
  wrap.appendChild(harp);

  return wrap;
}

// ---- attire builders (one per tier, all built once, display-toggled) ------

function attirePlain() {
  const g = el('g', { class: 'attire-plain' });
  g.appendChild(el('path', { class: 'att-jacket', d: 'M-9 -8 L-5.4 -8.4 L-1 -2.4 L-5.4 4.6 L-9 5 Z', fill: '#332f3d' }));
  g.appendChild(el('path', { class: 'att-jacket', d: 'M9 -8 L5.4 -8.4 L1 -2.4 L5.4 4.6 L9 5 Z', fill: '#332f3d' }));
  g.appendChild(el('path', { class: 'att-collar', d: 'M-3.4 -8.2 L0 -4.4 L3.4 -8.2', stroke: 'rgba(255,255,255,.5)', 'stroke-width': 1, fill: 'none' }));
  return g;
}

function attireHaiku() {
  const g = el('g', { class: 'attire-haiku' });
  g.appendChild(el('rect', { class: 'att-shirt', x: -9, y: -8, width: 18, height: 17, rx: 5, fill: '#f3ecf7' }));
  g.appendChild(el('path', { class: 'att-vest', d: 'M-6.4 -8 L0 -4 L6.4 -8 L6.4 4.6 L0 8 L-6.4 4.6 Z', fill: '#201c28' }));
  g.appendChild(el('rect', { class: 'att-cuff', x: -8.4, y: 4.4, width: 6.4, height: 2.6, rx: 1, fill: '#f3ecf7' }));
  g.appendChild(el('rect', { class: 'att-cuff', x: 2, y: 4.4, width: 6.4, height: 2.6, rx: 1, fill: '#f3ecf7' }));
  return g;
}

function attireSonnet() {
  const g = el('g', { class: 'attire-sonnet' });
  g.appendChild(el('path', { class: 'att-lapel', d: 'M-5.4 -8.4 L-1 -2.4 L-5.4 4.6 Z', fill: 'rgba(0,0,0,.5)' }));
  g.appendChild(el('path', { class: 'att-lapel', d: 'M5.4 -8.4 L1 -2.4 L5.4 4.6 Z', fill: 'rgba(0,0,0,.5)' }));
  g.appendChild(el('path', { class: 'att-bib', d: 'M-2.6 -8 L0 -6 L2.6 -8 L2 3.4 L0 5 L-2 3.4 Z', fill: '#f3ecf7' }));
  g.appendChild(el('path', { class: 'att-bowtie', d: 'M-3.4 -6.4 L-.9 -4.6 L-3.4 -2.8 Z M3.4 -6.4 L.9 -4.6 L3.4 -2.8 Z', fill: '#17141d' }));
  g.appendChild(el('circle', { class: 'att-bowtie-k', cx: 0, cy: -4.6, r: 1, fill: '#17141d' }));
  g.appendChild(el('path', { class: 'att-tails', d: 'M-6.5 4 L-8.2 12 L-3.4 9 Z M6.5 4 L8.2 12 L3.4 9 Z', fill: 'rgba(0,0,0,.55)' }));
  return g;
}

function attireOpus() {
  const g = el('g', { class: 'attire-opus' });
  g.appendChild(el('path', { class: 'att-lapel', d: 'M-5.4 -8.4 L-1 -2.4 L-5.4 4.6 Z', fill: 'rgba(0,0,0,.55)' }));
  g.appendChild(el('path', { class: 'att-lapel', d: 'M5.4 -8.4 L1 -2.4 L5.4 4.6 Z', fill: 'rgba(0,0,0,.55)' }));
  g.appendChild(el('path', { class: 'att-vest', d: 'M-3.2 -8 L0 -6.2 L3.2 -8 L2.6 5.4 L0 7 L-2.6 5.4 Z', fill: '#f3ecf7' }));
  g.appendChild(el('path', { class: 'att-bowtie', d: 'M-3.4 -6.4 L-.9 -4.6 L-3.4 -2.8 Z M3.4 -6.4 L.9 -4.6 L3.4 -2.8 Z', fill: '#f3ecf7' }));
  g.appendChild(el('circle', { class: 'att-bowtie-k', cx: 0, cy: -4.6, r: 1, fill: '#f3ecf7' }));
  g.appendChild(el('path', { class: 'att-tails', d: 'M-7 4 L-9.4 13.5 L-3.2 9.6 Z M7 4 L9.4 13.5 L3.2 9.6 Z', fill: 'rgba(0,0,0,.6)' }));
  g.appendChild(el('path', { class: 'att-trim', d: 'M-5.4 -7.4 L-1.2 -2 L-5.4 4', stroke: '#c8cdd6', 'stroke-width': .8, fill: 'none' }));
  g.appendChild(el('path', { class: 'att-trim', d: 'M5.4 -7.4 L1.2 -2 L5.4 4', stroke: '#c8cdd6', 'stroke-width': .8, fill: 'none' }));
  return g;
}

function attireFable() {
  const g = el('g', { class: 'attire-fable' });
  g.appendChild(el('path', { class: 'att-lapel', d: 'M-5.4 -8.4 L-1 -2.4 L-5.4 4.6 Z', fill: 'rgba(0,0,0,.55)' }));
  g.appendChild(el('path', { class: 'att-lapel', d: 'M5.4 -8.4 L1 -2.4 L5.4 4.6 Z', fill: 'rgba(0,0,0,.55)' }));
  g.appendChild(el('path', { class: 'att-bib', d: 'M-2.6 -8 L0 -6 L2.6 -8 L2 3.4 L0 5 L-2 3.4 Z', fill: '#f3ecf7' }));
  g.appendChild(el('path', { class: 'att-bowtie', d: 'M-3.4 -6.4 L-.9 -4.6 L-3.4 -2.8 Z M3.4 -6.4 L.9 -4.6 L3.4 -2.8 Z', fill: '#e8c351' }));
  g.appendChild(el('circle', { class: 'att-bowtie-k', cx: 0, cy: -4.6, r: 1, fill: '#e8c351' }));
  g.appendChild(el('path', { class: 'att-tails', d: 'M-7.4 4 L-10 14.5 L-3 9.8 Z M7.4 4 L10 14.5 L3 9.8 Z', fill: 'rgba(0,0,0,.62)' }));
  g.appendChild(el('path', { class: 'att-trim', d: 'M-5.4 -7.4 L-1.2 -2 L-5.4 4', stroke: '#e8c351', 'stroke-width': 1, fill: 'none' }));
  g.appendChild(el('path', { class: 'att-trim', d: 'M5.4 -7.4 L1.2 -2 L5.4 4', stroke: '#e8c351', 'stroke-width': 1, fill: 'none' }));
  g.appendChild(el('path', { class: 'att-wreath', d: 'M-7 -24.6 A7.2 7.2 0 0 1 7 -24.6', stroke: '#e8c351', 'stroke-width': 1.6, fill: 'none' }));
  for (const [sx, sy] of [[-11, -21], [10, -9], [-8, 3]]) {
    g.appendChild(el('path', { class: 'att-sparkle',
      d: `M${sx} ${sy - 2.6} L${sx + .9} ${sy} L${sx} ${sy + 2.6} L${sx - .9} ${sy} Z` }));
  }
  return g;
}

// ---- the musician -----------------------------------------------------------

function buildActor(s) {
  const g = el('g', { class: 'musician sim', 'data-id': s.id });
  g.style.setProperty('--c', `hsl(${hue(s)} 55% 52%)`);
  g.style.setProperty('--hair', `hsl(${hue(s)} 35% 24%)`);

  g.appendChild(el('rect', { class: 'hit', x: -40, y: -45, width: 80, height: 85 }));
  g.appendChild(el('ellipse', { class: 'shadow', cx: 0, cy: 17, rx: 13, ry: 4.6 }));

  const alert = el('g', { class: 'alert' });
  alert.appendChild(el('ellipse', { class: 'halo', cx: 0, cy: 6, rx: 40, ry: 30 }));
  g.appendChild(alert);

  const body = el('g', { class: 'body' });
  const figure = el('g', { class: 'figure' });

  const chair = el('g', { class: 'chair' });
  chair.appendChild(el('rect', { x: -10, y: 14, width: 20, height: 4, rx: 2 }));
  chair.appendChild(el('rect', { x: -8, y: 18, width: 2, height: 8, rx: 1 }));
  chair.appendChild(el('rect', { x: 6, y: 18, width: 2, height: 8, rx: 1 }));
  figure.appendChild(chair);

  const legs = el('g', { class: 'legs' });
  for (const side of ['l', 'r']) {
    const mount = el('g', { transform: `translate(${side === 'l' ? -4.5 : 4.5},0)` });
    const lg = el('g', { class: `leg-${side}` });
    lg.appendChild(el('rect', { class: 'leg', x: -2.2, y: 6, width: 4.4, height: 12, rx: 2 }));
    lg.appendChild(el('rect', { class: 'shoe', x: -2.6, y: 16, width: 5.2, height: 3, rx: 1.4 }));
    mount.appendChild(lg);
    legs.appendChild(mount);
  }
  body.appendChild(legs);

  body.appendChild(el('ellipse', { class: 'blanket', cx: 0, cy: 12, rx: 13, ry: 9 }));
  body.appendChild(el('rect', { class: 'torso', x: -9, y: -8, width: 18, height: 17, rx: 5 }));

  for (const side of ['l', 'r']) {
    const mount = el('g', { class: `arm-mount-${side}` });
    const ag = el('g', { class: `arm-${side}` });
    ag.appendChild(el('rect', { class: 'arm', x: -1.9, y: -8, width: 3.8, height: 14, rx: 1.9 }));
    if (side === 'r') {
      ag.appendChild(el('line', { class: 'bow-line', x1: 0, y1: 5, x2: 15, y2: -4 }));
      ag.appendChild(el('line', { class: 'mallet', x1: 0, y1: 5, x2: 4, y2: 13 }));
    } else {
      ag.appendChild(el('line', { class: 'mallet-l', x1: 0, y1: 5, x2: -4, y2: 13 }));
    }
    mount.appendChild(ag);
    body.appendChild(mount);
  }

  const attire = el('g', { class: 'attire' });
  attire.appendChild(attirePlain());
  attire.appendChild(attireHaiku());
  attire.appendChild(attireSonnet());
  attire.appendChild(attireOpus());
  attire.appendChild(attireFable());
  body.appendChild(attire);

  const headg = el('g', { class: 'headg' });
  headg.appendChild(el('circle', { class: 'head', cx: 0, cy: -17, r: 8.6 }));
  headg.appendChild(el('path', { class: 'hair', d: 'M-8.6 -19 a8.6 8.6 0 0 1 17.2 0 a10 10 0 0 0 -17.2 0 Z' }));
  headg.appendChild(el('circle', { class: 'eye', cx: -3, cy: -17, r: 1.05 }));
  headg.appendChild(el('circle', { class: 'eye', cx: 3, cy: -17, r: 1.05 }));
  body.appendChild(headg);

  body.appendChild(buildInstrument());

  const kase = el('g', { class: 'case' });
  kase.appendChild(el('rect', { x: -9, y: 13, width: 18, height: 7, rx: 2, fill: '#241f2b' }));
  kase.appendChild(el('rect', { class: 'case-lid', x: -9, y: 13, width: 18, height: 2, rx: 1 }));
  figure.appendChild(kase);

  const stand = el('g', { class: 'stand' });
  stand.appendChild(el('rect', { x: 11, y: -12, width: 1.6, height: 24, rx: .8, fill: '#332f3d' }));
  const desk = el('g', { transform: 'rotate(-12 12 -14)' });
  desk.appendChild(el('rect', { x: 6, y: -18, width: 15, height: 8, rx: 1, fill: '#4a3524' }));
  const pages = el('g', { class: 'pages' });
  for (let i = 0; i < 4; i++) {
    pages.appendChild(el('rect', { class: 'page', x: 7.4, y: -17.4 - i * .7, width: 12.4, height: 6.4, rx: .5 }));
  }
  desk.appendChild(pages);
  stand.appendChild(desk);
  const clutter = el('g', { class: 'clutter' });
  clutter.appendChild(el('rect', { x: -8, y: 17, width: 7, height: 4.6, rx: .5, fill: '#f3ecf7', transform: 'rotate(-10 -4.5 19)' }));
  clutter.appendChild(el('rect', { x: 4, y: 18, width: 6, height: 4.2, rx: .5, fill: '#e8e3ef', transform: 'rotate(14 7 20)' }));
  stand.appendChild(clutter);
  figure.appendChild(stand);

  const notes = el('g', { class: 'notes' });
  notes.appendChild(noteGlyph(8, -26));
  notes.appendChild(noteGlyph(-6, -30));
  notes.appendChild(noteGlyph(3, -34));
  figure.appendChild(notes);

  figure.appendChild(body);
  g.appendChild(figure);

  const z = el('text', { class: 'zzz', x: 13, y: -26, 'font-size': 11, 'font-weight': 700 });
  z.textContent = 'z';
  g.appendChild(z);

  const bub = el('g', { class: 'bubble' });
  bub.appendChild(el('path', { class: 'bub-tail', d: 'M6 -30 L13 -25 L14 -33 Z' }));
  bub.appendChild(el('rect', { class: 'bub-body', x: 5, y: -48, width: 34, height: 17, rx: 6 }));
  const bt = el('text', { class: 'bub-text', x: 22, y: -39.2, 'text-anchor': 'middle' });
  bt.textContent = (typeof THEME !== 'undefined' && THEME.farewell && THEME.farewell.text) || 'Fin!';
  bub.appendChild(bt);
  g.appendChild(bub);

  g.appendChild(el('circle', { class: 'sel', cx: 0, cy: -2, r: 29 }));

  const tag = el('text', { class: 'tag', x: 0, y: 31, 'text-anchor': 'middle' });
  const nm = el('tspan'); nm.textContent = s.name || '?';
  const rm = el('tspan', { class: 'room' });
  tag.appendChild(nm); tag.appendChild(rm);
  g.appendChild(tag);

  g.addEventListener('click', ev => { ev.stopPropagation(); window.selectSim(s.id); });
  return g;
}

// Five heft bands (same doctrine as house/car): a real translateY slump
// (.figure) + head bowing lower (.headg) + shadow swell + desaturation
// (--c/--hair) are the continuous carrier; the sheet-music pile (.page
// reveal) and floor clutter are the banded, hard-on/off charm carrier
// (§7 -- pages ARE context tokens, never faded).
function applyHeft(g, sp, s) {
  const h = Math.min(1, Math.max(0, s.heft || 0));
  if (sp.heft !== undefined && Math.abs(h - sp.heft) < 0.005) return;
  sp.heft = h;
  const H = hue(s);
  g.style.setProperty('--heft', h.toFixed(3));
  g.style.setProperty('--c',    `hsl(${H} ${(55 * (1 - 0.65 * h)).toFixed(1)}% ${(52 * (1 - 0.38 * h)).toFixed(1)}%)`);
  g.style.setProperty('--hair', `hsl(${H} ${(35 * (1 - 0.75 * h)).toFixed(1)}% ${(24 * (1 - 0.55 * h)).toFixed(1)}%)`);
  g.dataset.heft = Math.min(4, Math.floor(h * 5));
  const shadow = g.querySelector('.shadow');
  if (shadow) { shadow.setAttribute('rx', 13 + 6 * h); shadow.setAttribute('ry', 4.6 + 2 * h); }
}

function updateActor(g, sp, s) {
  applyHeft(g, sp, s);

  const cls = g.classList;
  const t = s.tier || 'plain';
  if (sp.tier !== t) {
    sp.tier = t;
    for (const x of ['plain', 'haiku', 'sonnet', 'opus', 'fable']) cls.toggle('tier-' + x, x === t);
  }

  // A session's instrument is who they are (which section they belong to),
  // independent of state -- idle/blocked keep holding theirs, only `stale`
  // (CSS) hides it into the case. `plan`/woodwinds is the harness/server
  // fallback default (THEMES.md's own convention, mirrored in the spec).
  const act = (window.ThemeEngine && window.ThemeEngine.activityOf(s)) || 'plan';
  if (sp.act !== act) {
    sp.act = act;
    g.dataset.act = act;
  }
}

// ---- concert hall (canvas) --------------------------------------------------
// rr() does not call proj() -- it draws in raw canvas pixels regardless of
// cam.zoom/px/py. rrw() is the fix, copied verbatim from house's own
// comment/implementation: project the corner, then scale w/h/r by cam.zoom.
function rrw(c, x, y, w, h, r, fill) {
  const [sx, sy] = proj(x, y);
  rr(c, sx, sy, w * cam.zoom, h * cam.zoom, r * cam.zoom, fill);
}

const PAL = {
  carpet: '#3a1420', carpetHi: '#4a1c2a',
  stageWood: '#6b4a34', stageWoodHi: '#7c5943', stageWoodDk: '#54382a',
  backFloor: '#413c52', backFloorHi: '#4c4660',
  curtain: '#5c1f2e', curtainDk: '#3f101c',
  gold: '#e8c351', amber: '#ffd97a',
  cotFrame: '#4a3524', benchWood: '#5a4230',
  seat: '#4a1e2c', seatHi: '#5c2636',
};

const PODIUM = { x: 500, y: 540 };
const FOOTLIGHT_XS = [140, 243, 346, 449, 552, 655, 758, 860];

function drawAudience(c) {
  c.fillStyle = '#141119'; c.fillRect(0, 0, W, H);
  isoFlat(c, -200, 580, 1400, 400, PAL.carpet);
  const rowYs = [612, 654, 696, 738];
  for (const y of rowYs) {
    for (const [l, r] of [[100, 410], [590, 900]]) {
      for (let x = l; x + 26 <= r; x += 30) {
        rrw(c, x, y - 6, 24, 8, 2, PAL.seatHi);
        rrw(c, x + 1, y, 22, 15, 3, PAL.seat);
      }
    }
  }
}

function drawBackstage(c) {
  isoFlat(c, 60, 60, 880, 170, PAL.backFloor);
  c.globalAlpha = .06;
  for (let gx = 60 + 40; gx < 940; gx += 40) isoFlat(c, gx, 60, 1, 170, '#14131a');
  c.globalAlpha = 1;

  // cots (stale slots): a low frame + mattress + pillow -- distinct from a
  // bench, so a lying figure reads as "put to bed", not "slumped in a chair".
  for (const [cx, cy] of [[118, 132], [184, 132]]) {
    rrw(c, cx - 27, cy - 20, 54, 40, 6, 'rgba(0,0,0,.22)');
    rrw(c, cx - 26, cy - 21, 52, 38, 6, PAL.cotFrame);
    rrw(c, cx - 22, cy - 18, 44, 32, 5, '#6f5b8c');
    rrw(c, cx - 22, cy - 18, 15, 12, 4, '#e8e3ef');
  }

  // benches (idle/stale overflow slots): one long rail, four seat marks.
  rrw(c, 280, 130, 226, 18, 4, 'rgba(0,0,0,.18)');
  rrw(c, 282, 126, 222, 16, 4, PAL.benchWood);
  for (const bx of [300, 356, 430, 486]) rrw(c, bx - 12, 122, 24, 6, 2, shade(PAL.benchWood, 1.25));

  // stage door threshold (770,230) and the warm-up floor's own faint wash.
  isoFlat(c, 745, 226, 50, 8, '#8f5a3c');
  rrw(c, 560, 78, 300, 110, 10, 'rgba(255,255,255,.02)');
}

function drawCurtain(c) {
  rrw(c, 60, 226, 880, 26, 4, PAL.curtainDk);
  for (let x = 70; x < 930; x += 34) rrw(c, x, 224, 20, 30, 10, PAL.curtain);
}

function drawStage(c) {
  isoFlat(c, 60, 230, 880, 350, PAL.stageWood);
  c.globalAlpha = .10;
  for (let gy = 254; gy < 580; gy += 24) isoFlat(c, 60, gy, 880, 1, PAL.stageWoodDk);
  c.globalAlpha = 1;

  // podium riser
  rrw(c, PODIUM.x - 24, PODIUM.y - 8, 48, 20, 4, 'rgba(0,0,0,.22)');
  rrw(c, PODIUM.x - 22, PODIUM.y - 10, 44, 18, 4, PAL.stageWoodDk);
  rrw(c, PODIUM.x - 18, PODIUM.y - 13, 36, 6, 2, shade(PAL.stageWoodDk, 1.2));

  // footlight housings (the glow itself breathes in drawFX)
  for (const x of FOOTLIGHT_XS) rrw(c, x - 5, 583, 10, 6, 2, '#241f2b');
}

function drawBackground(ctx) {
  drawAudience(ctx);
  drawStage(ctx);
  drawCurtain(ctx);
  drawBackstage(ctx);
}

// ---- fx (per-frame, on top of the cached background) -----------------------

function nearestBlockedSprite() {
  let best = null, bd = Infinity;
  for (const s of sessions) {
    if (s.state !== 'blocked') continue;
    const sp = sprites.get(s.id);
    if (!sp) continue;
    const d = Math.hypot(sp.x - PODIUM.x, sp.y - PODIUM.y);
    if (d < bd) { bd = d; best = sp; }
  }
  return best;
}

function occupancy() {
  let working = 0, blocked = 0;
  for (const s of sessions) {
    if (s.state === 'working') working++;
    else if (s.state === 'blocked') blocked++;
  }
  return { working, blocked };
}

// Small tailcoated conductor at the podium (§0.8: every offset/radius here is
// multiplied by cam.zoom, the plant-leaf/lamp/centerline fix, because these
// are all raw offsets from an already-proj()-ed point). Baton angle:
// -60deg + 35deg*sin(t*2pi/0.9) while anyone is working; drops to a fixed
// -100deg (at rest) the instant anyone is blocked, and the head/shoulders
// turn toward the nearest blocked musician's PROJECTED position (judgment
// call 3: the fallback if this got fiddly was baton-lowered-only; atan2 on
// two already-projected points turned out simple enough to keep).
function drawConductor(c, t) {
  const [px, py] = proj(PODIUM.x, PODIUM.y);
  const z = cam.zoom;
  const { working, blocked } = occupancy();
  const tt = REDUCED_MOTION ? 0.35 : t;

  let turnX = 0;
  const nb = blocked > 0 ? nearestBlockedSprite() : null;
  if (nb) {
    const [bx, by] = proj(nb.x, nb.y);
    const ang = Math.atan2(by - py, bx - px);
    turnX = Math.cos(ang) * 2.4 * z;
  }

  // shadow
  c.beginPath(); c.ellipse(px, py + 15 * z, 9 * z, 3 * z, 0, 0, 7);
  c.fillStyle = 'rgba(0,0,0,.3)'; c.fill();
  // legs/torso (tailcoat)
  c.fillStyle = '#17141d';
  c.fillRect(px - 4 * z, py - 18 * z, 8 * z, 18 * z);
  c.beginPath(); c.moveTo(px - 4 * z, py); c.lineTo(px - 6 * z, py + 13 * z); c.lineTo(px - 1 * z, py + 6 * z); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(px + 4 * z, py); c.lineTo(px + 6 * z, py + 13 * z); c.lineTo(px + 1 * z, py + 6 * z); c.closePath(); c.fill();
  // head, turned toward whoever needs attention
  c.beginPath(); c.ellipse(px + turnX, py - 24 * z, 4.6 * z, 5 * z, 0, 0, 7);
  c.fillStyle = '#f2c9a0'; c.fill();

  let batonDeg;
  if (blocked > 0) batonDeg = -100;
  else if (working > 0) batonDeg = -60 + 35 * Math.sin(tt * 2 * Math.PI / 0.9);
  else batonDeg = -95;
  const rad = batonDeg * Math.PI / 180;
  const shx = px + 4.5 * z, shy = py - 15 * z;
  const tipx = shx + Math.cos(rad) * 16 * z, tipy = shy + Math.sin(rad) * 16 * z;
  c.strokeStyle = '#e8c351'; c.lineWidth = 1.6 * z; c.lineCap = 'round';
  c.beginPath(); c.moveTo(shx, shy); c.lineTo(tipx, tipy); c.stroke();
}

// Footlights: dim amber, breathing gently -- deliberately never brighter than
// a low-alpha glow so the blocked spotlight (#fff8dd, near-white) stays the
// single brightest thing on the board (THEMES.md's luminance-exclusivity
// rule for this theme). Every radius/offset is a raw distance from an
// already-proj()-ed point, so cam.zoom is applied throughout.
function drawFootlights(c, t) {
  const tt = REDUCED_MOTION ? 0.5 : t;
  for (let i = 0; i < FOOTLIGHT_XS.length; i++) {
    const [px, py] = proj(FOOTLIGHT_XS[i], 585);
    const z = cam.zoom;
    const a = 0.55 + 0.10 * Math.sin(tt * (2 * Math.PI / 5) + i * 0.3);
    c.beginPath(); c.ellipse(px, py - 3 * z, 16 * z, 8 * z, 0, 0, 7);
    c.fillStyle = `rgba(255,217,122,${(0.10 * a).toFixed(3)})`; c.fill();
    c.beginPath(); c.arc(px, py, 3 * z, 0, 7);
    c.fillStyle = `rgba(255,217,122,${(0.85 * a).toFixed(3)})`; c.fill();
  }
}

function drawFX(c, t) {
  drawFootlights(c, t);
  drawConductor(c, t);
}

(window.THEME_RENDERERS = window.THEME_RENDERERS || {}).orchestra = {
  buildActor, updateActor, drawBackground, drawFX,
};

})();
