'use strict';
// themes/house/render.js -- the house's ART, as distinct from its GEOMETRY
// (theme.json, driven by theme-engine.js).
//
// ---- THE RENDER CONTRACT, for the next theme (read this, not the rest) ----
//
// A theme registers itself once loaded:
//
//   (window.THEME_RENDERERS = window.THEME_RENDERERS || {})['<name>'] = {
//     buildActor(session)       -> SVGGElement   // called once per new sim
//     updateActor(g, sp, s)     -> void           // called every frame
//     drawBackground(ctx)       -> void           // furniture/world, cached
//     drawFX(ctx, t)            -> void           // per-frame animation on top
//   };
//
// index.html loads this file with a plain <script src> AFTER theme.json is
// fetched, so it shares the page's global scope on purpose (no bundler, no
// modules, per README's zero-build rule). It is first-party code -- see the
// contract note at the bottom of this file for exactly what that does and
// doesn't mean for a community theme later.
//
// What index.html (the host) already put in scope before this file loads,
// and that this file is free to call directly:
//   proj(wx,wy,wz), cam                   -- world -> screen, the camera
//   isoBox/isoFlat/poly/vface/roundRect/rr/fr/circ/shade   -- canvas primitives
//   fxArc, lerpColor, rgba                -- fx helpers
//   el(tag, attrs), NS                    -- SVG element construction
//   hue(s), hash(s)                       -- per-session colour/ordering
//   sessions, sprites, heldSeat           -- host state (read-only from here)
//
// What buildActor's returned <g> MUST contain, because updateSim() in
// index.html looks for these by class name every frame (the generic half of
// the actor contract -- state/selection/tag are host-owned per THEMES.md
// §3.3, so the host can render truthful HUD/notifications no matter what a
// theme draws):
//   .body           -- flipped horizontally (scale(face,1)) to face travel
//   .alert          -- opacity toggled 1/0 for the blocked hand-raise
//   .tag            -- a <text> with two <tspan> children: name, then room
//   .sel            -- the selection ring
//   .bubble / .bub-text -- the farewell bubble (text filled from theme.farewell)
// Host-applied classes on the root <g> (theme CSS styles these; the engine
// only sets them): walking, bye, gone, working, blocked, stale, sitting,
// lying, selected, tier-<plain|haiku|sonnet|opus|fable>.
//
// What THIS file owns exclusively: heft (a house-specific geometry read --
// belly/shadow swell, colour desaturation, --heft/--c custom properties) and
// the chore prop (a swapped-in mini-SVG per activity). Both live inside
// updateActor() below, unchanged from the original applyHeft()/prop-swap
// logic in index.html before this split.

