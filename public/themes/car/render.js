'use strict';
// themes/car/render.js -- the racetrack's ART (THEMES.md §5), on top of
// theme.json's geometry (the loop/grid/slots/field places) and
// theme-engine.js's placement algorithms. See themes/house/render.js's
// header for the render contract this file must satisfy; the short version:
//
//   buildActor(session) -> <g>   with .body/.alert/.tag/.sel/.bubble/.bub-text
//   updateActor(g, sp, s)        per-frame reads of heft/tier/activity
//   drawBackground(ctx)          cached furniture-equivalent (track, lot...)
//   drawFX(ctx, t)                per-frame animation on top
//
// sims.css is house-only (every selector in it is scoped under `.sim`, and
// this theme's root group is deliberately NOT `.sim` -- see below), so this
// file injects its OWN stylesheet once, the same zero-build escape hatch
// render.js itself already is (THEMES.md's "trust note", copied at the
// bottom of house's render.js: first-party code, same author, same origin).

(function () {

// ---- inject this theme's stylesheet (sims.css never sees `.car`) ---------
if (!document.getElementById('car-theme-style')) {
  const style = document.createElement('style');
  style.id = 'car-theme-style';
  style.textContent = `
.car { pointer-events: auto; cursor: pointer; transition: opacity .8s ease-in; }
.car.gone { opacity: 0; }
/* Invisible click catcher covering the whole car footprint (see buildActor):
   fill transparent, but pointer-events:all makes it hit-testable anyway. */
.car .hit { fill: transparent; pointer-events: all; }

/* ---- body shell: chassis carries heft, .body carries the host's face-flip
   (index.html overwrites .body's transform attribute every frame, so any
   heft transform on that same node would be clobbered -- exactly the
   reason house's applyHeft() targets .figure, never .body). ------------- */
.car .chassis { transform-origin: 0px 0px;
  transform: translateY(calc(var(--heft, 0) * 2px)) scaleY(calc(1 - var(--heft, 0) * 0.12)); }

/* ---- lot fix: a parked, nose-in car (.car.parked, set by index.html's
   updateSim alongside the fixed rotor rotate() -- see parkedNoseIn there)
   shrinks to fit its stall. .hull is .rotor's dedicated child for this
   file's own styling (see buildActor's comment: .rotor itself is
   host-written every frame, a CSS transform there would replace its
   rotate() outright). One scale knob, not four redrawn smaller shells. */
.car.parked .hull { transform: scale(.46); transform-origin: 0px 0px; }

/* Ground shadow is a sibling of .body/.rotor -- built that way so it never
   mirrors or rotates with it either, and needs its own correction here once
   parked: the same shrink as .hull, plus a 90deg turn so the wide
   "landscape" ellipse drawn to match a horizontal car reads as the narrower
   portrait patch a nose-in car actually casts. Left alone (full size,
   unrotated) this was the biggest single reason the lot read messy -- a
   large grey blob sized for the OLD sideways car sitting under the new,
   smaller, turned one. */
.car.parked .shadow { transform: rotate(90deg) scale(.62); transform-origin: center; }

.car .moto, .car .sedan, .car .suv, .car .limo { display: none; }
.car .sedan { display: block; }
.car.tier-haiku .sedan, .car.tier-opus .sedan, .car.tier-fable .sedan { display: none; }
.car.tier-haiku .moto { display: block; }
.car.tier-opus .suv { display: block; }
.car.tier-fable .limo { display: block; }

/* Ground shadow only while actually driving (looping or walking a leg) --
   hidden the instant a car settles (idle/stale in a stall, blocked pulled
   off, or working still mid-arrival-lap doesn't count as settled either,
   it's .working = on the loop = always moving). A stationary shadow read
   as a permanent grey smudge under every parked car, not a depth cue --
   worse once .statewash (the wider, coloured ground mark) was removed and
   this was the only thing left sitting under a car going nowhere. */
.car .shadow { fill: rgba(0,0,0,.35); display: none; }
.car.walking .shadow, .car.working .shadow { display: block; }

/* colour: the whole body reads in --c, desaturating/darkening with heft
   exactly like the house's people (same proven "amplitude not detail
   count" doctrine -- see sims.css's heft comment). */
.car .paint { fill: var(--c); }
.car .paint-dk { fill: var(--c); filter: brightness(0.72); }
.car .cabin { fill: #232030; }
.car .glass { fill: rgba(200,225,255,.55); }
.car .wheel { fill: #17141d; }
.car .rack { fill: #17141d; }
.car .limo-body { fill: #17141d; stroke: #e8c351; stroke-width: 2; }
.car .limo-trim { fill: none; stroke: #e8c351; stroke-width: 1; }
.car .limo-ornament { fill: #e8c351; }
.car .tophat-brim { fill: #17141d; }
.car .tophat-crown { fill: #17141d; }
.car .sparkle { fill: #ffe9a3; opacity: 0; animation: car-twinkle 1.8s ease-in-out infinite; }
.car .sparkle:nth-of-type(2) { animation-delay: .6s; }
.car .sparkle:nth-of-type(3) { animation-delay: 1.2s; }
@keyframes car-twinkle { 0%,100% { opacity: 0; transform: scale(.4) } 50% { opacity: 1; transform: scale(1) } }

/* ---- mud: band-snapped, same hard-on/off doctrine as the house's grime -- */
.car .mud { fill: rgba(58,42,26,.85); opacity: 0; }
.car[data-heft="2"] .mud, .car[data-heft="3"] .mud, .car[data-heft="4"] .mud { opacity: 1; }

/* ---- exhaust: density/duration ramps with heft, via [data-heft] bands --- */
.car .exhaust { opacity: 0; }
.car[data-heft="1"] .exhaust,
.car[data-heft="2"] .exhaust,
.car[data-heft="3"] .exhaust,
.car[data-heft="4"] .exhaust { opacity: 1; }
.car .puff { fill: rgba(180,178,188,.5); animation: car-puff 1.4s ease-out infinite; transform-origin: 0 0; }
.car[data-heft="3"] .puff, .car[data-heft="4"] .puff { animation-duration: .9s; fill: rgba(90,86,98,.65); }
.car .puff:nth-of-type(2) { animation-delay: .45s; }
.car .puff:nth-of-type(3) { animation-delay: .9s; }
@keyframes car-puff {
  0%   { transform: translate(0,0) scale(.4); opacity: 0 }
  20%  { opacity: .8 }
  100% { transform: translate(-14px,-4px) scale(1.6); opacity: 0 }
}

/* ---- idle: waiting for you, not switched off -- headlights stay lit
   (constant-on, never blinking: blinking is blocked's exclusively) so an
   idle car reads "ready" next to a working car's active tool-prop and a
   stale car's dark, engine-off shell (see the dim filter below). Mounted in
   the hull so they turn and shrink with the car once parked, same as the
   rest of the bodywork. ---------------------------------------------------- */
.car .idlelamp { display: none; }
.car.idle .idlelamp { display: block; }
.car .lamp-cone { fill: #ffefb8; opacity: .32; }
.car .lamp-core { fill: #ffd97a; opacity: .95; }

/* ---- activity props: what the session is DOING, not which car it is ---- */
.car .propslot { transform: translate(-2px,0px); }
.car.tier-haiku .propslot { transform: translate(-22px,-9px); }
.car .prop { display: none; }
.car.working .prop.on { display: block; }
.car .map-sheet { fill: #e8e0d0; stroke: #b9ac8e; stroke-width: .6; }
.car .map-fold { animation: car-flap 1.6s ease-in-out infinite; transform-origin: -4px 0; }
@keyframes car-flap { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(10deg) } }
.car .dish { fill: #cfd3da; stroke: #8b8f99; stroke-width: .6; }
.car .dish-stem { fill: #55565f; }
.car .lightbar { fill: #1c1a22; }
.car .lightbar-l { fill: #ffb457; animation: car-blink-l 1s step-start infinite; }
.car .lightbar-r { fill: #d5484a; animation: car-blink-l 1s step-start infinite reverse; }
@keyframes car-blink-l { 0%,49% { opacity: 1 } 50%,100% { opacity: .35 } }
.car .wrench { fill: #c7c9d1; }
.car .spark { fill: #ffc94a; animation: car-spark .5s ease-out infinite; }
@keyframes car-spark { 0% { transform: scale(.4); opacity: .9 } 100% { transform: scale(1.3); opacity: 0 } }
.car .mist { fill: var(--c); opacity: .5; animation: car-mist 1.1s ease-out infinite; }
@keyframes car-mist { 0% { transform: scale(.3); opacity: .6 } 100% { transform: scale(1.6); opacity: 0 } }
.car .trailer-body { fill: #4a4453; }
.car .trailer-wheel { fill: #17141d; }
.car .hitch { stroke: #6a6474; stroke-width: 1.4; }

/* ---- blocked: the single most important state in the product ----------
   Peripheral vision reads flicker and area, not detail (Fable's design
   call) -- so the halo (flashing area ~1.4x the car) does more work than
   the lamps, and the triangle stays perfectly static as the thing the eye
   lands on once it arrives. Every other state in this theme is deliberately
   flicker-free so blocked stays the ONLY thing on the board that blinks. */
/* Base visibility (opacity 0/1) is the HOST's job -- it sets the opacity
   SVG attribute on .alert directly every frame (updateSim() in index.html),
   exactly like the house's raised-hand ring. A CSS opacity rule here would
   outrank that presentation attribute permanently -- leave .alert alone and
   let .halo/.hazlamp animate WITHIN whatever visibility the host sets. */
.car .halo { fill: rgba(255,180,60,.4); animation: car-hazard .8s steps(1,end) infinite; }
.car .hazlamp { fill: #ffb457; animation: car-hazard .8s steps(1,end) infinite; }
@keyframes car-hazard { 0%,49% { opacity: 1 } 50%,100% { opacity: .15 } }
.car .hazring { display: none; fill: none; stroke: #ffb300; stroke-width: 3; }
.car .triangle-fill { fill: #fff8e7; }
.car .triangle-edge { fill: none; stroke: #e8442a; stroke-width: 2.4; stroke-linejoin: round; }
.car .triangle-mark { fill: #241f2b; }

@media (prefers-reduced-motion: reduce) {
  .car .halo, .car .hazlamp { animation: none !important; opacity: 1; }
  .car .hazring { display: inline; }
  .car .puff, .car .map-fold, .car .spark, .car .mist,
  .car .lightbar-l, .car .lightbar-r, .car .sparkle { animation: none !important; }
}

/* ---- stale: same lot as idle, just dark -----------------------------------
   Keyed directly on the STATE class (not a place-supplied pose/'sitting',
   which is how this used to work back when stale had its own separate
   paddock place, and briefly again under a cover after that). Now idle and
   stale are the SAME 'lot' slots place -- the place can't hand out two
   different poses to two different occupants of the same slot, so the car
   itself decides its own look purely from session state, exactly like
   every other state read in this file (idlelamp, halo).
   A COVER READ WRONG (author's call, after seeing it live): a tarp thrown
   over a car sitting in an ordinary lot stall looks like an error, not a
   sleeping session. Every stale car is a perfectly normal, fully visible
   parked car -- the ONLY visual delta from idle is that it's dark: no
   headlight cones (idle owns those exclusively, see .idlelamp above), no
   exhaust (an engine-off car doesn't puff), and the whole body dimmed
   toward grey. Colour is what peripheral vision keys on first (Fable's
   call, unchanged from the old cover's reasoning) -- a washed-out shell is
   still unmistakably "off" next to a working car's saturated colour and an
   idle car's full-brightness one, it just doesn't need a costume to say so. */
.car.stale .propslot, .car.stale .exhaust, .car.stale .alert { display: none; }
.car.stale .hull { filter: brightness(.72) saturate(.55); }
.car .zzz { display: none; }
.car.stale .zzz { display: block; animation: car-drift 3.4s ease-out infinite; }
@keyframes car-drift {
  0%   { transform: translate(0,0) scale(.7); opacity: 0 }
  30%  { opacity: .8 }
  100% { transform: translate(9px,-16px) scale(1.15); opacity: 0 }
}

/* ---- name tag: a plate under the car ------------------------------------ */
.car .tag { font: 700 9px ui-monospace, Menlo, monospace; fill: #fff;
  stroke: rgba(0,0,0,.8); stroke-width: 3px; paint-order: stroke; stroke-linejoin: round; }
.car .tag .room { fill: #cfc3da; font-weight: 600; }

.car .sel { display: none; }
.car.selected .sel { display: block; stroke: #fff; stroke-width: 2; stroke-dasharray: 4 3; fill: none; }

/* ---- bye: headlight flash + "Beep!" instead of a wave+bubble ----------- */
.car .bubble { display: none; }
.car.bye .bubble { display: block; animation: car-pop .3s cubic-bezier(.2,1.6,.4,1) both; }
.car .bub-body, .car .bub-tail { fill: #f3ecf7; }
.car .bub-text { font: 700 9px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; fill: #241f2b; }
@keyframes car-pop { 0% { opacity: 0; transform: translateY(4px) scale(.7) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
.car .headlight { fill: #fff8dd; opacity: 0; }
.car.bye .headlight { animation: car-flash .5s steps(1,end) 4; }
@keyframes car-flash { 0%,49% { opacity: .95 } 50%,100% { opacity: 0 } }

@media (prefers-reduced-motion: reduce) {
  .car * , .car { animation-duration: .001ms !important; }
  .car .halo, .car .hazlamp { animation: none !important; opacity: 1 !important; }
}
`;
  document.head.appendChild(style);
}

// ---- palette ---------------------------------------------------------------
const ASPHALT = '#302b39', ASPHALT_HI = '#3c3547', INFIELD = '#2c4a2e',
      GRASS = '#274023',
      SHOULDER = '#3a3542', CHEVRON = '#caa23a',
      // ---- parking lot (idle + stale, one shared lot) palette --
      // deliberately pale, neutral concrete + yellow paint, on a totally
      // different value/hue axis from the track's dark purple asphalt +
      // white paint: two independent channels (value, marking colour) so
      // the lot still reads as "not track" even at a glance (Fable's
      // call). The access ROAD reuses the track's own ASPHALT/dashes
      // instead -- it's the same pavement as the loop, just a spur off it,
      // so it has to look like the loop, not the lot. ----------------------
      LOT_CURB = '#6e6b76', LOT_PAD = '#55555e', LOT_AISLE = '#4c4c54',
      LOT_LINE = '#d9b64a', LOT_STOP_LT = '#8b8894', LOT_STOP_DK = '#2c2933',
      // ---- lot median trees -- a vivid, saturated green so the canopies
      // read as planted trees against both the pale concrete pad and the
      // median's own dull planter fill, not just a darker patch of it.
      TREE_CANOPY_DK = '#1f5e34', TREE_CANOPY = '#2f7a44', TREE_TRUNK = '#4a3624';

// ---- activity props (mounted per-tier via CSS .propslot transform,
// except `delegate` which is always towed behind regardless of vehicle
// class -- see the header comment: prop mount varies by class, but the
// PROP says what the session is doing) --------------------------------------

function mkProp(activity, mk) { const g = el('g', { class: 'prop on', 'data-activity': activity }); mk(g); return g; }

const PROPS = {
  exec: () => mkProp('exec', g => {
    g.appendChild(el('rect', { class: 'wrench', x: -6, y: -2, width: 12, height: 3, rx: 1.4, transform: 'rotate(-25)' }));
    g.appendChild(el('circle', { class: 'wrench', cx: -6, cy: -2, r: 3, transform: 'rotate(-25)' }));
    for (let i = 0; i < 3; i++) {
      const s = el('circle', { class: 'spark', cx: 2 + i * 2.2, cy: -4, r: 1.3 });
      s.style.animationDelay = (i * 0.16) + 's';
      g.appendChild(s);
    }
  }),
  edit: () => mkProp('edit', g => {
    g.appendChild(el('rect', { class: 'wrench', x: -2, y: -3, width: 9, height: 3.4, rx: 1.2 }));
    g.appendChild(el('rect', { class: 'wrench', x: 6, y: -2.2, width: 4, height: 1.8, rx: .6 }));
    for (let i = 0; i < 3; i++) {
      const m = el('circle', { class: 'mist', cx: 10 + i * 2, cy: -1 + i * 1.4, r: 1.6 });
      m.style.animationDelay = (i * 0.22) + 's';
      g.appendChild(m);
    }
  }),
  read: () => mkProp('read', g => {
    g.appendChild(el('rect', { class: 'map-sheet', x: -8, y: -7, width: 16, height: 12, rx: 1 }));
    const fold = el('g', { class: 'map-fold' });
    fold.appendChild(el('path', { class: 'map-sheet', d: 'M-4 -7 L8 -7 L8 5 L-4 5 Z', opacity: .55 }));
    g.appendChild(fold);
  }),
  net: () => mkProp('net', g => {
    g.appendChild(el('rect', { class: 'dish-stem', x: -1, y: -1, width: 2, height: 6 }));
    g.appendChild(el('path', { class: 'dish', d: 'M-7 -1 A7 5 0 0 1 7 -1 L4 -1 A4 3 0 0 0 -4 -1 Z' }));
  }),
  plan: () => mkProp('plan', g => {
    g.appendChild(el('rect', { class: 'lightbar', x: -8, y: -3, width: 16, height: 5, rx: 1.6 }));
    g.appendChild(el('rect', { class: 'lightbar-l', x: -7, y: -2, width: 6.5, height: 3, rx: 1 }));
    g.appendChild(el('rect', { class: 'lightbar-r', x: .5, y: -2, width: 6.5, height: 3, rx: 1 }));
  }),
  delegate: () => mkProp('delegate', g => {
    g.appendChild(el('line', { class: 'hitch', x1: 8, y1: 0, x2: 22, y2: 0 }));
    g.appendChild(el('rect', { class: 'trailer-body', x: 22, y: -6, width: 16, height: 12, rx: 2 }));
    g.appendChild(el('circle', { class: 'trailer-wheel', cx: 26, cy: 7, r: 2.2 }));
    g.appendChild(el('circle', { class: 'trailer-wheel', cx: 34, cy: 7, r: 2.2 }));
  }),
};
// `delegate` ignores the tier-based propslot roof mount (a trailer is towed,
// not carried) -- positioned with its own translate so it always sits behind
// the car regardless of vehicle class.
const DELEGATE_MOUNT = { haiku: -14, sonnet: -28, opus: -34, fable: -42, plain: -28 };

// ---- the four vehicle classes (THEMES.md §5.2, sized per Fable's
// silhouette-at-40px pass: aspect ratio + a second discriminator per pair,
// nose toward +x local, so .body's host-driven scale(face,1) keeps the
// "behind the car" props/triangle behind regardless of facing) -------------

function buildMoto() {
  const g = el('g', { class: 'moto' });
  g.appendChild(el('rect', { class: 'wheel', x: 13, y: -1.5, width: 9, height: 3, rx: 1.2 }));
  g.appendChild(el('rect', { class: 'wheel', x: -21, y: -2, width: 9, height: 4, rx: 1.5 }));
  g.appendChild(el('rect', { class: 'paint-dk', x: -15, y: -3, width: 30, height: 6, rx: 3 }));
  g.appendChild(el('rect', { class: 'paint-dk', x: 8, y: -6, width: 2, height: 12, rx: 1 }));
  g.appendChild(el('rect', { class: 'mud', x: -12, y: -2, width: 8, height: 4, rx: 1 }));
  g.appendChild(el('ellipse', { class: 'paint', cx: 2, cy: 0, rx: 5, ry: 4 }));
  g.appendChild(el('circle', { class: 'cabin', cx: 5, cy: 0, r: 5 }));
  g.appendChild(el('rect', { class: 'cabin', x: -24, y: -5, width: 10, height: 10, rx: 2 }));
  return g;
}

function buildSedan() {
  const g = el('g', { class: 'sedan' });
  for (const [wx, wy] of [[-19, -12.5], [19, -12.5], [-19, 9.5], [19, 9.5]])
    g.appendChild(el('rect', { class: 'wheel', x: wx - 4, y: wy - 1.5, width: 8, height: 3, rx: 1.2 }));
  g.appendChild(el('rect', { class: 'paint', x: -31, y: -13, width: 62, height: 26, rx: 7 }));
  g.appendChild(el('rect', { class: 'mud', x: -28, y: -13, width: 12, height: 8, rx: 2 }));
  g.appendChild(el('rect', { class: 'mud', x: 16, y: 5, width: 12, height: 8, rx: 2 }));
  g.appendChild(el('rect', { class: 'cabin', x: -15, y: -10, width: 26, height: 20, rx: 5 }));
  g.appendChild(el('rect', { class: 'glass', x: 9, y: -8, width: 4.5, height: 16, rx: 1.5 }));
  g.appendChild(el('rect', { class: 'glass', x: -17.5, y: -8, width: 4.5, height: 16, rx: 1.5 }));
  return g;
}

function buildSuv() {
  const g = el('g', { class: 'suv' });
  for (const [wx, wy] of [[-23, -17], [23, -17], [-23, 17], [23, 17]])
    g.appendChild(el('rect', { class: 'wheel', x: wx - 5, y: wy - 2, width: 10, height: 4, rx: 1.6 }));
  g.appendChild(el('rect', { class: 'paint', x: -37, y: -18, width: 74, height: 36, rx: 8 }));
  g.appendChild(el('rect', { class: 'mud', x: -34, y: -18, width: 14, height: 10, rx: 2 }));
  g.appendChild(el('rect', { class: 'mud', x: 18, y: 8, width: 14, height: 10, rx: 2 }));
  g.appendChild(el('rect', { class: 'cabin', x: -34, y: -14, width: 44, height: 28, rx: 4 }));
  g.appendChild(el('rect', { class: 'glass', x: -30, y: -11, width: 36, height: 6, rx: 1.5 }));
  g.appendChild(el('rect', { class: 'rack', x: -25, y: -5, width: 30, height: 2 }));
  g.appendChild(el('rect', { class: 'rack', x: -25, y: 3, width: 30, height: 2 }));
  return g;
}

function buildLimo() {
  const g = el('g', { class: 'limo' });
  for (const [wx, wy] of [[-28, -15.5], [24, -15.5], [-28, 15.5], [24, 15.5]])
    g.appendChild(el('rect', { class: 'wheel', x: wx - 4.5, y: wy - 1.8, width: 9, height: 3.4, rx: 1.4 }));
  g.appendChild(el('rect', { class: 'limo-body', x: -45, y: -15, width: 90, height: 30, rx: 9 }));
  g.appendChild(el('rect', { class: 'mud', x: -42, y: -15, width: 14, height: 10, rx: 2, opacity: 0 }));
  g.appendChild(el('rect', { class: 'cabin', x: -30, y: -11, width: 40, height: 22, rx: 3 }));
  g.appendChild(el('rect', { class: 'glass', x: -27, y: -9, width: 9, height: 18 }));
  g.appendChild(el('rect', { class: 'glass', x: -12.5, y: -9, width: 9, height: 18 }));
  g.appendChild(el('rect', { class: 'glass', x: 2, y: -9, width: 6, height: 18 }));
  g.appendChild(el('rect', { class: 'limo-trim', x: -18, y: -11, width: 3, height: 22 }));
  g.appendChild(el('rect', { class: 'limo-trim', x: -3.5, y: -11, width: 3, height: 22 }));
  g.appendChild(el('circle', { class: 'limo-ornament', cx: 42, cy: 0, r: 2 }));
  const hat = el('g', { transform: 'translate(6,-8)' });
  hat.appendChild(el('rect', { class: 'tophat-brim', x: -5, y: 3, width: 10, height: 1.6, rx: .8 }));
  hat.appendChild(el('rect', { class: 'tophat-crown', x: -3, y: -2, width: 6, height: 5.4, rx: .6 }));
  g.appendChild(hat);
  for (const [sx, sy] of [[-40, -12], [38, 10], [-38, 14]])
    g.appendChild(el('path', { class: 'sparkle', d: `M${sx} ${sy - 3} L${sx + 1} ${sy} L${sx} ${sy + 3} L${sx - 1} ${sy} Z` }));
  return g;
}

// ---- hazard system (blocked): halo (the flashing AREA that actually
// carries the peripheral-vision signal) + 4 corner lamps + a static warning
// triangle behind the car + a reduced-motion static ring. Everything else in
// this theme is deliberately flicker-free so `blocked` stays the only thing
// on the board that blinks (Fable's exclusivity call). ----------------------
function buildAlert() {
  const g = el('g', { class: 'alert' });
  g.appendChild(el('ellipse', { class: 'halo', cx: 0, cy: 0, rx: 63, ry: 33 }));
  g.appendChild(el('rect', { class: 'hazring', x: -47, y: -25, width: 94, height: 50, rx: 12 }));
  for (const [lx, ly] of [[-40, -14], [40, -14], [-40, 14], [40, 14]])
    g.appendChild(el('circle', { class: 'hazlamp', cx: lx, cy: ly, r: 3.4 }));
  const tri = el('g', { class: 'triangle', transform: 'translate(-72,0)' });
  tri.appendChild(el('path', { class: 'triangle-fill', d: 'M0 -15 L14 12 L-14 12 Z' }));
  tri.appendChild(el('path', { class: 'triangle-edge', d: 'M0 -15 L14 12 L-14 12 Z' }));
  tri.appendChild(el('rect', { class: 'triangle-mark', x: -1.4, y: -6, width: 2.8, height: 9, rx: 1 }));
  tri.appendChild(el('circle', { class: 'triangle-mark', cx: 0, cy: 6, r: 1.6 }));
  g.appendChild(tri);
  return g;
}

// ---- the sim -----------------------------------------------------------
function buildActor(s) {
  // Class carries BOTH `car` (this theme's own styling hook) and `sim` (the
  // host's actor contract class). index.html's camera-drag handler skips
  // drag-start only for `e.target.closest('.sim')`; without `sim` here, a
  // press on a car instead armed a camera pan and took pointer capture on the
  // board, which swallowed the click so selection never fired -- the house
  // actor is `.sim` and never had this. All of this file's CSS keys off
  // `.car`, so the extra class is inert to styling and there is no global
  // `.sim` rule to collide with.
  const g = el('g', { class: 'car sim', 'data-id': s.id });
  g.style.setProperty('--c', `hsl(${hue(s)} 62% 55%)`);

  // ---- hit target: SVG only fires a click when a *painted* shape sits under
  // the pointer, and a car's shell is a thin, gappy silhouette (wheels, a
  // narrow cabin, big empty margins out to the lamp cones), so most clicks
  // landed in the gaps and did nothing -- worst on the loop, where a moving
  // car is a small fast target. This transparent rect gives the whole car
  // footprint one solid, always-present catch surface. It's a `g`-level
  // sibling (never inside `.rotor`/`.hull`), so it stays axis-aligned and
  // full-size no matter how the car rotates on the loop or shrinks/turns
  // nose-in when parked -- the hit area doesn't rotate away or scale down
  // with the art. `pointer-events: all` catches regardless of the transparent
  // fill; it's the first child so it sits under every visible part and never
  // occludes them. Height stays inside the lot's row pitch so a click can't
  // be stolen by the stall above/below. Selection still flows through the
  // group's own click listener below.
  g.appendChild(el('rect', { class: 'hit', x: -50, y: -26, width: 100, height: 52 }));

  g.appendChild(el('ellipse', { class: 'shadow', cx: 0, cy: 3, rx: 34, ry: 15 }));

  const body = el('g', { class: 'body' });
  const chassis = el('g', { class: 'chassis' });

  // ---- bodywork: the ONLY thing that gets a true rotate() -- the loop's
  // per-frame one (index.html's loopTrack()/updateSim()) OR a parked car's
  // fixed nose-in one (index.html's `parkedNoseIn`, lot fix). Everything
  // physically mounted TO the car -- the four vehicle shells, exhaust, the
  // activity prop (roof box / trailer / dish, whatever's riding this
  // frame), headlights -- lives here so it turns with the nose both
  // through every corner AND into its stall. `.rotor` no-ops safely if
  // it's absent (house has none) and no-ops its own rotate when a car is
  // neither loop-bound nor parked (a blocked or still-walking car keeps
  // the old mirror-only `.body` transform, `.rotor` sits at identity
  // under it).
  const rotor = el('g', { class: 'rotor' });

  // `.hull` is `.rotor`'s one child, holding everything that turns. Split
  // out purely so a parked car can also SHRINK to fit its stall (the lot's
  // row pitch is far tighter than a full-size car's drawn length) via this
  // file's own CSS (`.car.parked .hull` above) without touching `.rotor`
  // itself -- `.rotor`'s transform attribute is written by index.html every
  // frame, and a CSS `transform` on that same node would silently replace
  // the attribute wholesale (CSS always wins over a presentation attribute
  // on one element), losing the rotation entirely. Two nodes, two owners:
  // the host writes `.rotor`'s rotate, this file writes `.hull`'s scale.
  const hull = el('g', { class: 'hull' });

  hull.appendChild(buildMoto());
  hull.appendChild(buildSedan());
  hull.appendChild(buildSuv());
  hull.appendChild(buildLimo());

  const exhaust = el('g', { class: 'exhaust', transform: 'translate(-40,4)' });
  for (let i = 0; i < 3; i++) exhaust.appendChild(el('circle', { class: 'puff', cx: 0, cy: 0, r: 3 }));
  hull.appendChild(exhaust);

  const prop = el('g', { class: 'propslot' });
  hull.appendChild(prop);

  for (const [hx, hy] of [[42, -9], [42, 9]])
    hull.appendChild(el('circle', { class: 'headlight', cx: hx, cy: hy, r: 3 }));

  // Idle: constant-on headlight cones (see the CSS comment above) -- the
  // one state that previously had zero added signal, reading as a plain
  // parked car indistinguishable from working-without-its-tools-out. Mounted
  // in the hull so they turn with the nose into the stall: once parked, they
  // shine out past the nose end (where the wheel-stop is), not sideways
  // into whichever stall happens to be next door.
  // Each beam fans OUTWARD from its own headlight (inner edges pulled off the
  // centreline to y -7/+7) instead of converging toward it -- the old cones
  // narrowed to a 4px gap at the nose, pinching into a muddy notch that read
  // as a smudge rather than two lamps. Now they spread like real low-beams,
  // two clean cones with an open lane between them.
  // Each beam is a trapezoid whose NEAR edge sits right on its lamp (x42,
  // spanning the lamp core) and whose FAR edge fans forward to x68 -- so the
  // beam reads as physically attached to the headlight and projecting out in
  // front of the nose, not as a thin sliver floating off in space (the "a
  // little too disconnected" report). The two beams splay gently apart (real
  // low-beams) but stay close enough at the front to read as one lit pool.
  const idleLamp = el('g', { class: 'idlelamp' });
  idleLamp.appendChild(el('polygon', { class: 'lamp-cone', points: '42,-12 42,-6 68,-2 68,-16' }));
  idleLamp.appendChild(el('polygon', { class: 'lamp-cone', points: '42,12 42,6 68,2 68,16' }));
  idleLamp.appendChild(el('circle', { class: 'lamp-core', cx: 42, cy: -9, r: 2 }));
  idleLamp.appendChild(el('circle', { class: 'lamp-core', cx: 42, cy: 9, r: 2 }));
  hull.appendChild(idleLamp);

  rotor.appendChild(hull);
  chassis.appendChild(rotor);

  // ---- labels: the hazard triangle+lamps and the sleep "z" must stay
  // upright and readable no matter which way the car is angled (THEMES.md's
  // trap this upgrade has to avoid). They're deliberately siblings of
  // `.rotor`, not children of it, so neither the loop's per-frame rotate()
  // nor a parked car's fixed nose-in rotate() ever touches them -- they
  // still get `.chassis`'s heft squash (unchanged) and `.body`'s mirror
  // (unchanged: that's how a blocked car's triangle has always landed
  // "behind" it regardless of which way it's parked), just never rotation.
  // The alert only shows for 'blocked' (the 'shoulder' place, never
  // rotated) so it's inert here either way; the "z" is the one label that
  // DOES turn up on a rotated (parked, stale) car -- deliberately kept
  // upright and floating beside it rather than rotating along, same as
  // every other label here.
  chassis.appendChild(buildAlert());

  const z = el('text', { class: 'zzz', x: 20, y: -22, fill: 'rgba(255,255,255,.55)',
    'font-size': 12, 'font-weight': 700 });
  z.textContent = 'z';
  chassis.appendChild(z);

  body.appendChild(chassis);
  g.appendChild(body);

  const bub = el('g', { class: 'bubble' });
  bub.appendChild(el('path', { class: 'bub-tail', d: 'M6 -30 L13 -25 L14 -33 Z' }));
  bub.appendChild(el('rect', { class: 'bub-body', x: 5, y: -48, width: 34, height: 17, rx: 6 }));
  const bt = el('text', { class: 'bub-text', x: 22, y: -39.2, 'text-anchor': 'middle' });
  bt.textContent = (typeof THEME !== 'undefined' && THEME.farewell && THEME.farewell.text) || 'Beep!';
  bub.appendChild(bt);
  g.appendChild(bub);

  const tag = el('text', { class: 'tag', x: 0, y: 40, 'text-anchor': 'middle' });
  const nm = el('tspan'); nm.textContent = (s.name || '?').toUpperCase();
  const rm = el('tspan', { class: 'room' });
  tag.appendChild(nm); tag.appendChild(rm);
  g.appendChild(tag);

  g.appendChild(el('rect', { class: 'sel', x: -50, y: -30, width: 100, height: 60, rx: 14 }));

  g.addEventListener('click', ev => { ev.stopPropagation(); window.selectSim(s.id); });
  return g;
}

// Five heft bands, same doctrine as the house: hard on/off reads as signal,
// fades read as noise (sims.css's heft comment, carried over verbatim).
function applyHeft(g, sp, s) {
  const h = Math.min(1, Math.max(0, s.heft || 0));
  if (sp.heft !== undefined && Math.abs(h - sp.heft) < 0.005) return;
  sp.heft = h;
  const H = hue(s);
  g.style.setProperty('--heft', h.toFixed(3));
  g.style.setProperty('--c', `hsl(${H} ${(62 * (1 - 0.55 * h)).toFixed(1)}% ${(55 * (1 - 0.30 * h)).toFixed(1)}%)`);
  g.dataset.heft = Math.min(4, Math.floor(h * 5));
}

function updateActor(g, sp, s) {
  applyHeft(g, sp, s);

  const cls = g.classList;
  const t = s.tier || 'plain';
  if (sp.tier !== t) {
    sp.tier = t;
    for (const x of ['plain', 'haiku', 'sonnet', 'opus', 'fable']) cls.toggle('tier-' + x, x === t);
  }

  // Activity prop: what the car is DOING. `delegate` always tows (rear
  // offset independent of the tier-based roof mount); everything else rides
  // the propslot, which CSS positions per vehicle class (courier box on a
  // motorcycle, roof otherwise).
  const activity = (s.state === 'working' && !sp.moving)
    ? (s.activity || ThemeEngine.activityOf(s)) : null;
  if (sp.prop !== activity) {
    sp.prop = activity;
    const slot = g.querySelector('.propslot');
    slot.textContent = '';
    slot.removeAttribute('transform');
    if (activity && PROPS[activity]) {
      if (activity === 'delegate') {
        const off = DELEGATE_MOUNT[t] || -28;
        slot.setAttribute('transform', `translate(${off},0)`);
      }
      slot.appendChild(PROPS[activity]());
    }
  }

  // Hazard phase sync (Fable's call): CSS animations start at element
  // creation, so several cars going `blocked` at different moments blink
  // out of phase, which reads as chaos instead of a pattern. A one-time
  // negative delay, set only on the transition into `blocked`, phase-locks
  // every hazard system to a shared 0.8s clock without any JS-driven
  // per-frame animation.
  if (s.state === 'blocked' && !sp.hazSynced) {
    sp.hazSynced = true;
    const delay = -(performance.now() % 800) + 'ms';
    for (const sel of ['.halo', '.hazlamp']) {
      for (const n of g.querySelectorAll(sel)) n.style.animationDelay = delay;
    }
  } else if (s.state !== 'blocked') {
    sp.hazSynced = false;
  }
}

// ---- track (canvas) --------------------------------------------------------
// World-space geometry helpers assume proj()/isoFlat()/poly()/shade() are
// already in scope (host-provided, see the contract note at the top of
// themes/house/render.js). The ring itself is a rounded-rect annulus --
// theme-engine's own polyline builder (already proven correct by the loop
// kind's containment maths) gives us the outer/inner boundary point lists
// for free, so the art and the routing geometry can never disagree about
// where the tarmac actually is.
function ringPts(cx, cy, w, h, r) {
  return ThemeEngine.buildLoopPolyline({ roundRect: { x: cx, y: cy, w, h, r } }).pts;
}
function fillWorldPoly(c, pts, fill) {
  poly(c, pts.map(p => proj(p.x, p.y)), fill);
}

const CENTER = { x: 120, y: 120, w: 760, h: 440, r: 110 };
const LANE = 28;

function drawTrack(c) {
  const outer = ringPts(CENTER.x - LANE, CENTER.y - LANE, CENTER.w + LANE * 2, CENTER.h + LANE * 2, CENTER.r + LANE);
  const inner = ringPts(CENTER.x + LANE, CENTER.y + LANE, CENTER.w - LANE * 2, CENTER.h - LANE * 2, CENTER.r - LANE);
  const center = ringPts(CENTER.x, CENTER.y, CENTER.w, CENTER.h, CENTER.r);

  fillWorldPoly(c, outer, ASPHALT);
  fillWorldPoly(c, inner, INFIELD);

  // Dashed centerline -- a plain stroked path in screen space over the
  // already-projected points reads fine in both camera modes.
  c.save();
  c.setLineDash([10, 10]);
  c.strokeStyle = 'rgba(232,227,239,.35)';
  c.lineWidth = 1.4;
  c.beginPath();
  center.forEach((p, i) => { const [sx, sy] = proj(p.x, p.y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
  c.closePath();
  c.stroke();
  c.restore();

  // Checkered start/finish strip, south straight, x=500 (where the house's
  // front door used to be -- arrival reads in the same screen place).
  const n = 8;
  for (let i = 0; i < n; i++) {
    const y = CENTER.y + CENTER.h - LANE + (i * (LANE * 2) / n);
    fillWorldPoly(c, [
      { x: 492, y }, { x: 508, y }, { x: 508, y: y + LANE * 2 / n }, { x: 492, y: y + LANE * 2 / n },
    ], (i % 2 === 0) ? '#e8e3ef' : '#232030');
  }
}

// ---- parking lot (idle + stale, ONE lot) -- "working is only driving, a
// parked car is either idle (headlights on, ready) or stale (dark, asleep),
// and either way it's in THIS lot" (fix #1: no more separate paddock zone --
// idle and stale are the same stalls, dark-vs-lit is the only delta, decided
// per-car purely from state -- see the .stale CSS above -- not by which zone
// a car stands in). Doubled in both row-count and floor area versus the old
// idle-only lot to absorb what used to be two zones' worth of occupants
// (fix #3) -- 20 stalls, 4 rows of 5, comfortably holding a realistic
// fleet (n=17: zero overlap, see bin/check-theme.js) before any compression.
// Everything below is axis-aligned isoFlat() rects -- no diagonals -- and
// every stall is drawn PORTRAIT (its own depth clearly greater than its own
// width, see drawLot()'s per-stall loop below), matching every car parked
// in one, which now noses in to match: index.html's updateSim applies a
// fixed, static rotate() to the car's `.rotor` for any settled idle/stale
// car (`parkedNoseIn`, world angle PARK_ANGLE_DEG = -90, i.e. nose-up/
// north), applied the same way the loop's true rotation already was.
// Axis-aligned rects are still the simplest shape to reason about here
// (Fable's call) -- getting the ORIENTATION right (portrait stall,
// portrait car) took a reshape of the paint, not a diagonal. Geometry
// matches theme.json's `lot` region/slots exactly: l210 r790 t185 b418,
// 5px curb inset, two close-packed row-pairs (222/271 and 332/381) split by
// one wider drive aisle (fix #2's access road feeds this aisle from the
// south -- see drawRoad() below and the `lot` region's anchor, planted at
// the road's mouth, not the lot's geometric centre). ------------------------
const LOT = { l: 210, t: 185, w: 580, h: 233 };
// Vertical drive aisles + HORIZONTAL stalls. Cars park in their native
// orientation (90 long x 46 wide, mirror only, no rotation) nosing left/right
// out of a stall, tail to the aisle they drove in from -- which is exactly what
// the engine's face=+/-1 mirror gives for free. RACETRACK.md has the full plan.
//   Col A (x265,face-1) | aisle1 310-360 | Col B (x405,face+1)
//   [median 450-475]    Col C (x520,face-1) | aisle2 565-615 | Col D (x660,face+1)
// 3 rows at y 225/285/345. Bottom cross-aisle 375-410 links both aisles to the
// access road (entrance mouth, x~500) so a car drives in from the track, down a
// lane, and noses into a bay.
const LOT_COLS = [ { x: 265, face: -1 }, { x: 405, face: 1 }, { x: 520, face: -1 }, { x: 660, face: 1 } ];
const LOT_ROWS = [225, 285, 345];
const AISLE1 = [310, 360], AISLE2 = [565, 615];   // [left,right] x of each vertical lane
const XAISLE = [375, 410];                          // [top,bottom] y of the bottom cross-aisle
const MEDIAN = [450, 475];                          // planter between B and C
// Evenly spaced down the median's own span (iy..XAISLE[0], computed in
// drawLot below as 190..375) -- hand-placed rather than derived so the
// spacing reads intentional (a row of street trees), not mechanically even.
const MEDIAN_TREES = [215, 282, 350];

// A single canopy + trunk, top-down: two overlapping fxArc blobs (a darker
// under-layer offset from a lighter one) read as leaf-cover volume at this
// scale far better than a single flat circle would -- same "two shades, not
// one flat fill" trick the loop's own asphalt/asphalt-hi edge uses. fxArc is
// host-provided (index.html), same convention as every other round ground
// object here.
function drawTree(c, x, y) {
  fxArc(c, x + 1, y + 5, 0, 3, 2, TREE_TRUNK, 'fill');       // trunk, peeking from the canopy's base
  fxArc(c, x, y, 0, 11, 7, TREE_CANOPY_DK, 'fill');          // canopy under-layer
  fxArc(c, x - 2.5, y - 2, 0, 8, 5, TREE_CANOPY, 'fill');    // lit offset layer, gives it volume
}

function drawMedianTrees(c) {
  for (const y of MEDIAN_TREES) drawTree(c, (MEDIAN[0] + MEDIAN[1]) / 2, y);
}

function drawLot(c) {
  isoFlat(c, LOT.l, LOT.t, LOT.w, LOT.h, LOT_CURB);           // curb frame
  const ix = LOT.l + 5, iw = LOT.w - 10, iy = LOT.t + 5, ib = LOT.t + LOT.h - 5;
  isoFlat(c, ix, iy, iw, ib - iy, LOT_PAD);                   // concrete pad

  // Two vertical drive lanes + the bottom cross-lane that ties them together
  // and to the access road. This is the "space to drive down" the old lot
  // lacked -- every stall's tail opens onto one of these.
  isoFlat(c, AISLE1[0], iy, AISLE1[1] - AISLE1[0], ib - iy, LOT_AISLE);
  isoFlat(c, AISLE2[0], iy, AISLE2[1] - AISLE2[0], ib - iy, LOT_AISLE);
  isoFlat(c, ix, XAISLE[0], iw, XAISLE[1] - XAISLE[0], LOT_AISLE);
  isoFlat(c, MEDIAN[0], iy, MEDIAN[1] - MEDIAN[0], XAISLE[0] - iy, '#2f4a34'); // planter
  drawMedianTrees(c);

  // Entrance mouth through the bottom curb, on the access-road centreline.
  isoFlat(c, 476, LOT.t + LOT.h - 5, 48, 5, LOT_AISLE);

  // Aisle centreline dashes -- yellow, never white (white is the racing line).
  for (const [ax0, ax1] of [AISLE1, AISLE2]) {
    const cx = (ax0 + ax1) / 2;
    for (let y = iy + 6; y < XAISLE[0]; y += 22) isoFlat(c, cx - 1.5, y, 3, 11, LOT_LINE);
  }
  for (let x = ix + 8; x < LOT.l + LOT.w; x += 26) isoFlat(c, x, (XAISLE[0] + XAISLE[1]) / 2 - 1.5, 12, 3, LOT_LINE);

  // ---- horizontal stalls: one bay per (column,row) ------------------------
  // A stall is wider (car length ~90) than tall (~48). Its two SIDE lines are
  // HORIZONTAL (the long edges, separating vertically-stacked bays); the
  // WHEEL STOP is a short VERTICAL bar at the NOSE end (left for face-1, right
  // for face+1). This is the correct orientation for a car that noses sideways
  // -- the inverse of the old portrait art the author called "the wrong way".
  const HALF = 45, TOP = 23;                 // half car length / half stall height
  for (const { x, face } of LOT_COLS) {
    for (const cy of LOT_ROWS) {
      const l = x - HALF, r = x + HALF;
      isoFlat(c, l, cy - TOP, r - l, 2, LOT_LINE);     // top edge
      isoFlat(c, l, cy + TOP - 2, r - l, 2, LOT_LINE); // bottom edge
      // Wheel stop spans the full stall width (flush inside the top/bottom
      // lines), not just a short segment floating in the middle -- a real
      // parking bumper runs the width of the space, not a third of it.
      const noseX = face < 0 ? l + 1 : r - 5;
      isoFlat(c, noseX, cy - (TOP - 2), 2, 2 * (TOP - 2), LOT_STOP_LT);
      isoFlat(c, noseX + 2, cy - (TOP - 2), 2, 2 * (TOP - 2), LOT_STOP_DK);
    }
  }
}

// ---- access road (fix #2) -- a real driveway, same asphalt as the track,
// spurring off the bottom straight (right under the start/finish stripe --
// theme.json's track anchor and the gate-lot portal both sit at x500, the
// same x this road runs down) and up into the lot's south entrance. route()
// walks it in both directions: the `lot` region's anchor sits at the road's
// LOT end (the drive aisle mouth), and `gate-lot` sits at the road's TRACK
// end, so a car leaving the loop is routed gate-lot -> lot.anchor -> its
// stall (down the road, then into the aisle), and a car rejoining the loop
// walks the same two points in reverse before merging (see index.html's
// on-ramp comment). Drawn, not just routed -- same ASPHALT fill as
// drawTrack() so the spur visually fuses with the tarmac it forks from
// instead of reading as a second, unrelated material. -----------------------
const ROAD = { l: 462, r: 538 };

function drawRoad(c) {
  // Main strip: lot's south curb down to just past the track's inner tarmac
  // edge, so it visually laps under the ring instead of stopping short of it.
  isoFlat(c, ROAD.l, LOT.t + LOT.h, ROAD.r - ROAD.l, 542 - (LOT.t + LOT.h), ASPHALT);
  // Mouth flare where it meets the loop -- wider than the strip, reading as
  // a real driveway joining a road rather than a paint stripe touching it
  // (Fable's call).
  isoFlat(c, 438, 500, 124, 42, ASPHALT);

  // Dashed centerline down the strip, same style as the track's -- the paint
  // language that says "this is more tarmac", not lot pavement.
  c.save();
  c.setLineDash([8, 8]);
  c.strokeStyle = 'rgba(232,227,239,.3)';
  c.lineWidth = 1.2;
  c.beginPath();
  const [sx1, sy1] = proj(500, LOT.t + LOT.h + 2);
  const [sx2, sy2] = proj(500, 538);
  c.moveTo(sx1, sy1); c.lineTo(sx2, sy2);
  c.stroke();
  c.restore();
}

function drawApron(c) {
  isoFlat(c, 215, 428, 570, 92, '#3a3a34');
}

function drawShoulder(c) {
  isoFlat(c, 172, 590, 656, 90, SHOULDER);
  isoFlat(c, 172, 590, 656, 8, ASPHALT_HI);
  // Static amber/dark chevron edge -- scene grammar for "the warning zone",
  // deliberately never animated (Fable: keep exactly one flashing system on
  // the whole board, and it belongs to the blocked car, not the scenery).
  for (let x = 180; x < 820; x += 26) {
    fillWorldPoly(c, [{ x, y: 606 }, { x: x + 13, y: 598 }, { x: x + 26, y: 606 }, { x: x + 13, y: 614 }],
      (Math.floor((x - 240) / 26) % 2 === 0) ? CHEVRON : '#241f2b');
  }
}

// ---- entrance/exit road -- the world's one connection to the outside:
// theme.json's `access` portal (875,540) is where arriving sessions route in
// and departing ones route out (its entrance/exit spreadX, 845..900, spawns
// and un-spawns them right under it, on the loop's SE corner). An earlier
// pass here painted a road fragment near this same corner that connected to
// no portal and no route() ever walked through, and removed it outright
// rather than fix it -- that left `access` with no pavement at all, so
// arrivals crossed open grass.
//
// A hand-guessed rectangle for the flare (tried first) undershot the actual
// curve badly: the loop's outer edge on a rounded-rect corner isn't at a
// fixed y, it sweeps from y450 (at the corner's rightmost point, x908) down
// to y588 (where the corner ends and the flat bottom straight begins) --
// nothing a straight box edge can hug. Fixed by building the road's top
// edge from the SAME outer-ring polyline drawTrack() paints (ringPts()),
// filtered down to just this corner's arc, so it's geometrically guaranteed
// to meet the tarmac with zero gap, whatever CENTER/LANE happen to be.
const ACCESS_ROAD = { l: 840, r: 908 };

function drawAccessRoad(c) {
  const outer = ringPts(CENTER.x - LANE, CENTER.y - LANE, CENTER.w + LANE * 2, CENTER.h + LANE * 2, CENTER.r + LANE);
  // y > mid-height restricts this to the BOTTOM-right corner's arc -- the
  // top-right corner shares the same x-range (908 down to 770) at y92..230,
  // and without this filter the two would interleave once sorted by x.
  const arc = outer
    .filter(p => p.x >= ACCESS_ROAD.l && p.x <= ACCESS_ROAD.r && p.y > CENTER.y + CENTER.h / 2)
    .sort((a, b) => a.x - b.x);
  if (!arc.length) return;

  // Run to the world's own bottom edge -- fitCamera's frame is exactly
  // world 30..970 x 30..790, so this reaches it cleanly for any x now that
  // the camera is a plain top-down scale+pan (no iso shear mixing x into
  // depth, which used to mean a strip sitting at x840..908 needed y well
  // past 790 to visually reach that same corner).
  const bottom = 790;
  const poly = [{ x: arc[0].x, y: bottom }, ...arc, { x: arc[arc.length - 1].x, y: bottom }];
  fillWorldPoly(c, poly, ASPHALT);

  // Dashed centerline, same style as the other roads. Anchored on the road's
  // actual horizontal centre (l/r midpoint) -- NOT the arc's middle-indexed
  // point, which sits at the arc's middle ANGLE, not its middle x (the 16
  // corner segments are evenly spaced by angle, so equal angle steps near
  // x908 barely move in x while steps near x840 move a lot; the middle
  // index's x comes out around 889, well right of the strip's true 874
  // centre -- reads as an off-centre dash instead of a lane marking).
  const cx = (ACCESS_ROAD.l + ACCESS_ROAD.r) / 2;
  let topY = arc[0].y;
  for (let i = 0; i < arc.length - 1; i++) {
    if (arc[i].x <= cx && arc[i + 1].x >= cx) {
      const t = (cx - arc[i].x) / (arc[i + 1].x - arc[i].x || 1);
      topY = arc[i].y + (arc[i + 1].y - arc[i].y) * t;
      break;
    }
  }
  c.save();
  c.setLineDash([8, 8]);
  c.strokeStyle = 'rgba(232,227,239,.3)';
  c.lineWidth = 1.2;
  c.beginPath();
  const [sx1, sy1] = proj(cx, topY + 6);
  const [sx2, sy2] = proj(cx, bottom - 4);
  c.moveTo(sx1, sy1); c.lineTo(sx2, sy2);
  c.stroke();
  c.restore();
}

function drawOutside(c) {
  c.fillStyle = '#141119'; c.fillRect(0, 0, W, H);
  isoFlat(c, -200, -200, 1400, 1200, GRASS);
}

function drawBackground(ctx) {
  drawOutside(ctx);
  drawTrack(ctx);
  // Apron before the road: the road's asphalt paints over the slice of
  // apron directly under it so the drive stays visually unbroken track-to-
  // lot; apron still shows either side of it. Lot last so its curb caps the
  // road's north end cleanly.
  drawApron(ctx);
  drawRoad(ctx);
  drawLot(ctx);
  drawShoulder(ctx);
  drawAccessRoad(ctx);
}

// ---- fx (ambient, per-frame) -----------------------------------------------
// No more per-bay occupancy wash: `working` no longer parks anywhere (it's
// only ever a car lapping the track), so there is no stationary "floor" left
// to light up by activity. Ambient ground fx for the still-stationary states
// (idle's headlight cones, stale's dim filter+zzz) already live on the CAR
// itself (see the .idlelamp/.stale CSS above) rather than the
// scenery, so drawFX has nothing left to do -- kept as a no-op to satisfy the
// render contract (THEMES.md: drawBackground/drawFX/buildActor/updateActor).
function drawFX(c, t) {}

(window.THEME_RENDERERS = window.THEME_RENDERERS || {}).car = {
  buildActor, updateActor, drawBackground, drawFX,
};

// ---- trust note -------------------------------------------------------------
// Same status as themes/house/render.js: first-party plain JS, not a
// sanitized declarative pack. See that file's closing comment for the full
// reasoning (THEMES.md §4) -- it applies here unchanged.
})();
