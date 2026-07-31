'use strict';
// themes/brigade/render.js -- the kitchen's ART, on top of theme.json's
// geometry (theme-engine.js). See themes/house/render.js's header for the
// full render contract; the short version:
//
//   buildActor(session) -> <g>   with .body/.alert/.tag/.sel/.bubble/.bub-text
//   updateActor(g, sp, s)        per-frame reads of heft/tier/activity
//   drawBackground(ctx)          cached furniture (the kitchen, dining room...)
//   drawFX(ctx, t)               per-frame animation on top
//
// The root actor group carries BOTH `cook` (this theme's own styling hook)
// and `sim` (the host's actor contract class -- index.html's camera-drag
// handler only skips drag-start for `e.target.closest('.sim')`; car shipped
// without it once and clicks died, see car/render.js's own note). Because
// the root is ALSO `.sim`, sims.css's generic rules (walking leg-swing,
// sitting/lying squash, the blocked wave, tier wardrobe toggles) apply for
// free wherever this file reuses house's class names (`leg-l`, `body`,
// `figure`, `sitting`, `lying`, `zzz`, ...) -- deliberate, not accidental:
// only the handful of things that need a DIFFERENT look from house (torso
// colour, blocked's halo-not-pulse, the tier ladder, props) get an explicit
// override here, injected as this theme's own stylesheet (car's pattern)
// so cascade order -- not selector surgery -- settles every conflict: this
// <style> is appended to <head> long after sims.css's <link>, so any tied
// specificity resolves in THIS file's favour automatically.