(function () {

const PAL = {
  carcass: '#3a3542', cab: '#4a4453', top: '#6a6474', metal: '#8d8a96',
  metalHi: '#b9b5c4', wood: '#6b4f34', woodDk: '#5a4229', fabric: '#5b4a6e',
  fabricDk: '#4a3c5b', linen: '#cdc6d8', duvet: '#6f5b8c', screen: '#10151d',
  screenOn: '#2c4a6b', leaf: '#4f9a5f',
  flame: '#ffb457', water: '#8fd3e8', gold: '#ffc94a',
};
const SPINE = ['#8a5cc4', '#d8d2e6', '#6fb3c9', '#d5484a', '#46d17f', '#ffc94a'];

// Wall-to-wall house geometry for the FURNITURE draw, kept local to this
// file rather than derived from theme.json's regions: the art doesn't need
// to be pixel-locked to the routing rects (a theme's background is a
// separate asset, same as THEMES.md's optional world.svg), it just happens
// to have been measured against them originally.
const HOUSE = { x: 60, y: 60, w: 880, h: 580 };
const DIV_Y = 350, DIV_X = 500, WALL = 9;
const K_DOOR = { x: 250, y: DIV_Y }, S_DOOR = { x: 750, y: DIV_Y }, FRONT = { x: 500, y: HOUSE.y + HOUSE.h };
const WALL_Z = 64, DIV_Z = 15, DIV_ALPHA = 0.55;

// ---- props --------------------------------------------------------------

const PROPS = {
  watering: () => {
    const g = el('g', { class: 'prop on', 'data-chore': 'watering', transform: 'translate(13,-4)' });
    g.appendChild(el('rect', { class: 'can-body', x: -4, y: -4, width: 11, height: 9, rx: 2 }));
    g.appendChild(el('rect', { class: 'can-body', x: 6, y: -3, width: 7, height: 2.5, rx: 1,
      transform: 'rotate(18 6 -3)' }));
    for (let i = 0; i < 3; i++) {
      const d = el('circle', { class: 'drop', cx: 12 + i, cy: 1, r: 1.1 });
      d.style.animationDelay = (i * 0.28) + 's';
      g.appendChild(d);
    }
    return g;
  },
  cooking: () => {
    const g = el('g', { class: 'prop on', 'data-chore': 'cooking', transform: 'translate(13,-2)' });
    g.appendChild(el('ellipse', { class: 'pan', cx: 0, cy: 0, rx: 7, ry: 2.6 }));
    g.appendChild(el('rect', { class: 'pan', x: 6, y: -1, width: 8, height: 1.8, rx: .9 }));
    for (let i = 0; i < 3; i++) {
      const s = el('circle', { class: 'sizzle', cx: -3 + i * 3, cy: -2, r: 1.1 });
      s.style.animationDelay = (i * 0.17) + 's';
      g.appendChild(s);
    }
    return g;
  },
  reading: () => {
    const g = el('g', { class: 'prop on', 'data-chore': 'reading', transform: 'translate(12,-2)' });
    g.appendChild(el('rect', { class: 'book', x: -6, y: -5, width: 13, height: 10, rx: 1 }));
    g.appendChild(el('rect', { class: 'book-spine', x: -.7, y: -5, width: 1.4, height: 10 }));
    g.appendChild(el('rect', { class: 'page', x: .7, y: -4, width: 5.6, height: 8 }));
    return g;
  },
  phone: () => {
    const g = el('g', { class: 'prop on', 'data-chore': 'phone', transform: 'translate(9,-16)' });
    g.appendChild(el('rect', { class: 'handset', x: -2, y: -4, width: 4, height: 9, rx: 1.6 }));
    return g;
  },
  tidying: () => {
    const g = el('g', { class: 'prop on', 'data-chore': 'tidying', transform: 'translate(12,-6)' });
    g.appendChild(el('rect', { class: 'broom-h', x: -1, y: -6, width: 1.8, height: 16, rx: .8,
      transform: 'rotate(14)' }));
    g.appendChild(el('path', { class: 'broom-b', d: 'M-4 10 L5 10 L3 16 L-2 16 Z' }));
    return g;
  },
  window: () => {
    const g = el('g', { class: 'prop on', 'data-chore': 'window', transform: 'translate(12,-3)' });
    g.appendChild(el('rect', { class: 'mug', x: -3, y: -3, width: 6, height: 6, rx: 1.2 }));
    g.appendChild(el('rect', { class: 'mug', x: 3, y: -1.6, width: 2.4, height: 1.4, rx: .7 }));
    return g;
  },
};

// ---- the character --------------------------------------------------------

function buildActor(s) {
  const g = el('g', { class: 'sim', 'data-id': s.id });
  g.style.setProperty('--c', `hsl(${hue(s)} 62% 63%)`);
  g.style.setProperty('--hair', `hsl(${hue(s)} 40% 28%)`);

  g.appendChild(el('ellipse', { class: 'shadow', cx: 0, cy: 17, rx: 13, ry: 4.6 }));
  g.appendChild(el('circle', { class: 'alert', cx: 0, cy: -2, r: 24, fill: 'none',
    stroke: '#ffc94a', 'stroke-width': 2, opacity: 0 }));

  const body = el('g', { class: 'body' });

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

  body.appendChild(el('ellipse', { class: 'duvet', cx: 0, cy: 12, rx: 13, ry: 10 }));
  body.appendChild(el('rect', { class: 'duvet-fold', x: -12, y: 5, width: 24, height: 2, rx: 1 }));

  body.appendChild(el('rect', { class: 'torso', x: -9, y: -8, width: 18, height: 17, rx: 5 }));

  body.appendChild(el('ellipse', { class: 'belly', cx: 0, cy: 3, rx: 8, ry: 5.5 }));
  const gt = el('g', { class: 'grime-t' });
  gt.appendChild(el('circle', { cx: -3, cy: 2, r: 2.8 }));
  gt.appendChild(el('circle', { cx: 3, cy: 4, r: 2.3 }));
  body.appendChild(gt);

  for (const side of ['l', 'r']) {
    const mount = el('g', { class: `arm-mount-${side}` });
    const ag = el('g', { class: `arm-${side}` });
    ag.appendChild(el('rect', { class: 'arm', x: -1.9, y: -8, width: 3.8, height: 14, rx: 1.9 }));
    mount.appendChild(ag);
    body.appendChild(mount);
  }

  const head = el('g', { class: 'headg' });
  const skull = el('g', { class: 'skull' });
  skull.appendChild(el('circle', { class: 'head', cx: 0, cy: -17, r: 8.6 }));
  skull.appendChild(el('path', { class: 'hair', d: 'M-8.6 -19 a8.6 8.6 0 0 1 17.2 0 a10 10 0 0 0 -17.2 0 Z' }));
  skull.appendChild(el('circle', { class: 'eye', cx: -3, cy: -17, r: 1.05 }));
  skull.appendChild(el('circle', { class: 'eye', cx: 3, cy: -17, r: 1.05 }));
  head.appendChild(skull);
  body.appendChild(head);

  const dress = el('g', { class: 'dress' });
  dress.appendChild(el('path', { class: 'collar', d: 'M-4.2 -8.4 L0 -4 L4.2 -8.4' }));
  dress.appendChild(el('path', { class: 'tie', d: 'M0 -4.4 L-1.9 -1 L0 5.6 L1.9 -1 Z' }));
  dress.appendChild(el('path', { class: 'lapel', d: 'M-5.4 -8.4 L-1 -2.4 L-5.4 4.6 Z' }));
  dress.appendChild(el('path', { class: 'lapel', d: 'M5.4 -8.4 L1 -2.4 L5.4 4.6 Z' }));
  dress.appendChild(el('path', { class: 'bowtie', d: 'M-4.4 -6.4 L-1.1 -4.2 L-4.4 -2 Z M4.4 -6.4 L1.1 -4.2 L4.4 -2 Z' }));
  dress.appendChild(el('circle', { class: 'bowtie-k', cx: 0, cy: -4.2, r: 1.05 }));
  dress.appendChild(el('rect', { class: 'pocket', x: 3.4, y: -0.4, width: 3.1, height: 1.8, rx: .3 }));
  dress.appendChild(el('path', { class: 'tails', d: 'M-6.5 4 L-8.5 12 L-3.5 9 Z M6.5 4 L8.5 12 L3.5 9 Z' }));
  dress.appendChild(el('path', { class: 'trim', d: 'M-5.4 -7.4 L-1.2 -2 L-5.4 4' }));
  dress.appendChild(el('path', { class: 'trim', d: 'M5.4 -7.4 L1.2 -2 L5.4 4' }));
  const hat = el('g', { class: 'tophat' });
  hat.appendChild(el('rect', { class: 'hat-brim', x: -10.5, y: -25.6, width: 21, height: 2.2, rx: 1.1 }));
  hat.appendChild(el('rect', { class: 'hat-crown', x: -6.4, y: -36.4, width: 12.8, height: 11.2, rx: 1 }));
  hat.appendChild(el('rect', { class: 'hat-band', x: -6.4, y: -28.2, width: 12.8, height: 2.5 }));
  dress.appendChild(hat);
  const mono = el('g', { class: 'monocle' });
  mono.appendChild(el('circle', { class: 'mono-l', cx: 3.2, cy: -17, r: 3.4 }));
  mono.appendChild(el('path', { class: 'mono-chain', d: 'M6.3 -15.7 q2.2 3.4 .4 6.4' }));
  dress.appendChild(mono);
  for (const [sx, sy] of [[-11, -22], [10, -10], [-9, 2]]) {
    dress.appendChild(el('path', { class: 'sparkle',
      d: `M${sx} ${sy - 2.6} L${sx + .9} ${sy} L${sx} ${sy + 2.6} L${sx - .9} ${sy} Z` }));
  }
  body.appendChild(dress);

  const figure = el('g', { class: 'figure' });
  figure.appendChild(body);

  const prop = el('g', { class: 'propslot' });
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
  bt.textContent = (typeof THEME !== 'undefined' && THEME.farewell && THEME.farewell.text) || 'Bye!';
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

// Five heft bands from a continuous h (0..1, log-scaled from context tokens
// -- see server.js). A real overall SCALE on .figure (sims.css) is what
// makes h=0 vs h=1 read as two different-sized people from across the room;
// belly/skull/arm-mount/colour sharpen the silhouette on top of that. Style
// writes are not free, so this only touches the DOM when h actually moved.
function applyHeft(g, sp, s) {
  const h = Math.min(1, Math.max(0, s.heft || 0));
  if (sp.heft !== undefined && Math.abs(h - sp.heft) < 0.005) return;
  sp.heft = h;
  const H = hue(s);
  g.style.setProperty('--heft', h.toFixed(3));
  g.style.setProperty('--c',    `hsl(${H} ${(62 * (1 - 0.72 * h)).toFixed(1)}% ${(63 * (1 - 0.40 * h)).toFixed(1)}%)`);
  g.style.setProperty('--hair', `hsl(${H} ${(40 * (1 - 0.75 * h)).toFixed(1)}% ${(28 * (1 - 0.55 * h)).toFixed(1)}%)`);
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

  // Prop follows the chore; rebuilt only when the chore actually changes.
  const want = (s.state === 'working' && !sp.moving && PROPS[s.chore]) ? s.chore : null;
  if (sp.prop !== want) {
    sp.prop = want;
    const slot = g.querySelector('.propslot');
    slot.textContent = '';
    if (want) slot.appendChild(PROPS[want]());
  }
}

// ---- house (canvas) -------------------------------------------------------
// Painter's algorithm helpers assume proj()/isoBox()/isoFlat()/poly()/vface()/
// shade() are already defined by index.html (the host); see the contract
// note at the top of this file.

function drawKitchen(c) {
  isoBox(c, 69, 69, 350, 44, 30, PAL.top);
  isoFlat(c, 108, 75, 72, 32, shade(PAL.metal, 0.9), 30);
  isoFlat(c, 112, 79, 64, 24, '#4a4655', 30);
  poly(c, [proj(142, 69, 30), proj(146, 69, 30), proj(146, 69, 40), proj(142, 69, 40)], PAL.metalHi);
  isoBox(c, 329, 69, 62, 44, 32, PAL.carcass);
  for (const [bx, by] of [[345, 83], [375, 83], [345, 99], [375, 99]]) {
    const p = proj(bx, by, 32);
    c.beginPath(); c.ellipse(p[0], p[1], 7 * cam.zoom, 7 * cam.zoom, 0, 0, 7);
    c.fillStyle = '#2a2530'; c.fill();
    c.strokeStyle = PAL.top; c.lineWidth = 1.2; c.stroke();
  }
  isoBox(c, 419, 69, 72, 62, 70, PAL.metal);
  poly(c, [proj(421, 131, 30), proj(489, 131, 30), proj(489, 131, 32), proj(421, 131, 32)], '#6d6a76');
  poly(c, [proj(432, 131, 18), proj(442, 131, 18), proj(442, 131, 26), proj(432, 131, 26)], '#ffc94a');
  chair(c, 103, 157); chair(c, 205, 157);
  table(c, 72, 200, 198, 62);
  chair(c, 103, 277); chair(c, 205, 277);
}

function chair(c, px, py) {
  const north = py < 200;
  const backY = north ? py - 7 : py + 31;
  const back = () => {
    isoBox(c, px + 2, backY, 30, 5, 40, '#5c4530');
  };
  const legs = () => {
    for (const [lx, ly] of [[px + 3, py + 3], [px + 27, py + 3], [px + 3, py + 27], [px + 27, py + 27]])
      isoBox(c, lx, ly, 4, 4, 15, '#4a3728');
  };
  if (north) back();
  legs();
  isoBox(c, px + 1, py + 1, 32, 32, 17, '#7a5c3e');
  isoFlat(c, px + 4, py + 4, 26, 26, 'rgba(255,255,255,.05)', 17);
  if (!north) back();
}

function table(c, x, y, w, h) {
  for (const [lx, ly] of [[x + 6, y + 6], [x + w - 12, y + 6], [x + 6, y + h - 12], [x + w - 12, y + h - 12]])
    isoBox(c, lx, ly, 6, 6, 24, '#4e3826');
  isoBox(c, x, y, w, h, 26, PAL.wood);
  for (const gy of [y + 16, y + 31, y + 46]) isoFlat(c, x + 8, gy, w - 16, 1, PAL.woodDk, 26);
}

function drawBedroom(c) {
  isoFlat(c, 760, 230, 66, 90, 'rgba(160,110,140,.13)');
  for (const cx of [532, 566, 600]) {
    isoBox(c, cx - 10, 84, 20, 20, 16, '#8a5a3e');
    const [px, py] = proj(cx, 94, 16);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      c.beginPath();
      c.ellipse(px + Math.cos(a) * 8, py - 10 + Math.sin(a) * 6, 8, 6, a, 0, 7);
      c.fillStyle = i % 2 ? '#3f7d4e' : PAL.leaf; c.fill();
    }
    c.beginPath(); c.ellipse(px, py - 12, 7, 6, 0, 0, 7);
    c.fillStyle = '#58a86a'; c.fill();
  }
  isoBox(c, 620, 69, 88, 44, 34, PAL.wood);
  [[8, 73], [18, 87], [28, 101]].forEach(([dz, py]) =>
    vface(c, 624, 113, 704, 113, dz, dz + 8, shade(PAL.woodDk, 0.66), [624, py, 80, 11]));
  isoBox(c, 740, 69, 72, 44, 26, PAL.wood);
  isoBox(c, 752, 76, 20, 14, 6, PAL.carcass);
  isoBox(c, 754, 74, 16, 5, 9, '#d5484a');
  isoFlat(c, 786, 76, 18, 14, '#e8e3ef');
  isoBox(c, 838, 120, 74, 48, 22, PAL.wood);
  const [lx, ly] = proj(875, 144, 22);
  c.beginPath(); c.moveTo(lx - 13, ly - 6); c.lineTo(lx + 13, ly - 6);
  c.lineTo(lx + 9, ly - 22); c.lineTo(lx - 9, ly - 22); c.closePath();
  c.globalAlpha = .85; c.fillStyle = '#ffd98a'; c.fill(); c.globalAlpha = 1;
  c.beginPath(); c.ellipse(lx, ly + 6, 34, 14, 0, 0, 7);
  c.fillStyle = 'rgba(255,217,138,.08)'; c.fill();
  for (const [lx2, ly2] of [[829, 174], [921, 174], [829, 330], [921, 330]])
    isoBox(c, lx2, ly2, 6, 6, 10, '#3f2e1e');
  isoBox(c, 825, 170, 106, 170, 14, PAL.woodDk);
  isoBox(c, 825, 320, 106, 20, 30, '#4a3728');
  isoFlat(c, 829, 176, 98, 158, PAL.linen, 14);
  isoBox(c, 831, 180, 46, 28, 20, '#f3ecf7');
  isoBox(c, 879, 180, 46, 28, 20, '#f3ecf7');
  isoBox(c, 829, 214, 98, 106, 18, PAL.duvet);
  isoFlat(c, 829, 214, 98, 4, 'rgba(255,255,255,.16)', 18);
  for (const qy of [246, 278, 310]) isoFlat(c, 829, qy, 98, 1.5, 'rgba(0,0,0,.15)', 18);
  isoFlat(c, 878, 214, 1.5, 106, 'rgba(0,0,0,.10)', 18);
  isoBox(c, 825, 170, 106, 8, 46, '#4a3728');
  // Wall TV: mounted in the corner above the nightstand (x838-912,y120-168),
  // NOT beside the bed itself -- it used to sit at y210-300, which is the
  // bed frame's own y-range (170-340), so the "screen" rendered as a dark
  // bar fused into the right side of the mattress. y96-166 is the one open
  // strip of this wall: below the north furniture line (y69-113) but above
  // the headboard (y170), and clear of the nightstand's x838-912 footprint.
  vface(c, 931, 96, 931, 166, 26, 66, PAL.screen, [919, 96, 12, 70]);
}

function drawLiving(c) {
  isoFlat(c, 250, 375, 410, 245, 'rgba(122,90,110,.22)');
  isoFlat(c, 276, 401, 358, 193, 'rgba(255,255,255,.03)');
  isoBox(c, 84, 359, 132, 30, 62, '#4a3a2b');
  c.globalAlpha = .8;
  for (const [zTop, n] of [[54, 0], [36, 1], [18, 2]]) {
    let x = 88;
    for (let i = 0; x < 212; i++) {
      const w = 4 + ((i * 7 + n * 13) % 5);
      vface(c, x, 389, x + w, 389, zTop - 14, zTop, SPINE[(i + n) % 6], [x, 360 + n * 13, w, 9]);
      x += w + 1.5;
    }
  }
  c.globalAlpha = 1;
  isoBox(c, 784, 381, 112, 12, 14, PAL.carcass);
  vface(c, 796, 387, 884, 387, 14, 44, PAL.screen, [796, 359, 88, 24]);
  couch(c, 665, 430, 70, 160, 'west', [450, 520]);
  couch(c, 745, 548, 186, 70, 'south', [785, 838, 891]);
}

function couch(c, x, y, w, h, back, seats) {
  const southBack = back === 'south';
  const drawBack = () => {
    if (southBack) {
      isoBox(c, x, y + h - 14, w, 14, 40, PAL.fabricDk);
      for (const cx of seats) isoBox(c, cx - 24, y + h - 12, 48, 6, 38, shade(PAL.fabric, 1.05));
    } else {
      isoBox(c, x, y, 14, h, 40, PAL.fabricDk);
      for (const cy of seats) isoBox(c, x + 2, cy - 22, 6, 44, 38, shade(PAL.fabric, 1.05));
    }
  };
  for (const [lx, ly] of [[x + 4, y + 4], [x + w - 10, y + 4], [x + 4, y + h - 10], [x + w - 10, y + h - 10]])
    isoBox(c, lx, ly, 6, 6, 8, '#2f2739');
  if (!southBack) drawBack();
  isoBox(c, x, y, w, h, 18, PAL.fabric);
  for (const cc of seats) {
    if (southBack) { isoBox(c, cc - 25, y + 6, 50, h - 24, 24, shade(PAL.fabric, 1.12));
                     isoFlat(c, cc - 22, y + 9, 44, h - 30, 'rgba(255,255,255,.06)', 24); }
    else           { isoBox(c, x + 18, cc - 25, w - 24, 50, 24, shade(PAL.fabric, 1.12));
                     isoFlat(c, x + 21, cc - 22, w - 30, 44, 'rgba(255,255,255,.06)', 24); }
  }
  if (southBack) {
    isoBox(c, x, y, 14, h - 12, 30, PAL.fabricDk);
    isoBox(c, x + w - 14, y, 14, h - 12, 30, PAL.fabricDk);
  } else {
    isoBox(c, x + 12, y, w - 12, 12, 30, PAL.fabricDk);
    isoBox(c, x + 12, y + h - 12, w - 12, 12, 30, PAL.fabricDk);
  }
  if (southBack) drawBack();
}

function drawOutside(c) {
  c.fillStyle = '#141119'; c.fillRect(0, 0, W, H);
  isoFlat(c, -200, -200, 1400, 1200, '#243a28');
  isoFlat(c, -200, 745 - 32, 1400, 90, '#2b2833');
  for (let x = -200; x < 1200; x += 48) isoFlat(c, x, 745 + 10, 26, 3, '#c9b96a');
  isoFlat(c, FRONT.x - 26, FRONT.y, 52, 745 - 32 - FRONT.y, '#5d5566');
}

function drawTrees(c) {
  for (const [tx, ty, r] of [[140, 690, 26], [860, 690, 26], [300, 700, 20], [700, 700, 20]]) {
    isoBox(c, tx - 2.5, ty, 5, 5, r * 0.7, '#4a3524');
    const [cx, cy] = proj(tx, ty + 2, r * 0.7);
    circ(c, cx, cy - r * 0.3, r * 0.62, '#2f5c38');
    circ(c, cx - r * 0.34, cy + r * 0.05, r * 0.44, '#356b40');
    circ(c, cx + r * 0.34, cy, r * 0.40, '#274d2f');
  }
}

function drawHouse(c) {
  isoFlat(c, HOUSE.x, HOUSE.y, DIV_X - HOUSE.x, DIV_Y - HOUSE.y, '#5c5763');
  isoFlat(c, DIV_X, HOUSE.y, HOUSE.x + HOUSE.w - DIV_X, DIV_Y - HOUSE.y, '#4d3826');
  isoFlat(c, HOUSE.x, DIV_Y, HOUSE.w, HOUSE.y + HOUSE.h - DIV_Y, '#4a3524');

  const wall = (x, y, w, h) => isoBox(c, x, y, w, h, WALL_Z, '#7d6144');
  const divider = (x, y, w, h) => {
    c.globalAlpha = DIV_ALPHA;
    isoBox(c, x, y, w, h, DIV_Z, '#8a6c4c');
    c.globalAlpha = 1;
  };
  wall(HOUSE.x, HOUSE.y, HOUSE.w, WALL);
  wall(HOUSE.x, HOUSE.y, WALL, HOUSE.h);

  drawKitchen(c);
  drawBedroom(c);
  divider(DIV_X, HOUSE.y, WALL, DIV_Y - HOUSE.y);
  divider(HOUSE.x, DIV_Y, K_DOOR.x - 30 - HOUSE.x, WALL);
  divider(K_DOOR.x + 30, DIV_Y, S_DOOR.x - 30 - (K_DOOR.x + 30), WALL);
  divider(S_DOOR.x + 30, DIV_Y, HOUSE.x + HOUSE.w - (S_DOOR.x + 30), WALL);

  drawLiving(c);

  isoFlat(c, FRONT.x - 30, FRONT.y - 4, 60, 8, '#8f5a3c');
}

function drawBackground(ctx) {
  drawOutside(ctx);
  drawHouse(ctx);
  drawTrees(ctx);
}

// ---- fx (per-frame, on top of the cached background) ----------------------

let _shelfRow1 = null;
function shelfRow1() {
  if (_shelfRow1) return _shelfRow1;
  const row = [];
  let x = 88;
  for (let i = 0; x < 212; i++) {
    const w = 4 + ((i * 7 + 13) % 5);
    row.push({ x, w, color: SPINE[(i + 1) % 6] });
    x += w + 1.5;
  }
  return (_shelfRow1 = row);
}

// n per chore: how many sims are bound to that station AND standing still.
function occupancy() {
  const occ = { cooking: 0, watering: 0, tidying: 0, phone: 0, reading: 0, window: 0 };
  for (const s of sessions) {
    if (s.state !== 'working' || !(s.chore in occ)) continue;
    const sp = sprites.get(s.id);
    if (sp && !sp.moving) occ[s.chore]++;
  }
  return occ;
}

const FX = {
  cook: (c, t, n) => {
    if (n <= 0) return;
    const ringA = .30 + .30 * Math.sin(t * 7);
    for (const [bx, by] of [[345, 83], [375, 99]])
      fxArc(c, bx, by, 32, 7, 7, rgba(PAL.flame, ringA), 'stroke', 2.5);
    fxArc(c, 345, 99, 32, 9, 9, '#4a4453', 'fill');
    isoFlat(c, 352, 97.5, 12, 3, '#3a3542', 32);
    for (let i = 0; i < 3; i++) {
      const cyc = (t * 14 + i * 7) % 21;
      fxArc(c, 345, 96 - cyc, 32, 3, 3, rgba('#ffffff', .18 * (1 - cyc / 21)), 'stroke', 1.4);
    }
  },
  water: (c, t, n) => {
    if (n <= 0) return;
    for (let i = 0; i < 3; i++) {
      const cx = 532 + 34 * i;
      fxArc(c, cx, 92, 16, 8, 2.5, '#2a1d14', 'fill');
      for (let d = 0; d < 3; d++) {
        const phase = ((t + i * 0.3 + d * 0.37) % 1.1) / 1.1;
        fxArc(c, cx + 2, 74 + 16 * phase, 16, 1.2, 1.2, rgba(PAL.water, 1 - phase * .6), 'fill');
      }
      const [px, py] = proj(cx, 94, 16);
      c.globalAlpha = .35;
      c.beginPath(); c.ellipse(px, py - 12, 9.5, 7.8, 0, 0, Math.PI * 2);
      c.fillStyle = '#7fc98f'; c.fill();
      c.globalAlpha = 1;
    }
  },
  tidy: (c, t, n) => {
    if (n <= 0) return;
    const slide = 5 * (0.5 - 0.5 * Math.cos((t % 1.4) / 1.4 * Math.PI * 2));
    vface(c, 624, 113, 704, 113, 18, 26, 'rgba(255,255,255,.06)', [624, 87, 80, 11]);
    vface(c, 624, 113 + slide, 704, 113 + slide, 18, 26, shade(PAL.woodDk, 0.78), [624, 87 + slide, 80, 11]);
  },
  call: (c, t, n) => {
    if (n <= 0) return;
    isoBox(c, 754, 70, 16, 5, 9, '#d5484a');
    for (let i = 0; i < 2; i++) {
      const phase = (t * 0.7 + i * 0.5) % 1, r = 8 + 10 * phase;
      fxArc(c, 762, 83, 9, r, r, rgba(PAL.gold, .5 * (1 - phase)), 'stroke', 1.6);
    }
  },
  read: (c, t, n) => {
    if (n <= 0) return;
    const row = shelfRow1();
    if (!row.length) return;
    const s = row[Math.floor(t) % row.length];
    fxArc(c, 150, 377, 29, 60, 12, 'rgba(255,201,74,.08)', 'fill');
    vface(c, s.x, 392, s.x + s.w, 392, 22, 38, shade(s.color, 1.2), [s.x, 376, s.w, 11]);
  },
  'tv-l': (c, t, n) => {
    const glow = n > 0 ? .7 + .2 * Math.sin(t * 6) : .45 + .25 * Math.sin(t * 2.3);
    vface(c, 796, 387, 884, 387, 14, 44, lerpColor(PAL.screen, PAL.screenOn, glow), [796, 359, 88, 24]);
    isoFlat(c, 796, 359 + ((t * 30) % 24), 88, 2, 'rgba(255,255,255,.06)', 30);
    fxArc(c, 840, 405, 29, 70, 26, 'rgba(90,150,220,.06)', 'fill');
  },
  'tv-b': (c, t) => {
    const glow = .5 + .2 * Math.sin(t * 3);
    vface(c, 931, 96, 931, 166, 26, 66, lerpColor(PAL.screen, PAL.screenOn, glow), [919, 96, 12, 70]);
    isoFlat(c, 919, 96 + ((t * 40) % 70), 12, 2, 'rgba(255,255,255,.06)', 40);
  },
  rinse: (c, t) => {
    isoFlat(c, 143, 79, 2, 10, rgba(PAL.water, .3 + .3 * Math.sin(t * 6)), 30);
    for (let i = 0; i < 2; i++)
      fxArc(c, 144, 95, 6 + 2 * Math.sin(t * 5 + i * 1.6), 2, rgba(PAL.water, .25), 'fill');
  },
};

// The two bed slots breathe whenever someone is actually asleep in them --
// keyed off heldSeat's sticky claims rather than re-deriving occupancy.
function drawBedFX(c, t) {
  const bedSeat = THEME.places.find(x => x.id === 'bed');
  if (!bedSeat) return;
  const ry = 16 + 1.2 * (0.5 - 0.5 * Math.cos(t / 3.4 * Math.PI * 2));
  for (const [id, key] of heldSeat) {
    if (!key.startsWith('bed:')) continue;
    const sp = sprites.get(id);
    if (!sp || sp.moving || sp.pose !== 'sleep') continue;
    const slot = bedSeat.slots[Number(key.split(':')[1])];
    if (slot) fxArc(c, slot.x, slot.y + 6, 18, 26, ry, '#7a6699', 'fill');
  }
}

function drawFX(c, t) {
  const occ = occupancy();
  FX.rinse(c, t);
  FX.cook(c, t, occ.cooking);
  FX.water(c, t, occ.watering);
  FX.tidy(c, t, occ.tidying);
  FX.call(c, t, occ.phone);
  FX.read(c, t, occ.reading);
  FX['tv-l'](c, t, occ.window);
  FX['tv-b'](c, t);
  drawBedFX(c, t);
}

(window.THEME_RENDERERS = window.THEME_RENDERERS || {}).house = {
  buildActor, updateActor, drawBackground, drawFX,
};

// ---- trust note (THEMES.md §4) ---------------------------------------------
// This file is plain JS, not a sanitized declarative pack -- deliberately.
// THEMES.md's no-JS rule exists to stop an UNTRUSTED community theme from
// reaching /api/kick and /api/say; it says nothing about the two built-in
// themes shipped IN this repository, which are exactly as trusted as
// index.html itself (same author, same review, same origin, same git
// history). render.js is a first-party escape hatch used because the
// declarative actor/background format and SVG sanitizer (THEMES.md §4.2c)
// are deliberately deferred past v1 -- it is not a public extension point,
// gets no sandboxing, and is expected to be replaced (not stabilized) once
// that format lands. A theme.json alone, with no render.js, is still a
// valid v1-declarative-compliant pack for the geometry contract; it simply
// has no visuals until a renderer exists.
})();