(function () {

if (!document.getElementById('brigade-theme-style')) {
  const style = document.createElement('style');
  style.id = 'brigade-theme-style';
  style.textContent = `
/* ---- identity: everyone wears whites; --c only tints the neckerchief,
   the cap/toque band, and the apron trim -- NOT the jacket, which sims.css
   would otherwise paint var(--c) via its generic ".sim .torso" rule (same
   selector shape, later in the cascade, so this wins the tie). Jacket/apron
   fill is a CSS custom property so the heft applier can lerp it in JS
   without touching SVG presentation attributes (which a stylesheet rule
   would silently outrank anyway -- the same trap car's DELEGATE_MOUNT
   comment documents for .propslot). ------------------------------------- */
.cook .torso  { fill: var(--jacket, #f2eee7); }
.cook .belly  { fill: var(--jacket, #f2eee7); }
.cook .apron  { fill: var(--apron, #e8e2d6); stroke: var(--c); stroke-width: .9; }
.cook .buttons circle { fill: #cfc7b8; }
.cook.tier-fable .buttons circle { fill: #e8c351; }
.cook .buttons .col-r { display: block; }
.cook.tier-haiku .buttons .col-r { display: none; }
.cook.tier-plain .buttons { display: none; }
.cook .neckerchief { fill: var(--c); }
.cook .bandana { fill: var(--c); opacity: .9; }
.cook .leg  { fill: #3b3348; }
.cook .shoe { fill: #e8e2d6; }
.cook .shoe-sole { fill: #2c2833; }

/* ---- grime: band-snapped per apron stain, same hard-on/off doctrine as
   the house's .grime-t and the car's .mud -- a fading pastel blob reads as
   noise at this scale, a hard on/off reads as dirt. Three separate stains
   light up in sequence across the heft bands instead of all four at once. */
.cook .grime-a, .cook .grime-b, .cook .grime-c { fill: rgba(52,38,28,.85); opacity: 0; }
.cook[data-heft="2"] .grime-a,
.cook[data-heft="3"] .grime-a, .cook[data-heft="3"] .grime-b,
.cook[data-heft="4"] .grime-a, .cook[data-heft="4"] .grime-b, .cook[data-heft="4"] .grime-c { opacity: 1; }

/* ---- the walk-in's milk-crate seat: same "hidden unless actually lying
   down" trick as house's own .duvet -- shown only via the host's generic
   .lying class (seated AND pose==='sleep', which is exactly the walkin
   slots place's own pose). */
.cook .duvet-crate { display: none; fill: #6a5c3e; }
.cook.lying .duvet-crate { display: block; }

/* ---- stale: dimmed on top of eyes-shut+zzz (sims.css's generic .stale
   already gives those two for free) -- the same "off" read as the car's own
   stale dim, so a walk-in nap reads as unmistakably different from an idle
   sit at the family table even at a glance, not just up close. Scoped to
   .figure (not the whole root group) so the name tag/selection ring/bubble
   stay full-brightness and legible. */
.cook.stale .figure { filter: brightness(.55) saturate(.4); }

/* ---- idle: a coffee mug at the family table, constant (not a prop --
   props are keyed on the *working* activity, idle isn't one), with an
   occasional sip. Long-hold keyframe idiom (house's page-flip precedent):
   the arm sits still for most of the cycle and lifts once. -------------- */
.cook .mug { display: none; fill: #e8e3ef; }
.cook.idle .mug { display: block; }
.cook.idle:not(.walking) .arm-r { animation: cook-sip 7s ease-in-out infinite; }
@keyframes cook-sip {
  0%, 90%  { transform: rotate(0deg) }
  95%      { transform: rotate(-55deg) }
  100%     { transform: rotate(0deg) }
}

/* ---- hats: the tier ladder is headwear altitude, nothing else -- plain
   goes bare (just the bandana), haiku a flat paper cap, sonnet a skull cap,
   opus a short toque, fable a tall gold-banded toque. Every hat is always
   built; only visibility toggles, so a /model switch redresses instantly. */
.cook .hats > * { display: none; }
.cook.tier-haiku .cap-paper { display: block; }
.cook.tier-sonnet .cap-skull { display: block; }
.cook.tier-opus .toque-s { display: block; }
.cook.tier-fable .toque-t { display: block; }
.cook .hat-base { fill: #f3ede0; }
.cook .cap-band { fill: var(--c); }
.cook .toque-s-band, .cook .toque-s-body { fill: #f3ede0; }
.cook .toque-s-band { fill: var(--c); }
.cook .toque-t-body { fill: #f7f2e8; }
.cook .toque-t-band { fill: #e8c351; }
.cook .toque-t-spoon { fill: #e8c351; }
.cook .toque-t-sparkle { fill: #ffe9a3; opacity: 0; animation: cook-twinkle 1.8s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
.cook .toque-t-sparkle:nth-of-type(2) { animation-delay: .6s; }
.cook .toque-t-sparkle:nth-of-type(3) { animation-delay: 1.2s; }
@keyframes cook-twinkle { 0%,100% { opacity: 0; transform: scale(.4) } 50% { opacity: 1; transform: scale(1) } }
/* opus: a side towel tucked at the waist, sous chef's own marker. */
.cook .towel { display: none; fill: #d8d2e6; }
.cook.tier-opus .towel { display: block; }
/* Hats ride the head, so they must not fight the walk bob (house's own
   tophat note, same fix). */
.cook.walking .hats { animation: cook-hatjog .52s linear infinite; transform-origin: 0 -22px; }
@keyframes cook-hatjog { 0%,100% { transform: rotate(-2deg) } 50% { transform: rotate(2deg) } }

/* ---- props: what a station is doing, keyed on activity (car's doctrine,
   not house's chore-keyed one) -- swapped in updateActor(). ------------- */
.cook .prop { display: none; }
.cook.working .prop.on { display: block; }
.cook .pan { fill: #3c3644; }
.cook .pan-hi { fill: #55506a; }
.cook .sizzle { fill: #ffb457; animation: cook-sizzle .5s ease-out infinite; }
@keyframes cook-sizzle { 0% { transform: translateY(0) scale(.5); opacity: .9 } 100% { transform: translateY(-8px) scale(1.2); opacity: 0 } }
.cook .knife-blade { fill: #cfd3da; }
.cook .knife-handle { fill: #2c2833; }
.cook .board { fill: #8a6a48; }
.cook .bit { fill: #e8c94a; animation: cook-bit .7s ease-out infinite; }
@keyframes cook-bit {
  0%, 30%  { opacity: 0; transform: scale(.3) }
  35%      { opacity: 1; transform: scale(1) }
  60%, 100%{ opacity: 0; transform: scale(1.3) }
}
.cook .book { fill: #d8d2e6; }
.cook .book-spine { fill: #8a5cc4; }
.cook .book-page { fill: #fff; animation: cook-flip 3.2s ease-in-out infinite; transform-origin: 0 0; }
@keyframes cook-flip { 0%, 84% { transform: scaleX(1) } 92% { transform: scaleX(0) } 100% { transform: scaleX(1) } }
.cook .marker { fill: #2c2833; }
.cook .marker-tip { fill: #d5484a; }
.cook .handset { fill: #d5484a; }
.cook .tray { fill: #b9b5c4; }
.cook .cloche { fill: #e8e3ef; }

/* activity arm motion -- one signature gesture per station, replacing (not
   layered on top of) sims.css's generic ".working:not(.walking) .arm-r/-l
   {animation:fuss}": same selector shape as that rule, declared later, so
   the tie always resolves here. net (the server, always .walking while on
   the loop) is naturally excluded by the same ":not(.walking)" sims.css
   already uses -- the loop's own leg-swing is signal enough. */
.cook.working:not(.walking) .arm-r,
.cook.working:not(.walking) .arm-l { animation: none; }
.cook[data-activity="exec"].working:not(.walking) .arm-r { animation: cook-stir .9s ease-in-out infinite; }
.cook[data-activity="edit"].working:not(.walking) .arm-r { animation: cook-chop .7s cubic-bezier(.6,0,1,1) infinite; }
.cook[data-activity="plan"].working:not(.walking) .arm-r { animation: cook-write 1.1s ease-in-out infinite; }
@keyframes cook-stir  { 0%,100% { transform: rotate(-10deg) } 50% { transform: rotate(14deg) } }
@keyframes cook-chop  { 0% { transform: rotate(-24deg) } 35% { transform: rotate(6deg) } 100% { transform: rotate(-24deg) } }
@keyframes cook-write { 0%,100% { transform: rotate(-6deg) } 50% { transform: rotate(4deg) } }

/* server: tray held overhead, bobbing with each stride -- phase-locked FEEL
   with the walk cycle (same .52s-ish family), not literally synced to it. */
.cook .propslot { transform: translate(0,0); }
.cook[data-activity="net"] .propslot { animation: cook-traybob .6s ease-in-out infinite; }
@keyframes cook-traybob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1.5px) } }

/* ---- blocked: the pass -- a ticket thrust overhead (static, the eye's
   landing point) plus a flashing amber halo (the AREA that actually reads
   in peripheral vision, car/house's shared doctrine). Every other animation
   in this theme is continuous; only this blinks, on purpose. Base 0/1
   visibility on .alert is the HOST's job (it writes the opacity attribute
   every frame) -- a CSS opacity rule on .alert itself would permanently
   outrank that, so only .halo (a CHILD) animates.
   .halo itself has no rule here at all -- sims.css's .sim.blocked .halo owns
   its color and blink timing for every theme, so "needs you" looks and
   blinks identically no matter which theme is active. This theme adds no
   flourish elements of its own beyond the (static) ticket, so there's
   nothing left to declare locally. */
.cook .hazring { display: none; fill: none; stroke: #ffb300; stroke-width: 3; }
.cook .ticket-up .ticket-body { fill: #f6f1e4; }
.cook .ticket-up .ticket-stripe { fill: #d5484a; }
.cook .ticket-up .ticket-line { fill: rgba(40,34,26,.4); }

/* ---- reduced motion: sims.css's own blanket rule (".sim *, .sim
   {animation:none !important}") already stops every keyframe above, and its
   own .sim.blocked .halo override already freezes the halo at full opacity
   -- this theme's own block only adds what neither of those cover: the
   static hazring fallback ring. */
@media (prefers-reduced-motion: reduce) {
  .cook .hazring { display: inline; }
}
`;
  document.head.appendChild(style);
}

// ---- props (keyed by ACTIVITY, not chore -- car's doctrine, THEMES.md §1's
// neutral vocabulary: what a session is DOING, independent of which theme
// happens to be drawing it) --------------------------------------------------

function mkProp(mk, transform) {
  const g = el('g', { class: 'prop on', transform });
  mk(g);
  return g;
}

const PROPS = {
  exec: () => mkProp(g => {
    g.appendChild(el('ellipse', { class: 'pan', cx: 0, cy: 0, rx: 7.5, ry: 2.8 }));
    g.appendChild(el('ellipse', { class: 'pan-hi', cx: -1, cy: -.8, rx: 5, ry: 1.6 }));
    g.appendChild(el('rect', { class: 'pan', x: 6, y: -1, width: 9, height: 1.8, rx: .9 }));
    for (let i = 0; i < 3; i++) {
      const s = el('circle', { class: 'sizzle', cx: -3 + i * 3, cy: -2.4, r: 1.1 });
      s.style.animationDelay = (i * 0.17) + 's';
      g.appendChild(s);
    }
  }, 'translate(13,-2)'),

  edit: () => mkProp(g => {
    g.appendChild(el('rect', { class: 'board', x: -8, y: -1, width: 18, height: 8, rx: 1.4 }));
    const knife = el('g', { class: 'knife', transform: 'rotate(20)' });
    knife.appendChild(el('rect', { class: 'knife-blade', x: -1, y: -9, width: 4, height: 9, rx: .6 }));
    knife.appendChild(el('rect', { class: 'knife-handle', x: -1, y: -1, width: 4, height: 4.5, rx: 1 }));
    g.appendChild(knife);
    for (let i = 0; i < 2; i++) {
      const b = el('circle', { class: 'bit', cx: 4 + i * 3, cy: 2, r: 1 });
      b.style.animationDelay = '0s';
      g.appendChild(b);
    }
  }, 'translate(11,-2)'),

  read: () => mkProp(g => {
    g.appendChild(el('rect', { class: 'book', x: -8, y: -6, width: 17, height: 12, rx: 1.2 }));
    g.appendChild(el('rect', { class: 'book-spine', x: -.9, y: -6, width: 1.8, height: 12 }));
    g.appendChild(el('rect', { class: 'book-page', x: .9, y: -5, width: 7, height: 10 }));
  }, 'translate(12,-3)'),

  plan: () => mkProp(g => {
    g.appendChild(el('rect', { class: 'marker', x: -1.2, y: -9, width: 2.4, height: 9, rx: 1 }));
    g.appendChild(el('rect', { class: 'marker-tip', x: -1.2, y: -10.4, width: 2.4, height: 1.8, rx: .6 }));
  }, 'translate(10,-18)'),

  delegate: () => mkProp(g => {
    g.appendChild(el('rect', { class: 'handset', x: -2, y: -4, width: 4, height: 9, rx: 1.6 }));
  }, 'translate(9,-16)'),

  net: () => mkProp(g => {
    g.appendChild(el('ellipse', { class: 'tray', cx: 0, cy: 4, rx: 11, ry: 3 }));
    g.appendChild(el('path', { class: 'cloche', d: 'M-8 4 A8 7 0 0 1 8 4 Z' }));
  }, 'translate(1,-32)'),
};

// ---- the character ---------------------------------------------------------

function buildActor(s) {
  const g = el('g', { class: 'cook sim', 'data-id': s.id });
  g.style.setProperty('--c', `hsl(${hue(s)} 62% 55%)`);
  g.style.setProperty('--hair', `hsl(${hue(s)} 40% 28%)`);

  g.appendChild(el('ellipse', { class: 'shadow', cx: 0, cy: 17, rx: 13, ry: 4.6 }));

  // ---- blocked: the pass ticket, thrust overhead + the flashing halo -----
  const alert = el('g', { class: 'alert', opacity: 0 });
  alert.appendChild(el('ellipse', { class: 'halo', cx: 0, cy: -6, rx: 40, ry: 34 }));
  alert.appendChild(el('circle', { class: 'hazring', cx: 0, cy: -6, r: 34 }));
  const ticketUp = el('g', { class: 'ticket-up', transform: 'translate(9,-30)' });
  ticketUp.appendChild(el('line', { x1: 0, y1: 10, x2: 0, y2: 0, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.4 }));
  ticketUp.appendChild(el('rect', { class: 'ticket-body', x: -7, y: -18, width: 14, height: 18, rx: 1.4 }));
  ticketUp.appendChild(el('rect', { class: 'ticket-stripe', x: -7, y: -18, width: 14, height: 3.4, rx: 1 }));
  ticketUp.appendChild(el('rect', { class: 'ticket-line', x: -4.5, y: -11, width: 9, height: 1.6, rx: .6 }));
  ticketUp.appendChild(el('rect', { class: 'ticket-line', x: -4.5, y: -7, width: 9, height: 1.6, rx: .6 }));
  alert.appendChild(ticketUp);
  g.appendChild(alert);

  const figure = el('g', { class: 'figure' });
  const body = el('g', { class: 'body' });

  const legs = el('g', { class: 'legs' });
  for (const side of ['l', 'r']) {
    const mount = el('g', { transform: `translate(${side === 'l' ? -4.5 : 4.5},0)` });
    const lg = el('g', { class: `leg-${side}` });
    lg.appendChild(el('rect', { class: 'leg', x: -2.2, y: 6, width: 4.4, height: 12, rx: 2 }));
    lg.appendChild(el('rect', { class: 'shoe', x: -2.7, y: 16, width: 5.4, height: 3, rx: 1.4 }));
    lg.appendChild(el('rect', { class: 'shoe-sole', x: -2.7, y: 18.2, width: 5.4, height: 1, rx: .5 }));
    mount.appendChild(lg);
    legs.appendChild(mount);
  }
  body.appendChild(legs);

  // Walk-in milk-crate seat -- house's .duvet pattern, shown only via .lying.
  body.appendChild(el('ellipse', { class: 'duvet-crate', cx: 0, cy: 13, rx: 12, ry: 8 }));

  body.appendChild(el('rect', { class: 'torso', x: -9, y: -8, width: 18, height: 17, rx: 5 }));

  const buttons = el('g', { class: 'buttons' });
  const colL = el('g', { class: 'col-l' }), colR = el('g', { class: 'col-r' });
  for (const by of [-4, 0, 4]) {
    colL.appendChild(el('circle', { cx: -2.6, cy: by, r: .85 }));
    colR.appendChild(el('circle', { cx: 2.6, cy: by, r: .85 }));
  }
  buttons.appendChild(colL); buttons.appendChild(colR);
  body.appendChild(buttons);

  body.appendChild(el('path', { class: 'neckerchief', d: 'M-4.4 -8.2 L0 -3.6 L4.4 -8.2 L0 -5.6 Z' }));

  body.appendChild(el('path', { class: 'apron', d: 'M-8 -1 L8 -1 L6 12 L-6 12 Z' }));
  const gA = el('g', { class: 'grime-a' }); gA.appendChild(el('circle', { cx: -3, cy: 4, r: 2.2 }));
  const gB = el('g', { class: 'grime-b' }); gB.appendChild(el('circle', { cx: 3, cy: 6, r: 1.8 }));
  const gC = el('g', { class: 'grime-c' }); gC.appendChild(el('circle', { cx: 0, cy: 9, r: 1.6 }));
  body.appendChild(gA); body.appendChild(gB); body.appendChild(gC);

  body.appendChild(el('ellipse', { class: 'belly', cx: 0, cy: 3, rx: 8, ry: 5.5 }));

  body.appendChild(el('rect', { class: 'towel', x: 6.5, y: 2, width: 3, height: 10, rx: 1 }));

  body.appendChild(el('rect', { class: 'mug', x: 11, y: -2, width: 6, height: 6, rx: 1.2 }));
  body.appendChild(el('rect', { class: 'mug', x: 17, y: -.6, width: 2.4, height: 1.4, rx: .7 }));

  for (const side of ['l', 'r']) {
    const mount = el('g', { class: `arm-mount-${side}` });
    const ag = el('g', { class: `arm-${side}` });
    ag.appendChild(el('rect', { class: 'arm', x: -1.9, y: -8, width: 3.8, height: 14, rx: 1.9 }));
    mount.appendChild(ag);
    body.appendChild(mount);
  }

  const headg = el('g', { class: 'headg' });
  const skull = el('g', { class: 'skull' });
  skull.appendChild(el('circle', { class: 'head', cx: 0, cy: -17, r: 8.6 }));
  skull.appendChild(el('path', { class: 'hair', d: 'M-8.6 -19 a8.6 8.6 0 0 1 17.2 0 a10 10 0 0 0 -17.2 0 Z' }));
  skull.appendChild(el('path', { class: 'bandana', d: 'M-8 -21 Q0 -27 8 -21 L6 -18 Q0 -22 -6 -18 Z' }));
  skull.appendChild(el('circle', { class: 'eye', cx: -3, cy: -17, r: 1.05 }));
  skull.appendChild(el('circle', { class: 'eye', cx: 3, cy: -17, r: 1.05 }));

  const hats = el('g', { class: 'hats' });
  const capPaper = el('g', { class: 'cap-paper' });
  capPaper.appendChild(el('path', { class: 'hat-base',
    d: 'M-8 -22 L8 -22 L8 -25 L4 -30 L-4 -30 L-8 -25 Z' }));
  capPaper.appendChild(el('rect', { class: 'cap-band', x: -8, y: -23, width: 16, height: 2 }));
  hats.appendChild(capPaper);
  const capSkull = el('g', { class: 'cap-skull' });
  capSkull.appendChild(el('path', { d: 'M-7.6 -20.4 a7.6 7.6 0 0 1 15.2 0 Z', class: 'hat-base' }));
  capSkull.appendChild(el('rect', { class: 'cap-band', x: -7.6, y: -21.6, width: 15.2, height: 2.6 }));
  hats.appendChild(capSkull);
  const toqueS = el('g', { class: 'toque-s' });
  toqueS.appendChild(el('rect', { class: 'toque-s-body', x: -7, y: -30, width: 14, height: 9, rx: 2 }));
  toqueS.appendChild(el('rect', { class: 'toque-s-band', x: -7.4, y: -22, width: 14.8, height: 2.6 }));
  hats.appendChild(toqueS);
  const toqueT = el('g', { class: 'toque-t' });
  toqueT.appendChild(el('path', { class: 'toque-t-body',
    d: 'M-7.4 -22 C-9 -30 -7 -38 0 -37 C7 -38 9 -30 7.4 -22 Z' }));
  toqueT.appendChild(el('rect', { class: 'toque-t-band', x: -7.6, y: -23, width: 15.2, height: 2.8 }));
  toqueT.appendChild(el('circle', { class: 'toque-t-spoon', cx: 12, cy: -6, r: 1.6 }));
  toqueT.appendChild(el('rect', { class: 'toque-t-spoon', x: 11.3, y: -6, width: 1.4, height: 9, rx: .6 }));
  for (const [sx, sy] of [[-4, -32], [5, -34], [0, -28]])
    toqueT.appendChild(el('path', { class: 'toque-t-sparkle',
      d: `M${sx} ${sy - 2} L${sx + .8} ${sy} L${sx} ${sy + 2} L${sx - .8} ${sy} Z` }));
  hats.appendChild(toqueT);

  headg.appendChild(skull);
  headg.appendChild(hats);
  body.appendChild(headg);

  const prop = el('g', { class: 'propslot' });
  figure.appendChild(body);
  figure.appendChild(prop);
  g.appendChild(figure);

  const z = el('text', { class: 'zzz', x: 13, y: -24, fill: 'rgba(255,255,255,.5)',
    'font-size': 11, 'font-weight': 700 });
  z.textContent = 'z';
  g.appendChild(z);

  const bub = el('g', { class: 'bubble' });
  bub.appendChild(el('path', { class: 'bub-tail', d: 'M6 -30 L13 -25 L14 -33 Z' }));
  bub.appendChild(el('rect', { class: 'bub-body', x: 5, y: -48, width: 34, height: 17, rx: 6 }));
  const bt = el('text', { class: 'bub-text', x: 22, y: -39.2, 'text-anchor': 'middle' });
  bt.textContent = (typeof THEME !== 'undefined' && THEME.farewell && THEME.farewell.text) || 'Ciao!';
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

// Heft: same five-band doctrine and same belly/shadow formulas as house's
// applyHeft (verbatim, per the spec) -- the one difference is that the
// jacket/apron aren't `var(--c)`, so their dinginess lerp writes a CSS
// custom property instead of `--c` itself (lerpColor is host-provided, same
// contract note as house/car's render.js).
function applyHeft(g, sp, s) {
  const h = Math.min(1, Math.max(0, s.heft || 0));
  if (sp.heft !== undefined && Math.abs(h - sp.heft) < 0.005) return;
  sp.heft = h;
  const H = hue(s);
  g.style.setProperty('--heft', h.toFixed(3));
  g.style.setProperty('--c',    `hsl(${H} ${(62 * (1 - 0.72 * h)).toFixed(1)}% ${(63 * (1 - 0.40 * h)).toFixed(1)}%)`);
  g.style.setProperty('--hair', `hsl(${H} ${(40 * (1 - 0.75 * h)).toFixed(1)}% ${(28 * (1 - 0.55 * h)).toFixed(1)}%)`);
  g.style.setProperty('--jacket', lerpColor('#f2eee7', '#a99c87', h));
  g.style.setProperty('--apron',  lerpColor('#e8e2d6', '#98876f', h));
  g.dataset.heft = Math.min(4, Math.floor(h * 5));

  const set = (sel, attrs) => {
    const n = g.querySelector(sel);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
  };
  set('.belly',  { rx: 8 + 6 * h, ry: 5.5 + 3.5 * h, cy: 3 + 2 * h });
  set('.shadow', { rx: 13 + 7 * h, ry: 4.6 + 2 * h });
}

function updateActor(g, sp, s) {
  applyHeft(g, sp, s);

  const cls = g.classList;
  const t = s.tier || 'plain';
  if (sp.tier !== t) {
    sp.tier = t;
    for (const x of ['plain', 'haiku', 'sonnet', 'opus', 'fable']) cls.toggle('tier-' + x, x === t);
  }

  // Prop follows the ACTIVITY (not the chore) -- car's doctrine, THEMES.md
  // §1's neutral vocabulary. `net` is the one exception to house's
  // "!sp.moving" gate: the server's tray is carried WHILE walking the loop,
  // every other station's tool is put down the moment a cook starts moving.
  const activity = (s.state === 'working') ? (s.activity || ThemeEngine.activityOf(s)) : null;
  const want = activity === 'net' ? 'net' : (activity && !sp.moving ? activity : null);
  if (sp.prop !== want) {
    sp.prop = want;
    const slot = g.querySelector('.propslot');
    slot.textContent = '';
    if (want && PROPS[want]) slot.appendChild(PROPS[want]());
  }
  g.dataset.activity = want || '';
}

// ---- the kitchen (canvas) ---------------------------------------------------

const PAL = {
  tile: '#5a5763', tileLine: '#14131a', wood: '#4d3a28', woodDk: '#3c2c1e',
  concrete: '#3c3844', wallCol: '#7d6144', steel: '#8d8a96', steelHi: '#b9b5c4',
  counter: '#6b4f34', counterDk: '#5a4229', ticket: '#f6f1e4', ticketRed: '#d5484a',
  amber: '#ffb457', cold: '#8fd3e8', alley: '#201d29', asphalt: '#1c1a22',
  cabinet: '#4a4455', shelfSpine: ['#8a5cc4', '#d8d2e6', '#6fb3c9', '#d5484a', '#46d17f', '#ffc94a'],
};

const BUILDING = { x: 60, y: 60, w: 880, h: 580 };
const DIV_Y = 330, DIV_X = 640, WALL_Z = 64, DIV_Z = 15, DIV_ALPHA = 0.55;
const PASS = { l: 160, r: 540, t: 320, b: 345 };
const BACK_DOOR = { x: 790, y: 640 };

// rr() does NOT call proj() -- it draws in raw canvas pixels, ignoring
// cam.zoom/px/py entirely (see house/render.js's own long-form comment on
// this). Every rounded shape below goes through this wrapper instead:
// project the corner, then scale w/h/r by cam.zoom before handing off.
function rrw(c, x, y, w, h, r, fill) {
  const [sx, sy] = proj(x, y);
  rr(c, sx, sy, w * cam.zoom, h * cam.zoom, r * cam.zoom, fill);
}

function chair(c, px, py, north) {
  const backY = north ? py - 7 : py + 36;
  const back = () => rrw(c, px + 2, backY, 30, 5, 2, PAL.woodDk);
  const legs = () => {
    for (const [lx, ly] of [[px + 3, py + 3], [px + 27, py + 3], [px + 3, py + 27], [px + 27, py + 27]])
      rrw(c, lx, ly, 4, 4, 1, '#3a2a1c');
  };
  rrw(c, px - 2, py + 3, 36, 36, 8, 'rgba(0,0,0,.18)');
  if (north) back();
  legs();
  rrw(c, px + 1, py + 1, 32, 32, 6, PAL.counter);
  rrw(c, px + 4, py + 4, 26, 26, 5, 'rgba(255,255,255,.05)');
  if (!north) back();
}

function table(c, x, y, w, h) {
  rrw(c, x - 3, y + 4, w + 6, h + 6, 10, 'rgba(0,0,0,.20)');
  for (const [lx, ly] of [[x + 6, y + 6], [x + w - 12, y + 6], [x + 6, y + h - 12], [x + w - 12, y + h - 12]])
    rrw(c, lx, ly, 6, 6, 2, PAL.woodDk);
  rrw(c, x, y, w, h, 8, PAL.wood);
  for (const gy of [y + 16, y + 31, y + 46]) isoFlat(c, x + 8, gy, w - 16, 1, PAL.woodDk, 26);
}

// A single round dining table, set but empty (between services) -- a plate
// + fork/knife dot pair per seat, four seats per table. Table-top objects,
// so the dots go through fxArc-style scaling by hand since they're placed
// via a raw offset from a proj()-ed centre (guard 2's exact class of bug).
function setTable(c, cx, cy, r) {
  fxArc(c, cx, cy + 3, 0, r * 1.05, r * 0.5, 'rgba(0,0,0,.18)', 'fill');
  const [px, py] = proj(cx, cy);
  const z = cam.zoom;
  c.beginPath(); c.ellipse(px, py, r * z, r * 0.62 * z, 0, 0, 7);
  c.fillStyle = PAL.wood; c.fill();
  c.beginPath(); c.ellipse(px, py, r * 0.8 * z, r * 0.48 * z, 0, 0, 7);
  c.fillStyle = 'rgba(255,255,255,.05)'; c.fill();
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const dx = Math.cos(a) * r * 0.62, dy = Math.sin(a) * r * 0.38;
    c.beginPath(); c.ellipse(px + dx * z, py + dy * z, 3.2 * z, 3.2 * z, 0, 0, 7);
    c.fillStyle = '#e8e3ef'; c.fill();
  }
}

function drawAlley(c) {
  c.fillStyle = PAL.asphalt; c.fillRect(0, 0, W, H);
  isoFlat(c, -200, -200, 1400, 1200, PAL.alley);
  // Loading-dock stoop + door, straddling BACK_DOOR -- the one door staff
  // actually use, per the spec's orientation call.
  isoFlat(c, BACK_DOOR.x - 34, BACK_DOOR.y - 4, 68, 10, '#5d5566');
  rrw(c, BACK_DOOR.x - 26, BACK_DOOR.y + 8, 52, 30, 4, '#241f2b');
  // Lamp cone over the stoop -- raw offsets off a proj()-ed point, so radii
  // scale by cam.zoom (guard 2).
  const [lx, ly] = proj(BACK_DOOR.x, BACK_DOOR.y + 26);
  const z = cam.zoom;
  c.beginPath(); c.ellipse(lx, ly, 46 * z, 30 * z, 0, 0, 7);
  c.fillStyle = 'rgba(255,201,74,.10)'; c.fill();
  // Dumpster, off to one side.
  rrw(c, BACK_DOOR.x + 70, BACK_DOOR.y + 20, 54, 34, 4, 'rgba(0,0,0,.25)');
  rrw(c, BACK_DOOR.x + 68, BACK_DOOR.y + 16, 54, 34, 4, '#3a4038');
  rrw(c, BACK_DOOR.x + 68, BACK_DOOR.y + 14, 54, 8, 3, '#4a5148');
}

function drawFloors(c) {
  // Dining: warm wood.
  isoFlat(c, 60, 60, 880, 270, PAL.wood);
  // Kitchen: pale tile with a faint grid (house's tile-grid technique).
  isoFlat(c, 60, 330, 580, 310, PAL.tile);
  c.globalAlpha = .06;
  for (let gx = 100; gx < 640; gx += 40) isoFlat(c, gx, 330, 1, 310, PAL.tileLine);
  for (let gy = 370; gy < 640; gy += 40) isoFlat(c, 60, gy, 580, 1, PAL.tileLine);
  c.globalAlpha = 1;
  // Backhouse: dark concrete.
  isoFlat(c, 640, 330, 300, 310, PAL.concrete);
}

function walls(c) {
  const wall = (x, y, w, h) => isoBox(c, x, y, w, h, WALL_Z, PAL.wallCol);
  wall(BUILDING.x, BUILDING.y, BUILDING.w, 9);
  wall(BUILDING.x, BUILDING.y, 9, BUILDING.h);

  const divider = (x, y, w, h) => {
    c.globalAlpha = DIV_ALPHA;
    isoBox(c, x, y, w, h, DIV_Z, '#5a4f56');
    c.globalAlpha = 1;
  };
  // Horizontal divider (dining / kitchen+backhouse), with the pass window
  // (160-540) and the swing door's gap (530-590) both left open, plus the
  // service door's own gap (760-820) -- see the spec's map for the layout.
  divider(60, DIV_Y, 100, 9);
  divider(590, DIV_Y, 170, 9);
  divider(820, DIV_Y, 120, 9);
  // Vertical divider (kitchen / backhouse), gapped at the inner door.
  divider(DIV_X, 330, 9, 120);
  divider(DIV_X, 510, 9, 130);

  // Doorway sills, matching house's threshold convention.
  const sill = (x, y, horiz) => horiz
    ? isoFlat(c, x - 30, y + (9 - 8) / 2, 60, 8, '#8f5a3c')
    : isoFlat(c, x + (9 - 8) / 2, y - 30, 8, 60, '#8f5a3c');
  sill(560, DIV_Y, true);
  sill(790, DIV_Y, true);
  sill(DIV_X, 480, false);
  isoFlat(c, BACK_DOOR.x - 30, BACK_DOOR.y - 4, 60, 8, '#8f5a3c');
}

function drawDining(c) {
  // Family-meal table, SW corner -- matches theme.json's famtable slots.
  chair(c, 103, 118, true); chair(c, 205, 118, true);
  table(c, 72, 161, 198, 62);
  chair(c, 103, 258, false); chair(c, 205, 258, false);

  // Three round tables set inside the server loop's ring (loop centerline
  // is a rounded rect x300-880,y100-270,r60 -- the straights run along
  // y=100/y=270, so the interior band around y=185 is clear floor, comfortably
  // more than the loop's own footprint-extreme margin away from either).
  setTable(c, 420, 185, 30);
  setTable(c, 590, 185, 30);
  setTable(c, 760, 185, 30);

  // A painted, portal-less front door on the dining room's north wall --
  // art only, staff never use it (the spec's orientation call).
  const [dx, dy] = proj(500, 60);
  const z = cam.zoom;
  isoFlat(c, 470, 56, 60, 10, '#5d4a38');
  isoFlat(c, 478, 58, 44, 6, '#8f5a3c');
  c.font = `${8 * z}px ui-rounded, system-ui, sans-serif`;
  c.fillStyle = 'rgba(255,255,255,.7)'; c.textAlign = 'center';
  c.fillText('OPEN', dx, dy + 5 * z);
  c.textAlign = 'left';
}

function drawKitchen(c) {
  // Range + hood, west wall (the sauté column stands right in front of it).
  rrw(c, 69, 355, 74, 270, 6, PAL.cabinet);
  rrw(c, 74, 360, 64, 260, 4, '#4a4655');
  for (const by of [400, 468, 536]) {
    fxArc(c, 100, by, 0, 9, 9, '#2a2530', 'fill');
    fxArc(c, 100, by, 0, 6, 6, '#4a4453', 'fill');
  }
  rrw(c, 69, 339, 90, 16, 3, '#3a3542');

  // Prep counter + cutting boards, east wall.
  rrw(c, 597, 355, 34, 270, 6, PAL.counter);
  rrw(c, 601, 360, 26, 260, 4, 'rgba(0,0,0,.12)');
  for (const by of [400, 468, 536]) {
    rrw(c, 604, by - 12, 20, 24, 3, '#8a6a48');
    isoFlat(c, 606, by - 2, 16, 2, '#4a3524');
  }

  // Dish-pit sink, south wall -- pure art, no place sits here.
  rrw(c, 300, 610, 80, 26, 5, PAL.steel);
  rrw(c, 306, 614, 30, 18, 3, '#2f2c38');
  rrw(c, 344, 614, 30, 18, 3, '#2f2c38');
  isoFlat(c, 336, 608, 8, 6, PAL.steelHi);
}

function drawBackhouse(c) {
  // Shelving, north wall.
  c.globalAlpha = .85;
  let x = 654;
  for (let i = 0; x < 790; i++) {
    const w = 5 + ((i * 7) % 6);
    isoFlat(c, x, 342, w, 18, PAL.shelfSpine[i % 6]);
    x += w + 1.5;
  }
  c.globalAlpha = 1;
  isoFlat(c, 649, 362, 140, 2, PAL.woodDk);

  // Specials board + a small desk beneath it.
  rrw(c, 745, 465, 70, 22, 3, '#2f3a2f');
  isoFlat(c, 748, 468, 64, 16, 'rgba(255,255,255,.03)');
  rrw(c, 750, 520, 60, 34, 5, PAL.counter);

  // Wall phone, east wall.
  rrw(c, 916, 522, 15, 24, 3, '#2c2833');
  rrw(c, 919, 526, 9, 8, 2, PAL.ticketRed);

  // The walk-in cooler -- a boxy steel unit, door ajar on its west face with
  // a wedge of cold light. The wedge is a raw offset off a proj()-ed point,
  // so every vertex scales by cam.zoom (guard 2).
  rrw(c, 800, 345, 131, 135, 6, 'rgba(0,0,0,.2)');
  rrw(c, 803, 348, 125, 129, 5, PAL.steel);
  rrw(c, 806, 351, 119, 123, 4, PAL.steelHi);
  isoFlat(c, 803, 405, 8, 30, '#4a4655');
  const [wx, wy] = proj(803, 420);
  const z = cam.zoom;
  c.beginPath();
  c.moveTo(wx, wy - 30 * z);
  c.lineTo(wx - 26 * z, wy - 20 * z);
  c.lineTo(wx - 26 * z, wy + 24 * z);
  c.lineTo(wx, wy + 30 * z);
  c.closePath();
  c.fillStyle = 'rgba(143,211,232,.16)'; c.fill();
}

function drawPass(c) {
  // Counter straddling the divider line, ticket rail above, service bell
  // and two heat-lamp cones -- the pass's own tightly-scoped set piece.
  rrw(c, PASS.l, PASS.t, PASS.r - PASS.l, PASS.b - PASS.t, 4, PAL.counter);
  isoFlat(c, PASS.l, PASS.t, PASS.r - PASS.l, 3, 'rgba(255,255,255,.10)');
  rrw(c, PASS.l - 2, PASS.t - 14, PASS.r - PASS.l + 4, 6, 3, '#2c2833');
  rrw(c, 546, PASS.t + 4, 12, 16, 2, PAL.steel);
  rrw(c, 549, PASS.t + 6, 6, 4, 1, PAL.steelHi);
}

function drawBackground(ctx) {
  drawAlley(ctx);
  drawFloors(ctx);
  walls(ctx);
  drawDining(ctx);
  drawKitchen(ctx);
  drawBackhouse(ctx);
  drawPass(ctx);
}

// ---- fx (per-frame, on top of the cached background) -----------------------

// n stationed-and-still sessions per activity, mirroring house's occupancy().
function occupancy() {
  const occ = { exec: 0, edit: 0, read: 0, plan: 0, delegate: 0 };
  for (const s of sessions) {
    if (s.state !== 'working') continue;
    const a = s.activity || ThemeEngine.activityOf(s);
    if (!a || !(a in occ)) continue;
    const sp = sprites.get(s.id);
    if (sp && !sp.moving) occ[a]++;
  }
  return occ;
}

const FX = {
  saute: (c, t, n) => {
    // Ambient stockpot simmer, always on; the flame ring brightens and the
    // sizzle-steam thickens only while a cook is actually stationed there.
    const ringA = n > 0 ? .30 + .30 * Math.sin(t * 7) : .12;
    for (const by of [400, 468, 536])
      fxArc(c, 100, by, 0, 6, 6, rgba(PAL.amber, ringA), 'stroke', 2.2);
    const puffs = n > 0 ? 3 : 1;
    for (let i = 0; i < puffs; i++) {
      const cyc = (t * 14 + i * 7) % 21;
      fxArc(c, 100, 400 - cyc, 0, 3, 3, rgba('#ffffff', .18 * (1 - cyc / 21)), 'stroke', 1.4);
    }
  },
  read: (c, t, n) => {
    if (n <= 0) return;
    fxArc(c, 700, 352, 0, 60, 14, 'rgba(255,201,74,.08)', 'fill');
  },
  delegate: (c, t, n) => {
    if (n <= 0) return;
    for (let i = 0; i < 2; i++) {
      const phase = (t * 0.7 + i * 0.5) % 1, r = 8 + 10 * phase;
      fxArc(c, 921, 530, 0, r, r, rgba(PAL.amber, .5 * (1 - phase)), 'stroke', 1.6);
    }
  },
  passLamps: (c, t) => {
    // Constant warm glow, slow sine breathe -- never stepped (house's
    // tv-glow precedent): the pass's only blink belongs to the halo above
    // a blocked cook's head, not the fixture.
    const glow = .55 + .12 * Math.sin(t * 1.4);
    for (const lx of [250, 450]) fxArc(c, lx, PASS.t + 6, 0, 26, 12, rgba(PAL.amber, glow * .28), 'fill');
  },
};

// Rail tickets: one white fluttering ticket above each CLAIMED pass slot,
// keyed off heldSeat's "pass:" entries -- flourish only, the actor's own
// .alert halo is still the authoritative signal (this fires even for a
// blocked cook who overflowed onto the weeds and has no pass slot at all).
function drawPassTickets(c, t) {
  const passPlace = THEME.places.find(x => x.id === 'pass');
  if (!passPlace) return;
  const blink = Math.floor(t / 0.8) % 2 === 0 ? 1 : .15;
  for (const [id, key] of heldSeat) {
    if (!key.startsWith('pass:')) continue;
    const slot = passPlace.slots[Number(key.split(':')[1])];
    if (!slot) continue;
    const skew = Math.floor(t / 0.8) % 2 === 0 ? 0 : 6;
    const [px, py] = proj(slot.x, slot.y - 30);
    const z = cam.zoom;
    c.save();
    c.translate(px, py);
    c.transform(1, 0, Math.tan(skew * Math.PI / 180), 1, 0, 0);
    c.globalAlpha = blink;
    c.fillStyle = PAL.ticket;
    c.fillRect(-7 * z, -14 * z, 14 * z, 18 * z);
    c.fillStyle = PAL.ticketRed;
    c.fillRect(-7 * z, -14 * z, 14 * z, 3.4 * z);
    c.restore();
    c.globalAlpha = 1;
  }
}

// Coffee steam (idle @ famtable) / cold breath (stale @ walk-in) -- the
// exact drawBedFX pattern from house: iterate heldSeat, filter by the
// place's own key prefix, skip anyone moving or not actually settled there.
function drawSeatFX(c, t) {
  const fam = THEME.places.find(x => x.id === 'famtable');
  const walkin = THEME.places.find(x => x.id === 'walkin');
  const byId = new Map(sessions.map(s => [s.id, s]));

  if (fam) {
    for (const [id, key] of heldSeat) {
      if (!key.startsWith('famtable:')) continue;
      const s = byId.get(id); const sp = sprites.get(id);
      if (!s || s.state !== 'idle' || !sp || sp.moving) continue;
      const slot = fam.slots[Number(key.split(':')[1])];
      if (!slot) continue;
      const phase = (t * 0.6 + hash(id) % 10 * 0.1) % 1;
      fxArc(c, slot.x + 14, slot.y - 18 - phase * 14, 0, 2.4 - phase * 1.2, 2.4 - phase * 1.2,
        rgba('#ffffff', .3 * (1 - phase)), 'fill');
    }
  }
  if (walkin) {
    for (const [id, key] of heldSeat) {
      if (!key.startsWith('walkin:')) continue;
      const sp = sprites.get(id);
      if (!sp || sp.moving || sp.pose !== 'sleep') continue;
      const slot = walkin.slots[Number(key.split(':')[1])];
      if (!slot) continue;
      const phase = (t * 0.4 + hash(id) % 10 * 0.1) % 1;
      fxArc(c, slot.x, slot.y - 20 - phase * 10, 0, 3 - phase, 2 - phase * .6,
        rgba(PAL.cold, .35 * (1 - phase)), 'fill');
    }
  }
}

function drawFX(c, t) {
  const occ = occupancy();
  FX.passLamps(c, t);
  FX.saute(c, t, occ.exec);
  FX.read(c, t, occ.read);
  FX.delegate(c, t, occ.delegate);
  drawPassTickets(c, t);
  drawSeatFX(c, t);
}

(window.THEME_RENDERERS = window.THEME_RENDERERS || {}).brigade = {
  buildActor, updateActor, drawBackground, drawFX,
};

// ---- trust note -------------------------------------------------------------
// Same status as themes/house/render.js and themes/car/render.js: first-
// party plain JS, not a sanitized declarative pack. See house/render.js's
// closing comment for the full reasoning (THEMES.md §4) -- it applies here
// unchanged.
})();
