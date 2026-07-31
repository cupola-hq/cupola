'use strict';
// themes/station/render.js -- "The Station"'s ART, on top of theme.json's
// geometry (theme-engine.js's grid/slots/field/loop placement). See
// themes/house/render.js's header for the full render contract this file
// satisfies (buildActor/updateActor/drawBackground/drawFX); the short
// version:
//
//   buildActor(session) -> <g>   with .body/.alert/.tag/.sel/.bubble/.bub-text
//   updateActor(g, sp, s)        per-frame reads of heft/tier/activity/onLoop
//   drawBackground(ctx)          cached hull/module/tether-rail furniture
//   drawFX(ctx, t)               per-frame animation on top
//
// sims.css is house-only (every selector in it is scoped under `.sim`, and
// house's own vocabulary -- .dress, .duvet, .belly, tophat/monocle wardrobe
// -- has nothing to do with a flight suit or an EVA hardshell), so this file
// injects its OWN stylesheet once, same escape hatch themes/car/render.js
// already uses for the identical reason. The root <g> carries BOTH `station`
// (this theme's styling hook) and `sim` (the host's actor-contract class --
// index.html's drag-vs-click handling keys off `.sim`, same as house/car).

(function () {

// ---- inject this theme's stylesheet ---------------------------------------
if (!document.getElementById('station-theme-style')) {
  const style = document.createElement('style');
  style.id = 'station-theme-style';
  style.textContent = `
.station { pointer-events: auto; cursor: pointer; transition: opacity .8s ease-in; }
.station.gone { opacity: 0; }

/* ---- sims.css containment --------------------------------------------
   sims.css (always loaded, a static <link> in index.html's <head>, house-
   authored) is scoped under bare .sim -- and this root necessarily carries
   that class too (the host's drag-vs-click handling keys off .sim, same as
   car's root; see the file header). Every sims.css selector that happens to
   share a class name with this theme's own vocabulary leaks in, at
   whatever specificity house wrote it with. Names that don't overlap
   (.dress, .duvet, .belly, .tophat, .monocle, .can-body, ...) are naturally
   immune; the ones below DO share a name (.body, .arm-mount-l/-r, .leg-l/
   r, .arm-l/-r, .skull, .headg, .alert) and need an explicit, equal-or-
   higher-specificity, later-loaded rule to actually win the cascade.
   Confirmed live against the shipped car theme, which has this exact same
   exposure and doesn't fully guard against it (its own .alert inherits
   sims.css's pulse fade unopposed, verified directly) -- not a reason to
   leave it unguarded here too. */

/* .body's transform ATTRIBUTE is host-owned (the mirror flip, written every
   frame by updateSim()) -- sims.css's .sim.sitting .body / .sim.lying
   .body rules set a CSS transform (squash+shift) directly on .body that
   would otherwise permanently replace that attribute (a CSS property always
   outranks a presentation attribute) for as long as either class holds,
   silently killing the mirror for every seated or cocooned crew member.
   Reproducing JUST the mirror here (via --face, kept current every frame in
   updateActor) cancels the unwanted squash while leaving the attribute's
   actual job intact -- the real seated/cocooned look lives on .flight/
   .headg/.cocoon instead (below), never on .body itself. */
.station.sitting .body, .station.lying .body { transform: scale(var(--face, 1), 1); }

/* sims.css's walking marching-cycle (stepA/stepB/swingA/swingB on the legs
   and arms, bobWalk on .body itself) fights this theme's whole premise --
   a static zero-g glide, not a marching gait, see the walking rules further
   down -- and, on .body, the SAME mirror-attribute problem as sitting/lying
   above. Kill the animations outright so the static poses declared below
   (and the host's own attribute) show through undisturbed. */
.station.walking .leg-l, .station.walking .leg-r,
.station.walking .arm-l, .station.walking .arm-r,
.station.walking .body { animation: none; }

/* sims.css's "busy hands" fuss animation on working arms would undercut
   this theme's "prop micro-animations only" doctrine (the whole board
   stays still except the thing actually being worked on). */
.station.working:not(.walking) .arm-r,
.station.working:not(.walking) .arm-l { animation: none; }

/* sims.css sets a CSS transform directly on .arm-mount-l/-r for ITS OWN
   heft read; a CSS property permanently outranks the presentation
   attribute applyHeft() used to write to that same node, so an attribute-
   based nudge would never actually show. Gone CSS-only instead, driven by
   a --armx custom property applyHeft() keeps current: equal specificity,
   loads later, wins, no attribute/CSS fight left to have. */
.station .arm-mount-l { transform: translateX(calc(-1 * var(--armx, 4.5px))); }
.station .arm-mount-r { transform: translateX(var(--armx, 4.5px)); }

/* sims.css also grows .skull and nudges .headg down with heft (its own read
   of the same --heft custom property) -- this theme already reads heft
   through .figure's scale plus the puff/arm-mount geometry, so these would
   be pure duplicate, uncontrolled signal. Neutralized for one predictable
   source of heft truth; .sitting's own (more specific) .headg rule further
   down still applies normally on top of this. */
.station .skull { transform: none; }
.station .headg { transform: none; }

/* sims.css's .sim.blocked .alert{animation:pulse ...} fades the WHOLE alert
   group's own opacity on an unsynchronized 1.6s cycle, layered under the
   host's opacity attribute and over this theme's own 0.8s strobe --
   undermining "blocked is the only thing that blinks" with a second,
   uncoordinated blink source. */
.station.blocked .alert { animation: none; }

/* ---- colour: --c/--hair carry the session hue, desaturating with heft
   (applyHeft below uses house's exact formula) -------------------------- */
.station .torso { fill: var(--c); }
.station .puff  { fill: var(--c); filter: brightness(.9); }
.station .arm   { fill: var(--c); filter: brightness(.88); }
.station .leg   { fill: #333846; }
.station .boot  { fill: #20242e; }
.station .head  { fill: #e8c9a8; }
.station .hair  { fill: var(--hair); }
.station .eye   { fill: #2a2333; }
.station .eye-shut { stroke: #2a2333; stroke-width: 1.1; stroke-linecap: round; display: none; }
.station.stale .eye { display: none; }
.station.stale .eye-shut { display: block; }
.station .headset-band { fill: none; stroke: #3a3f4d; stroke-width: 1.4; }
.station .headset-mic { fill: #3a3f4d; }
.station .zipper { fill: none; stroke: #d9dde6; stroke-width: .9; }
.station .patch { fill: #d5484a; }

/* ---- tier: --tierscale combines with heft in ONE scale on .figure ------ */
.station .figure {
  transform-origin: 0px 18px;
  transform: scale(calc(var(--tierscale, 1) * (1 + .12 * var(--heft, 0))));
  animation: station-float 5s ease-in-out infinite;
}
@keyframes station-float { 50% { translate: 0 -1.5px; } }
.station.walking .figure, .station.lying .figure { animation-play-state: paused; }

.station.tier-haiku  { --tierscale: .88; }
.station.tier-sonnet { --tierscale: 1; }
.station.tier-opus   { --tierscale: 1.12; }
.station.tier-fable  { --tierscale: 1.06; }

.station .tiergear > * { display: none; }
.station.tier-haiku .cap { display: block; }
.station.tier-opus .hut { display: block; }
.station.tier-fable .command { display: block; }
.station.eva .tiergear { display: none; }
.station .cap-band, .station .hut-plate { fill: #cfd3da; }
.station .hut-boss { fill: #9aa2b2; }
.station .antenna-mast { fill: #8b8f99; }
.station .antenna-tip { fill: #ffe9a3; }
.station .command-bubble { fill: rgba(255,201,74,.28); }
.station .gold-visor { fill: #d4a017; }
.station .gold-glint { stroke: #fff8e0; stroke-width: 1.1; fill: none; opacity: .6; }
.station .epaulette { fill: #ffc94a; }
.station .sparkle { fill: #ffe9a3; opacity: 0; animation: station-twinkle 1.8s ease-in-out infinite;
  transform-box: fill-box; transform-origin: 50% 50%; }
.station .sparkle:nth-of-type(2) { animation-delay: .6s; }
.station .sparkle:nth-of-type(3) { animation-delay: 1.2s; }
@keyframes station-twinkle { 0%,100% { opacity: 0; transform: scale(.4); } 50% { opacity: 1; transform: scale(1); } }

/* ---- heft gear: hard on/off bands, same doctrine as house's grime -------- */
.station .gear > * { display: none; }
.station[data-heft="1"] .gear-pouch, .station[data-heft="2"] .gear-pouch,
.station[data-heft="3"] .gear-pouch, .station[data-heft="4"] .gear-pouch { display: block; }
.station[data-heft="2"] .gear-belt, .station[data-heft="3"] .gear-belt,
.station[data-heft="4"] .gear-belt { display: block; }
.station[data-heft="3"] .gear-caddy, .station[data-heft="4"] .gear-caddy { display: block; }
.station[data-heft="4"] .gear-tank { display: block; }
.station.eva .gear { display: none; }
.station .gear-pouch { fill: #6a6474; }
.station .gear-belt { fill: #3a3f4d; }
.station .gear-caddy, .station .gear-caddy-tick { fill: #565e70; }
.station .gear-tank { fill: #aab2c4; }
.station .gear-tank-cap { fill: #6a6474; }

/* ---- interior flight suit vs. EVA hardshell: mutually exclusive -------- */
.station .flight { display: block; }
.station.eva .flight { display: none; }
/* headg paints as .body's LAST child now (see buildActor's comment on why --
   the cocoon needs to cover the torso while the head still "pokes out"), so
   it is no longer a descendant of .flight and hiding .flight alone would
   leave the bare head floating over the EVA helmet. Hide it explicitly. */
.station.eva .headg { display: none; }
.station .evasuit { display: none; }
.station.eva .evasuit { display: block; }
.station .eva-torso { fill: #e8eaf0; }
.station .eva-legs { fill: #dfe2ea; }
.station .eva-helm { fill: #f2f4f8; }
.station .eva-visor { fill: #1a2233; }
.station .visor-glint { stroke: #fff; stroke-width: 1.3; fill: none; opacity: .5; }
.station .eva-pack { fill: #c9cdd8; }
.station .id-stripe { fill: var(--c); }
.station .jet { fill: #cfe6ff; opacity: 0; }
.station.eva .jet { animation: station-jet 1.1s ease-out infinite; }
.station .jet:nth-of-type(2) { animation-delay: .55s; }
@keyframes station-jet {
  0%   { transform: translate(0,0) scale(1); opacity: 0; }
  15%  { opacity: .8; }
  100% { transform: translate(-4px,0) scale(1.6); opacity: 0; }
}
.station .patch-antenna { fill: none; stroke: #cfd3da; stroke-width: 1; }
.station .patch-dish { fill: #cfd3da; }

/* ---- stale: cocooned in a wall berth, dim, drifting zzz ---------------- */
.station .cocoon { display: none; transform-origin: 0px -26px; }
.station.lying .cocoon {
  display: block;
  animation: station-zip .6s ease both, station-breathe 4s ease-in-out infinite .6s;
}
.station .bag { fill: #4a4260; }
.station .strap { fill: #37304a; }
@keyframes station-zip { from { transform: scaleY(.15); opacity: 0; } }
@keyframes station-breathe { 50% { transform: scale(1.02); } }
.station.lying .leg-l, .station.lying .leg-r { display: none; }

.station.stale .figure { filter: brightness(.72) saturate(.55); }

.station .zzz { display: none; }
.station.stale .zzz { display: block; animation: station-drift 2.6s ease-out infinite; }
@keyframes station-drift {
  0%   { transform: translate(0,0) scale(.7); opacity: 0; }
  30%  { opacity: .75; }
  100% { transform: translate(7px,-16px) scale(1.1); opacity: 0; }
}

/* ---- idle: steady green status lamp, never blinking -------------------- */
.station .statuslamp { display: none; }
.station.idle .statuslamp { display: block; }
.station .lamp-core { fill: #9fe8b0; }
.station .lamp-glow { fill: #9fe8b0; opacity: .25; }
.station .pouchdrink { display: none; }
.station.idle.sitting .pouchdrink { display: block; }
.station .drink-pouch { fill: #c9cdd8; }
.station .straw { stroke: #c9cdd8; stroke-width: .8; }

/* ---- poses ---------------------------------------------------------------
   .sitting (galley) mirrors house's cross-legged float; .lying shows the
   cocoon instead (handled above). Neither touches .body -- house's own
   comment on why applies unchanged: .body's transform ATTRIBUTE is
   host-owned every frame (the mirror flip), so any theme pose lives on
   .figure's child nodes, never .body itself. ------------------------- */
.station.sitting .flight { transform: translateY(5px) scale(.95); }
.station.sitting .leg-l, .station.sitting .leg-r { transform: rotate(78deg) translateY(2px); }
.station.lying .flight { transform: none; }
/* headg is .body's own last child now (not .flight's -- see buildActor's
   paint-order comment), so it needs the same translateY the seated torso
   gets or the head visually detaches from it by the same 5px. */
.station.sitting .headg { transform: translateY(5px); }

/* ---- walking: a static glide pose, NOT a marching cycle -- the zero-g
   stillness is the whole point (see the theme spec's mood target); motion
   comes from the host stepping the sprite, not from an animated gait. ---- */
.station.walking .flight { transform: rotate(6deg); transform-origin: 0px 6px; }
.station.walking .leg-l, .station.walking .leg-r { transform: rotate(14deg); }
.station.walking .arm-r { transform: rotate(-42deg); }

/* ---- working: prop micro-animations only -- no arm fuss, the whole board
   stays deliberately still except the thing being worked on. ------------- */
.station .propslot { display: none; }
.station.working:not(.walking) .propslot { display: block; }
.station .prop-hexbolt-wrap { animation: station-spin 3s linear infinite; transform-origin: 12px -3px; }
@keyframes station-spin { to { transform: rotate(360deg); } }
.station .prop-droplet { fill: #8fe0d8; animation: station-rise 1.3s ease-out infinite; }
.station .prop-droplet:nth-of-type(2) { animation-delay: .32s; }
.station .prop-droplet:nth-of-type(3) { animation-delay: .64s; }
@keyframes station-rise { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: .9; } 100% { transform: translateY(-9px); opacity: 0; } }
.station .prop-slate-hi { animation: station-scan 2.2s linear infinite; }
@keyframes station-scan { 0% { transform: translateY(-4px); opacity: 0; } 15% { opacity: .8; } 100% { transform: translateY(4px); opacity: 0; } }
.station .prop-cubesat { animation: station-bob 3.5s ease-in-out infinite; }
@keyframes station-bob { 50% { transform: translateY(-1.5px); } }
.station .prop-pen { animation: station-pen-bob 4s ease-in-out infinite; }
@keyframes station-pen-bob { 50% { transform: translateY(-4px); } }

/* ---- distress beacon: the ONLY thing on the board that blinks ----------
   Base visibility (opacity 0/1) is the HOST's job -- it writes the opacity
   attribute on .alert directly every frame (updateSim() in index.html),
   exactly like house's halo and car's hazard lamps. A CSS opacity rule here
   would permanently outrank that attribute -- leave .alert itself alone and
   let .halo/.flare animate WITHIN whatever visibility the host sets. .alert
   lives nested inside .body (mirrors with the figure, so the streamer's
   backpack-side offset stays correct whichever way the crew member faces)
   and is appended LAST so its translucent halo washes over the whole
   figure, car-precedent.
   .halo itself has no color/timing declared here -- sims.css's
   .sim.blocked .halo owns both for every theme, so this reads identically
   to car/brigade/hive's halo. .flare is this theme's own flourish (the
   mast-tip strobe), so it keeps its own color but references that SAME
   shared alert-blink keyframe for perfect sync with .halo. -------------- */
.station .flare { fill: #ff5340; animation: alert-blink .8s steps(1,end) infinite; }
.station .mast { fill: #cfd3da; }
.station .streamer { fill: #ff7a30; }
.station .streamer-mark { fill: #fff; }
.station .flarering { display: none; fill: none; stroke: #ffb300; stroke-width: 3; }

/* ---- name tag / selection / farewell (copied house/car idiom, own scope) */
.station .tag {
  font: 600 10px ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
  fill: #fff; stroke: rgba(0,0,0,.75); stroke-width: 3px;
  paint-order: stroke; stroke-linejoin: round;
}
.station .tag .room { fill: #cfc3da; }
.station .sel { display: none; }
.station.selected .sel { display: block; stroke: #fff; stroke-width: 2; stroke-dasharray: 4 3; fill: none; }

.station .bubble { display: none; }
.station.bye .bubble { display: block; animation: station-pop .3s cubic-bezier(.2,1.6,.4,1) both; }
.station .bub-body, .station .bub-tail { fill: #f3ecf7; }
.station .bub-text { font: 700 9px ui-rounded, "SF Pro Rounded", system-ui, sans-serif; fill: #241f2b; }
@keyframes station-pop { 0% { opacity: 0; transform: translateY(4px) scale(.7); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
.station.bye .arm-r { animation: station-wave .42s ease-in-out infinite; }
@keyframes station-wave { 0%,100% { transform: rotate(-150deg); } 50% { transform: rotate(-124deg); } }

.station .arm-l, .station .arm-r { transform-origin: 0px -8px; }
.station .leg-l, .station .leg-r { transform-origin: 0px 6px; }

/* ---- reduced motion: same two-shape fix as the car theme's hazard system
   (copied verbatim, adapted class names) -- continuous animations just stop
   moving; the ONE stepped animation this theme declares itself (.flare)
   gets a hard animation:none instead of a near-zero duration (a near-zero
   steps() strobes faster, the opposite of the intent), falling back to a
   static lit flare + a static high-contrast ring. .halo's own reduced-motion
   fallback is sims.css's shared rule, not declared again here. The streamer
   was always static, so blocked degrades to lit-flare + ring + streamer,
   never to nothing. ------------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .station *, .station { animation-duration: .001ms !important; }
  .station .flare { animation: none !important; opacity: 1 !important; }
  .station .flarering { display: inline; }
}
`;
  document.head.appendChild(style);
}

// ---- palette ----------------------------------------------------------------
const SPACE = '#070a12', STAR = '#cdd6e8',
      EARTH_CORE = '#3a7bd5', EARTH_RIM = '#9fd0ff',
      HULL = '#8a93a6', HULL_DK = '#565e70', FLOOR = '#262b38',
      LAB_WASH = 'rgba(110,200,190,.06)', OPS_WASH = 'rgba(230,190,120,.05)',
      QTR_WASH = 'rgba(170,140,190,.06)', AIR_WASH = 'rgba(160,170,190,.05)',
      CUP_WASH = 'rgba(90,140,220,.08)',
      PANEL = '#24406b', PANEL_LINE = '#3a5f96',
      BEACON = '#ff5340', LAMP = '#9fe8b0';

// ---- activity props (working + settled only, same gate as house) ---------
function mkProp(mk) { const g = el('g', { class: 'prop on' }); mk(g); return g; }
const PROPS = {
  exec: () => mkProp(g => {
    const tool = el('g', { transform: 'translate(12,-3)' });
    tool.appendChild(el('rect', { x: -2, y: -2, width: 9, height: 4, rx: 1.2, fill: '#c7c9d1' }));
    tool.appendChild(el('rect', { x: 7, y: -1.4, width: 3.5, height: 2.8, rx: .6, fill: '#8b8f99' }));
    const wrap = el('g', { class: 'prop-hexbolt-wrap' });
    for (let i = 0; i < 3; i++) {
      const a = i * (Math.PI * 2 / 3);
      wrap.appendChild(el('circle', { cx: 12 + Math.cos(a) * 7, cy: -3 + Math.sin(a) * 7, r: 1.1, fill: '#ffc94a' }));
    }
    tool.appendChild(wrap);
    g.appendChild(tool);
  }),
  edit: () => mkProp(g => {
    const p = el('g', { transform: 'translate(12,-4)' });
    p.appendChild(el('rect', { x: -1.4, y: -5, width: 2.8, height: 8, rx: 1.2, fill: '#cfd3da' }));
    p.appendChild(el('ellipse', { cx: 0, cy: 4, rx: 2.4, ry: 1.6, fill: '#8fe0d8' }));
    for (let i = 0; i < 3; i++) p.appendChild(el('circle', { class: 'prop-droplet', cx: -1 + i, cy: 6, r: 1 }));
    g.appendChild(p);
  }),
  read: () => mkProp(g => {
    const p = el('g', { transform: 'translate(12,-2)' });
    p.appendChild(el('rect', { x: -6.5, y: -5, width: 13, height: 10, rx: 1.2, fill: '#232838' }));
    p.appendChild(el('rect', { class: 'prop-slate-hi', x: -5, y: -3.5, width: 10, height: 1, fill: 'rgba(150,220,255,.7)' }));
    g.appendChild(p);
  }),
  delegate: () => mkProp(g => {
    g.appendChild(el('path', { d: 'M2 -6 Q9 -10 16 -14', fill: 'none', stroke: '#8b8f99', 'stroke-width': .8 }));
    const sat = el('g', { class: 'prop-cubesat', transform: 'translate(16,-14)' });
    sat.appendChild(el('rect', { x: -2, y: -2, width: 4, height: 4, fill: '#cfd3da' }));
    sat.appendChild(el('rect', { x: -7, y: -1, width: 5, height: 2, fill: '#24406b' }));
    sat.appendChild(el('rect', { x: 2, y: -1, width: 5, height: 2, fill: '#24406b' }));
    g.appendChild(sat);
  }),
  plan: () => mkProp(g => {
    const p = el('g', { transform: 'translate(12,-3)' });
    p.appendChild(el('rect', { x: -5, y: -6, width: 10, height: 12, rx: 1, fill: '#cfc3da' }));
    p.appendChild(el('rect', { x: -3.6, y: -4, width: 7.2, height: 1, fill: '#565e70' }));
    p.appendChild(el('rect', { x: -3.6, y: -1.6, width: 7.2, height: 1, fill: '#565e70' }));
    p.appendChild(el('rect', { x: -3.6, y: .8, width: 4.5, height: 1, fill: '#565e70' }));
    const pen = el('g', { class: 'prop-pen' });
    pen.appendChild(el('path', { d: 'M6 -4 q3 1 2 4', fill: 'none', stroke: '#8b8f99', 'stroke-width': .7 }));
    pen.appendChild(el('rect', { x: 7, y: -1, width: 1.6, height: 6, rx: .6, fill: '#ffc94a', transform: 'rotate(20 7 -1)' }));
    p.appendChild(pen);
    g.appendChild(p);
  }),
};

// ---- the crew member --------------------------------------------------------
function buildActor(s) {
  const g = el('g', { class: 'station sim', 'data-id': s.id });
  g.style.setProperty('--c', `hsl(${hue(s)} 62% 63%)`);
  g.style.setProperty('--hair', `hsl(${hue(s)} 40% 28%)`);

  const figure = el('g', { class: 'figure' });
  // Per-actor ambient-drift phase, so the zero-g bob desyncs across the crew
  // (house/car precedent: a shared clock with no offset reads as one puppet
  // wearing forty bodies).
  figure.style.animationDelay = -(hash(s.id) % 5000) + 'ms';

  const body = el('g', { class: 'body' });

  // ---- interior flight-suit look (default visible; hidden on .eva) -------
  const flight = el('g', { class: 'flight' });

  const legs = el('g', { class: 'legs' });
  for (const side of ['l', 'r']) {
    const mount = el('g', { transform: `translate(${side === 'l' ? -4.5 : 4.5},0)` });
    const lg = el('g', { class: `leg-${side}` });
    lg.appendChild(el('rect', { class: 'leg', x: -2.2, y: 6, width: 4.4, height: 12, rx: 2 }));
    lg.appendChild(el('rect', { class: 'boot', x: -2.6, y: 16, width: 5.2, height: 3.6, rx: 1.4 }));
    mount.appendChild(lg);
    legs.appendChild(mount);
  }
  flight.appendChild(legs);

  flight.appendChild(el('rect', { class: 'torso', x: -9, y: -8, width: 18, height: 17, rx: 5 }));
  flight.appendChild(el('ellipse', { class: 'puff', cx: 0, cy: 3, rx: 8, ry: 5.5 }));
  flight.appendChild(el('path', { class: 'zipper', d: 'M0 -8 L0 6' }));
  flight.appendChild(el('rect', { class: 'patch', x: -7.5, y: -6, width: 3, height: 3, rx: .6 }));

  for (const side of ['l', 'r']) {
    const mount = el('g', { class: `arm-mount-${side}`, transform: `translate(${side === 'l' ? -4.5 : 4.5},0)` });
    const ag = el('g', { class: `arm-${side}` });
    ag.appendChild(el('rect', { class: 'arm', x: -1.9, y: -8, width: 3.8, height: 14, rx: 1.9 }));
    mount.appendChild(ag);
    flight.appendChild(mount);
  }

  const headg = el('g', { class: 'headg' });
  const skull = el('g', { class: 'skull' });
  skull.appendChild(el('circle', { class: 'head', cx: 0, cy: -17, r: 8.6 }));
  skull.appendChild(el('path', { class: 'hair', d: 'M-8.6 -19 a8.6 8.6 0 0 1 17.2 0 a10 10 0 0 0 -17.2 0 Z' }));
  skull.appendChild(el('circle', { class: 'eye', cx: -3, cy: -17, r: 1.05 }));
  skull.appendChild(el('circle', { class: 'eye', cx: 3, cy: -17, r: 1.05 }));
  skull.appendChild(el('line', { class: 'eye-shut', x1: -4.2, y1: -17, x2: -1.8, y2: -17 }));
  skull.appendChild(el('line', { class: 'eye-shut', x1: 1.8, y1: -17, x2: 4.2, y2: -17 }));
  const headset = el('g', { class: 'headset' });
  headset.appendChild(el('path', { class: 'headset-band', d: 'M-7 -21 A7 7 0 0 1 7 -21' }));
  headset.appendChild(el('circle', { class: 'headset-mic', cx: 6.5, cy: -14, r: .9 }));
  skull.appendChild(headset);
  headg.appendChild(skull);
  flight.appendChild(headg);

  body.appendChild(flight);

  // ---- EVA hardshell (hidden by default; shown on .eva) -------------------
  const evasuit = el('g', { class: 'evasuit' });
  evasuit.appendChild(el('rect', { class: 'eva-pack', x: -13, y: -12, width: 5, height: 16, rx: 2 }));
  evasuit.appendChild(el('rect', { class: 'eva-torso', x: -11, y: -10, width: 22, height: 20, rx: 7 }));
  evasuit.appendChild(el('rect', { class: 'eva-legs', x: -8, y: 8, width: 16, height: 11, rx: 4 }));
  evasuit.appendChild(el('rect', { class: 'id-stripe', x: -7.5, y: -9, width: 15, height: 1.8 }));
  evasuit.appendChild(el('rect', { class: 'id-stripe', x: -8, y: 11, width: 16, height: 1.8 }));
  evasuit.appendChild(el('circle', { class: 'eva-helm', cx: 0, cy: -17, r: 10.5 }));
  evasuit.appendChild(el('circle', { class: 'eva-visor', cx: 0, cy: -17, r: 7.6 }));
  evasuit.appendChild(el('path', { class: 'visor-glint', d: 'M-5 -21 A6 6 0 0 1 1 -24.5' }));
  const antenna = el('g', { class: 'patch-antenna', transform: 'translate(9,-19)' });
  antenna.appendChild(el('path', { class: 'patch-dish', d: 'M-3 0 A3 2.4 0 0 1 3 0 L1.6 0 A1.6 1.2 0 0 0 -1.6 0 Z' }));
  antenna.appendChild(el('path', { d: 'M-3 2.4 A3 2.4 0 0 1 3 2.4' }));
  antenna.appendChild(el('path', { d: 'M-4.4 4.2 A4.4 3.5 0 0 1 4.4 4.2' }));
  evasuit.appendChild(antenna);
  const jets = el('g', { class: 'jets' });
  jets.appendChild(el('circle', { class: 'jet', cx: -14, cy: 4, r: 1.6 }));
  jets.appendChild(el('circle', { class: 'jet', cx: -14, cy: 10, r: 1.6 }));
  evasuit.appendChild(jets);
  body.appendChild(evasuit);

  // ---- sleep cocoon (hidden by default; shown on .lying) -------------------
  const cocoon = el('g', { class: 'cocoon' });
  cocoon.appendChild(el('rect', { class: 'bag', x: -8, y: -26, width: 16, height: 40, rx: 8 }));
  cocoon.appendChild(el('rect', { class: 'strap', x: -7, y: -7, width: 14, height: 1.6, rx: .8 }));
  cocoon.appendChild(el('rect', { class: 'strap', x: -7, y: 3, width: 14, height: 1.6, rx: .8 }));
  body.appendChild(cocoon);

  // ---- heft gear (band-snapped) --------------------------------------------
  const gear = el('g', { class: 'gear' });
  gear.appendChild(el('rect', { class: 'gear-pouch', x: 3, y: 8, width: 5, height: 6, rx: 1.2 }));
  gear.appendChild(el('rect', { class: 'gear-belt', x: -9, y: 5, width: 18, height: 2.6, rx: 1 }));
  const caddy = el('g', { class: 'gear-caddy' });
  caddy.appendChild(el('rect', { x: -4, y: -4, width: 8, height: 5, rx: 1 }));
  caddy.appendChild(el('rect', { class: 'gear-caddy-tick', x: -1, y: -6, width: 2, height: 3, rx: .5 }));
  gear.appendChild(caddy);
  gear.appendChild(el('rect', { class: 'gear-tank', x: 8, y: -10, width: 4.5, height: 13, rx: 2.2 }));
  gear.appendChild(el('rect', { class: 'gear-tank-cap', x: 8.6, y: -11.6, width: 3.3, height: 2, rx: .8 }));
  body.appendChild(gear);

  // ---- tier gear (haiku cap / opus HUT / fable command helmet) -------------
  const tiergear = el('g', { class: 'tiergear' });
  const cap = el('g', { class: 'cap' });
  cap.appendChild(el('path', { class: 'cap-band', d: 'M-8.2 -19.5 a8.2 8.6 0 0 1 16.4 0 Z' }));
  cap.appendChild(el('rect', { class: 'antenna-mast', x: -.5, y: -28, width: 1, height: 4, rx: .4 }));
  cap.appendChild(el('circle', { class: 'antenna-tip', cx: 0, cy: -28, r: 1.2 }));
  tiergear.appendChild(cap);
  const hut = el('g', { class: 'hut' });
  hut.appendChild(el('rect', { class: 'hut-plate', x: -11.5, y: -9, width: 23, height: 9, rx: 3 }));
  hut.appendChild(el('circle', { class: 'hut-boss', cx: -10, cy: -8, r: 2.6 }));
  hut.appendChild(el('circle', { class: 'hut-boss', cx: 10, cy: -8, r: 2.6 }));
  tiergear.appendChild(hut);
  const command = el('g', { class: 'command' });
  command.appendChild(el('circle', { class: 'command-bubble', cx: 0, cy: -17, r: 10.8 }));
  command.appendChild(el('circle', { class: 'gold-visor', cx: 0, cy: -17, r: 7.6 }));
  command.appendChild(el('path', { class: 'gold-glint', d: 'M-5 -21 A6 6 0 0 1 1 -24.5' }));
  command.appendChild(el('rect', { class: 'epaulette', x: -12, y: -9, width: 5, height: 3, rx: 1 }));
  command.appendChild(el('rect', { class: 'epaulette', x: 7, y: -9, width: 5, height: 3, rx: 1 }));
  for (const [sx, sy] of [[-11, -22], [10, -10], [-9, 2]]) {
    command.appendChild(el('path', { class: 'sparkle',
      d: `M${sx} ${sy - 2.6} L${sx + .9} ${sy} L${sx} ${sy + 2.6} L${sx - .9} ${sy} Z` }));
  }
  tiergear.appendChild(command);
  body.appendChild(tiergear);

  const lamp = el('g', { class: 'statuslamp' });
  lamp.appendChild(el('circle', { class: 'lamp-glow', cx: 0, cy: -2, r: 4 }));
  lamp.appendChild(el('circle', { class: 'lamp-core', cx: 0, cy: -2, r: 1.8 }));
  body.appendChild(lamp);

  const drink = el('g', { class: 'pouchdrink' });
  drink.appendChild(el('rect', { class: 'drink-pouch', x: 8, y: -4, width: 4, height: 6, rx: 1 }));
  drink.appendChild(el('line', { class: 'straw', x1: 11, y1: -4, x2: 11, y2: -8 }));
  body.appendChild(drink);

  // headg is appended LAST within .flight already, but tiergear/cocoon/alert
  // below still need to paint over the body -- head stays visually "on top"
  // because .flight itself is the FIRST child of .body, so every later
  // sibling here (cocoon, gear, tiergear, alert) paints over its torso/legs,
  // while headg's own position at the end of .flight's subtree keeps it the
  // topmost thing WITHIN that first-painted group. This is what lets the
  // cocoon's bag (painted after .flight as a whole) cover the torso while
  // the head still "pokes out the top": .headg is re-appended here, after
  // .cocoon, so it is unambiguously the topmost paint of all -- otherwise a
  // bag whose rounded top (rx8 stadium cap) geometrically reaches nearly to
  // the head's own crown would swallow it whole. See the ground-rule note on
  // draw order (a shape drawn before a later full-footprint fill gets
  // silently painted over) -- this is that exact trap, avoided by moving the
  // head to genuinely paint last rather than trusting the spec's ASCII tree
  // nesting as a paint-order guarantee.
  body.appendChild(headg);

  figure.appendChild(body);

  const prop = el('g', { class: 'propslot' });
  figure.appendChild(prop);

  // ---- distress beacon: last child of .body so its translucent halo washes
  // over the whole figure (car precedent) and it mirrors with .body's own
  // host-driven flip, keeping the streamer on the backpack side regardless
  // of facing. -------------------------------------------------------------
  const alert = el('g', { class: 'alert' });
  alert.appendChild(el('ellipse', { class: 'halo', cx: 0, cy: -6, rx: 30, ry: 36 }));
  alert.appendChild(el('rect', { class: 'flarering', x: -24, y: -40, width: 48, height: 62, rx: 14 }));
  const mast = el('g', { class: 'mast' });
  mast.appendChild(el('rect', { x: -.6, y: -36, width: 1.2, height: 9, rx: .5 }));
  alert.appendChild(mast);
  alert.appendChild(el('circle', { class: 'flare', cx: 0, cy: -38, r: 3 }));
  const streamer = el('g', { class: 'streamer', transform: 'translate(-12,-4)' });
  streamer.appendChild(el('path', { d: 'M0 0 L14 -3 L14 5 Z' }));
  streamer.appendChild(el('path', { class: 'streamer-mark', d: 'M2 -1 L7 0 L2 1 Z' }));
  alert.appendChild(streamer);
  body.appendChild(alert);

  g.appendChild(figure);

  const z = el('text', { class: 'zzz', x: 13, y: -26, fill: 'rgba(255,255,255,.5)',
    'font-size': 11, 'font-weight': 700 });
  z.textContent = 'z';
  g.appendChild(z);

  const bub = el('g', { class: 'bubble' });
  bub.appendChild(el('path', { class: 'bub-tail', d: 'M6 -30 L13 -25 L14 -33 Z' }));
  bub.appendChild(el('rect', { class: 'bub-body', x: 5, y: -48, width: 34, height: 17, rx: 6 }));
  const bt = el('text', { class: 'bub-text', x: 22, y: -39.2, 'text-anchor': 'middle' });
  bt.textContent = (typeof THEME !== 'undefined' && THEME.farewell && THEME.farewell.text) || 'o7';
  bub.appendChild(bt);
  g.appendChild(bub);

  g.appendChild(el('circle', { class: 'sel', cx: 0, cy: -4, r: 30 }));

  const tag = el('text', { class: 'tag', x: 0, y: 31, 'text-anchor': 'middle' });
  const nm = el('tspan'); nm.textContent = s.name || '?';
  const rm = el('tspan', { class: 'room' });
  tag.appendChild(nm); tag.appendChild(rm);
  g.appendChild(tag);

  g.addEventListener('click', ev => { ev.stopPropagation(); window.selectSim(s.id); });
  return g;
}

// House's exact heft formula (spec: "copy house's applyHeft skeleton
// including the 0.005 change threshold and the exact --c/--hair
// desaturation formulas"). Puff/arm-mount geometry is this theme's own read.
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
    const n = g.querySelector(sel); if (!n) return;
    for (const k in attrs) n.setAttribute(k, attrs[k]);
  };
  set('.puff', { rx: 8 + 5 * h, ry: 5.5 + 3 * h, cy: 3 + 1.5 * h });
  // Arm-mount heft nudge: driven entirely through a --armx custom property
  // read by this file's own CSS (see the "sims.css containment" block up
  // top) rather than an attribute -- sims.css independently sets a CSS
  // `transform` on `.arm-mount-l`/`-r` too (its own, unrelated heft read),
  // and a CSS property permanently outranks a presentation attribute on the
  // same node, so an attribute-based nudge here would simply never show.
  // Going CSS-only on our side removes the attribute/CSS fight entirely:
  // our rule and sims.css's are equal specificity, ours loads later, ours
  // wins, done.
  g.style.setProperty('--armx', (4.5 + 1.5 * h).toFixed(2) + 'px');
}

function updateActor(g, sp, s) {
  // ---- EVA off-ramp completion --------------------------------------------
  // The host's built-in loop off-ramp (index.html's frame(): the
  // `sp.onLoop && sp.loopExit` branch) only peels a sprite off its loop once
  // it passes within 40 world-px of `THEME.regions[THEME.hub].anchor` -- a
  // mechanism built for the car theme, where `hub` IS the loop's own region
  // (car declares hub:"track", and the "lap" place's region is also
  // "track"), so that anchor genuinely sits ON the ring. This theme
  // deliberately declares no `hub` at all (see theme.json's header: BFS is
  // what correctly produces the module->node->airlock->hatch multi-hop
  // route a single hub-detour can't express), so `THEME.regions[undefined]`
  // is undefined and that check can never fire -- left alone, a drifter
  // whose session stops doing `net` work would circle the hull forever,
  // stuck in the hardshell. `setGoal`/`route` are plain top-level `function`
  // declarations in index.html's inline script, so (like `sessions`/
  // `sprites`/`THEME`) they're live globals this file shares scope with --
  // completing the very same hand-off the host's dead branch would have,
  // from the live ring position `loopTrack()` already wrote this frame, the
  // instant the destination is known rather than waiting for a ring
  // position this loop's region was never given (there is no "pit lane"
  // here -- just a hatch a BFS walk reaches fine from wherever the drifter
  // currently is).
  if (sp.onLoop && sp.loopExit) {
    sp.onLoop = false;
    sp.loopMeta = null;
    const dest = sp.loopExit;
    sp.loopExit = null;
    setGoal(sp, dest.pt, dest.room);
  }

  applyHeft(g, sp, s);

  // Kept current every frame for the "sims.css containment" CSS block's
  // --face-driven .body override (sitting/lying) to reproduce exactly what
  // the host's own attribute-set mirror would have shown.
  g.style.setProperty('--face', sp.face || 1);

  const cls = g.classList;
  cls.toggle('eva', !!sp.onLoop);

  const t = s.tier || 'plain';
  if (sp.tier !== t) {
    sp.tier = t;
    for (const x of ['plain', 'haiku', 'sonnet', 'opus', 'fable']) cls.toggle('tier-' + x, x === t);
  }

  const want = (s.state === 'working' && !sp.moving && !sp.onLoop && PROPS[ThemeEngine.activityOf(s)])
    ? ThemeEngine.activityOf(s) : null;
  if (sp.prop !== want) {
    sp.prop = want;
    const slot = g.querySelector('.propslot');
    slot.textContent = '';
    if (want) slot.appendChild(PROPS[want]());
  }

  // Distress phase-lock (car's hazSynced pattern, verbatim): every beacon
  // that goes blocked in the same instant shares one 0.8s strobe clock
  // rather than blinking out of phase with each other.
  if (s.state === 'blocked' && !sp.hazSynced) {
    sp.hazSynced = true;
    const delay = -(performance.now() % 800) + 'ms';
    for (const sel of ['.halo', '.flare']) {
      for (const n of g.querySelectorAll(sel)) n.style.animationDelay = delay;
    }
  } else if (s.state !== 'blocked') {
    sp.hazSynced = false;
  }
}

// ---- station (canvas) -------------------------------------------------------
// World-space helpers assume proj()/isoFlat()/poly()/fxArc()/shade() are
// already in scope (host-provided; see the contract note at the top of
// themes/house/render.js). rrw() reproduces house's rr() wrapper: rr() draws
// in raw canvas pixels and never calls proj(), so every rounded shape below
// projects its own corner and scales w/h/r by cam.zoom before handing off.
function rrw(c, x, y, w, h, r, fill) {
  const [sx, sy] = proj(x, y);
  rr(c, sx, sy, w * cam.zoom, h * cam.zoom, r * cam.zoom, fill);
}

// ---- world geometry (kept local to the art, same doctrine as house's own
// HOUSE/DIV_Y consts -- this doesn't need to be pixel-locked to theme.json's
// routing rects, it just happens to have been measured against them). ------
const MODULES = {
  lab:      { l: 170, r: 500, t: 150, b: 300, wash: LAB_WASH },
  ops:      { l: 500, r: 830, t: 150, b: 300, wash: OPS_WASH },
  node:     { l: 170, r: 830, t: 300, b: 420, wash: null },
  quarters: { l: 170, r: 450, t: 420, b: 560, wash: QTR_WASH },
  cupola:   { l: 450, r: 640, t: 420, b: 560, wash: CUP_WASH },
  airlock:  { l: 640, r: 830, t: 420, b: 560, wash: AIR_WASH },
};
const PORTAL = {
  lab: 340, ops: 660, quarters: 310, cupola: 545, airlock: 735,
};
const HATCH = { x: 735, y: 560 };
const RING = { x: 126, y: 106, w: 748, h: 498, r: 80 };
const RAIL = { x: 134, y: 114, w: 732, h: 482, r: 72 }; // decorative handrail, inset from the true flight line

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let _stars = null;
function stars() {
  if (_stars) return _stars;
  const rnd = mulberry32(7);
  _stars = Array.from({ length: 90 }, () => ({
    x: rnd() * 1000, y: rnd() * 760, r: 0.5 + rnd() * 1.1,
  }));
  return _stars;
}

// Horizontal wall band, x0..x1 at height y, with 44-world-px gaps centred on
// each portal x in `gaps`.
function wallH(c, y, x0, x1, gaps, thick) {
  const half = 22;
  const cuts = gaps.slice().sort((a, b) => a - b);
  let x = x0;
  for (const gx of cuts) {
    if (gx - half > x) isoFlat(c, x, y - thick / 2, gx - half - x, thick, HULL_DK);
    x = gx + half;
  }
  if (x1 > x) isoFlat(c, x, y - thick / 2, x1 - x, thick, HULL_DK);
}
function wallV(c, x, y0, y1, thick) {
  isoFlat(c, x - thick / 2, y0, thick, y1 - y0, HULL_DK);
}

function drawVoid(c) {
  c.fillStyle = SPACE; c.fillRect(0, 0, W, H);
  for (const st of stars()) {
    const [px, py] = proj(st.x, st.y);
    c.beginPath(); c.arc(px, py, Math.max(.4, st.r * cam.zoom), 0, Math.PI * 2);
    c.fillStyle = STAR; c.fill();
  }
}

function drawEarthLimb(c) {
  const [ex, ey] = proj(500, 1610);
  const R = 900 * cam.zoom;
  c.beginPath(); c.arc(ex, ey, R, 0, Math.PI * 2);
  c.fillStyle = 'rgba(58,123,213,.14)'; c.fill();
  c.beginPath(); c.arc(ex, ey, R, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(159,208,255,.35)'; c.lineWidth = 14 * cam.zoom; c.stroke();
  for (let i = 1; i <= 3; i++) {
    c.beginPath(); c.arc(ex, ey, R + i * 18 * cam.zoom, 0, Math.PI * 2);
    c.strokeStyle = `rgba(159,208,255,${(0.12 / i).toFixed(3)})`; c.lineWidth = 6 * cam.zoom; c.stroke();
  }
}

function drawSolarArrays(c) {
  for (const [x0] of [[60], [835]]) {
    const w = 105, h = 64, y0 = 328;
    isoFlat(c, x0, y0, w, h, PANEL);
    for (let i = 1; i < 3; i++) isoFlat(c, x0, y0 + (h / 3) * i, w, 1, PANEL_LINE);
    for (let i = 1; i < 4; i++) isoFlat(c, x0 + (w / 4) * i, y0, 1, h, PANEL_LINE);
    // truss stub toward the hull
    const trussX = x0 < 500 ? x0 + w : 170 - 5;
    const trussW = x0 < 500 ? 170 - (x0 + w) : x0 - 170;
    isoFlat(c, Math.min(trussX, x0 + w), y0 + h / 2 - 3, Math.abs(trussW) || 5, 6, HULL_DK);
  }
}

function moduleFloor(c, m) {
  isoFlat(c, m.l, m.t, m.r - m.l, m.b - m.t, FLOOR);
  if (m.wash) isoFlat(c, m.l, m.t, m.r - m.l, m.b - m.t, m.wash);
}

function drawHullShell(c) {
  // Rounded casings, each module's rect padded 4px, drawn UNDER the floor
  // fills so a thin hull-coloured rim frames every pod.
  for (const k in MODULES) {
    const m = MODULES[k];
    rrw(c, m.l - 4, m.t - 4, (m.r - m.l) + 8, (m.b - m.t) + 8, 10, HULL);
  }
  for (const k in MODULES) moduleFloor(c, MODULES[k]);

  const WT = 9;
  // Row divider between lab/ops and node, gapped at their two portals.
  wallH(c, 300, 170, 830, [PORTAL.lab, PORTAL.ops], WT);
  // Row divider between node and quarters/cupola/airlock, gapped at three.
  wallH(c, 420, 170, 830, [PORTAL.quarters, PORTAL.cupola, PORTAL.airlock], WT);
  // Solid dividers (no portal): lab|ops, quarters|cupola, cupola|airlock.
  wallV(c, 500, 150, 300, WT);
  wallV(c, 450, 420, 560, WT);
  wallV(c, 640, 420, 560, WT);
  // Outer hull: north/west/east solid; south solid except the hatch gap.
  isoFlat(c, 170 - WT / 2, 150 - WT / 2, (830 - 170) + WT, WT, HULL_DK);
  isoFlat(c, 170 - WT / 2, 150 - WT / 2, WT, (560 - 150) + WT, HULL_DK);
  isoFlat(c, 830 - WT / 2, 150 - WT / 2, WT, (560 - 150) + WT, HULL_DK);
  wallH(c, 560, 170, 830, [HATCH.x], WT);

  // Docking-collar rings where modules meet the corridor.
  for (const x of [PORTAL.lab, PORTAL.ops]) fxArc(c, x, 300, 0, 7, 7, HULL_DK, 'stroke', 1.6);
  for (const x of [PORTAL.quarters, PORTAL.cupola, PORTAL.airlock]) fxArc(c, x, 420, 0, 7, 7, HULL_DK, 'stroke', 1.6);
}

function drawTetherRail(c) {
  const rail = ThemeEngine.buildLoopPolyline({ roundRect: RAIL });
  c.save();
  c.setLineDash([6 * cam.zoom, 9 * cam.zoom]);
  c.strokeStyle = 'rgba(180,195,220,.28)';
  c.lineWidth = 1.4 * cam.zoom;
  c.beginPath();
  rail.pts.forEach((p, i) => { const [sx, sy] = proj(p.x, p.y); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
  c.closePath(); c.stroke();
  c.restore();
  // Handrail ticks roughly every 180 world px along the path.
  let next = 0;
  for (let i = 0; i < rail.pts.length; i++) {
    if (rail.cum[i] < next) continue;
    next += 180;
    const a = rail.pts[i], b = rail.pts[(i + 1) % rail.pts.length];
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d, ny = dx / d;
    const [x1, y1] = proj(a.x - nx * 5, a.y - ny * 5);
    const [x2, y2] = proj(a.x + nx * 5, a.y + ny * 5);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = 'rgba(180,195,220,.28)'; c.lineWidth = 1.2 * cam.zoom; c.stroke();
  }
}

function drawFurniture(c) {
  // Lab glovebox bench.
  rrw(c, 178, 165, 32, 125, 4, HULL);
  rrw(c, 183, 172, 22, 60, 3, 'rgba(150,220,255,.14)');

  // Ops robotics console + planning board (east wall).
  rrw(c, 508, 165, 37, 60, 4, HULL);
  rrw(c, 513, 172, 27, 46, 3, 'rgba(90,140,220,.12)');
  rrw(c, 795, 165, 27, 100, 4, HULL);
  rrw(c, 799, 172, 19, 86, 3, 'rgba(230,190,120,.10)');

  // Cupola dome: concentric rounded panes bulging south of the hull.
  rrw(c, 480, 555, 130, 40, 18, HULL_DK);
  rrw(c, 490, 552, 110, 34, 16, CUP_WASH);
  rrw(c, 502, 549, 86, 28, 13, HULL_DK);
  rrw(c, 510, 552, 70, 22, 11, CUP_WASH);

  // Quarters: 4 pod alcoves + galley table.
  for (const [px, py] of [[205, 456], [275, 456], [205, 514], [275, 514]]) {
    rrw(c, px - 23, py - 25, 46, 50, 6, HULL_DK);
    rrw(c, px - 19, py - 21, 38, 42, 5, '#1b1f29');
    fxArc(c, px, py - 18, 0, 1.4, 1.4, LAMP, 'fill');
  }
  rrw(c, 370 - 28, 487 - 42, 56, 84, 8, HULL);
  rrw(c, 370 - 22, 487 - 36, 44, 72, 6, '#30384a');

  // Airlock: suit rack, repair bench, inner+outer hatch rims.
  rrw(c, 650, 430, 14, 30, 4, 'rgba(232,234,240,.14)');
  rrw(c, 668, 430, 14, 30, 4, 'rgba(232,234,240,.14)');
  rrw(c, 800, 466, 22, 60, 4, HULL);
  fxArc(c, PORTAL.airlock, 420, 0, 16, 16, 'none', 'stroke', 2.2);
  fxArc(c, PORTAL.airlock, 420, 0, 16, 16, 'rgba(159,208,255,.4)', 'stroke', 2.2);
  fxArc(c, HATCH.x, HATCH.y, 0, 16, 16, 'rgba(255,180,120,.4)', 'stroke', 2.2);

  // Robotic arm, folded, on the hull's exterior top-right. Unfolded/animated
  // version is redrawn on top in drawFX when `delegate` is occupied.
  drawFoldedArm(c);

  // Beacon-row tether anchors: five small rings + a short dashed line up.
  for (const bx of [240, 370, 500, 630, 760]) {
    fxArc(c, bx, 672, 0, 3.5, 3.5, 'none', 'stroke', 1.4);
    fxArc(c, bx, 672, 0, 3.5, 3.5, 'rgba(180,195,220,.4)', 'stroke', 1.4);
    c.save();
    c.setLineDash([4 * cam.zoom, 4 * cam.zoom]);
    c.strokeStyle = 'rgba(180,195,220,.3)'; c.lineWidth = 1 * cam.zoom;
    const [x1, y1] = proj(bx, 668.5), [x2, y2] = proj(bx, 640);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    c.restore();
  }
}

const ARM_BASE = { x: 790, y: 138 };
function drawFoldedArm(c) {
  const [x0, y0] = proj(ARM_BASE.x, ARM_BASE.y);
  c.strokeStyle = HULL_DK; c.lineWidth = 4 * cam.zoom; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0, y0 - 30 * cam.zoom); c.stroke();
  c.fillStyle = HULL_DK;
  c.beginPath(); c.arc(x0, y0, 4 * cam.zoom, 0, Math.PI * 2); c.fill();
}

function drawBackground(ctx) {
  drawVoid(ctx);
  drawEarthLimb(ctx);
  drawSolarArrays(ctx);
  drawHullShell(ctx);
  drawTetherRail(ctx);
  drawFurniture(ctx);
}

// ---- fx (per-frame, on top of the cached background) -----------------------

function occupancy() {
  const occ = { exec: 0, edit: 0, read: 0, delegate: 0, plan: 0 };
  for (const s of sessions) {
    if (s.state !== 'working') continue;
    const a = ThemeEngine.activityOf(s);
    if (!(a in occ)) continue;
    const sp = sprites.get(s.id);
    if (sp && !sp.moving && !sp.onLoop) occ[a]++;
  }
  return occ;
}
function loopOccupancy() {
  let n = 0;
  for (const s of sessions) { const sp = sprites.get(s.id); if (sp && sp.onLoop) n++; }
  return n;
}

function nearestOnRail(rail, x, y) {
  let best = null, bd = Infinity;
  for (let i = 0; i < rail.pts.length; i++) {
    const p = rail.pts[i];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function drawUnfoldedArm(c, t) {
  const sweep = Math.sin(t * 0.5) * 12 * Math.PI / 180;
  let x = ARM_BASE.x, y = ARM_BASE.y, ang = Math.PI / 2 + sweep;
  const segs = [30, 30, 30];
  const pts = [[x, y]];
  for (let i = 0; i < segs.length; i++) {
    ang += (i === 1 ? sweep * 1.4 : 0);
    x += Math.cos(ang) * segs[i]; y += Math.sin(ang) * segs[i];
    pts.push([x, y]);
  }
  c.strokeStyle = HULL_DK; c.lineWidth = 4 * cam.zoom; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  pts.forEach(([wx, wy], i) => { const [sx, sy] = proj(wx, wy); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
  c.stroke();
  for (const [wx, wy] of pts) {
    const [sx, sy] = proj(wx, wy);
    c.beginPath(); c.arc(sx, sy, 3 * cam.zoom, 0, Math.PI * 2); c.fillStyle = HULL; c.fill();
  }
}

let _planRow = 0, _planAt = 0;
function drawPlanningBoard(c, t, n) {
  const rows = 4, x0 = 799, y0 = 176, w = 19, rh = 20;
  if (t - _planAt > 1.5) { _planAt = t; _planRow = (_planRow + 1) % rows; }
  for (let i = 0; i < rows; i++) {
    isoFlat(c, x0, y0 + i * rh, w, rh - 2, i === _planRow && n > 0 ? 'rgba(230,190,120,.28)' : 'rgba(230,190,120,.08)');
  }
}

function drawFX(c, t) {
  const occ = occupancy();
  const loopN = loopOccupancy();

  // Cupola earthshine -- soft blue wash, brighter while `read` is occupied.
  const shineA = (0.05 + 0.04 * Math.sin(t * 0.8)) * (occ.read > 0 ? 2 : 1);
  fxArc(c, 545, 566, 0, 60, 24, `rgba(90,140,220,${shineA.toFixed(3)})`, 'fill');

  // Glovebox -- cyan wash pulse + a droplet drifting up while `edit` is occupied.
  if (occ.edit > 0) {
    const a = 0.10 + 0.05 * Math.sin(t * 4);
    rrw(c, 183, 172, 22, 60, 3, `rgba(150,220,255,${a.toFixed(3)})`);
    const phase = (t * 0.6) % 1;
    fxArc(c, 194, 228 - 50 * phase, 0, 1.6, 1.6, `rgba(143,224,216,${(1 - phase).toFixed(3)})`, 'fill');
  }

  // Robotic arm -- unfolds and sweeps while `delegate` is occupied.
  if (occ.delegate > 0) drawUnfoldedArm(c, t);

  // Planning board -- one procedure row highlighted, advancing.
  drawPlanningBoard(c, t, occ.plan);

  // Repair bench -- warm work-lamp glow while `exec` is occupied.
  if (occ.exec > 0) {
    const a = 0.20 + 0.10 * Math.sin(t * 3);
    fxArc(c, 811, 466, 0, 26, 26, `rgba(255,180,90,${a.toFixed(3)})`, 'fill');
  }

  // Comms dish -- faint ring expanding from the ops roof every 4s while
  // anyone is on the EVA loop.
  if (loopN > 0) {
    const phase = (t % 4) / 4;
    fxArc(c, 700, 146, 0, 6 + 40 * phase, 6 + 40 * phase, `rgba(150,220,255,${(0.35 * (1 - phase)).toFixed(3)})`, 'stroke', 1.4);
  }

  // EVA tether lines -- each drifter to the nearest point on the (slightly
  // inset, decorative) handrail.
  if (loopN > 0) {
    const rail = ThemeEngine.buildLoopPolyline({ roundRect: RAIL });
    for (const s of sessions) {
      const sp = sprites.get(s.id);
      if (!sp || !sp.onLoop) continue;
      const near = nearestOnRail(rail, sp.x, sp.y);
      if (!near) continue;
      const [x1, y1] = proj(sp.x, sp.y), [x2, y2] = proj(near.x, near.y);
      c.strokeStyle = 'rgba(200,215,235,.3)'; c.lineWidth = 1 * cam.zoom;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
    }
  }

  // Pod breathing -- a dim lavender rim glow for each held berth (house's
  // drawBedFX pattern, verbatim structure).
  const berths = THEME.places.find(p => p.id === 'berths');
  if (berths) {
    const ry = 22 + 2 * (0.5 - 0.5 * Math.cos(t / 4 * Math.PI * 2));
    for (const [id, key] of heldSeat) {
      if (!key.startsWith('berths:')) continue;
      const sp = sprites.get(id);
      if (!sp || sp.moving || sp.pose !== 'sleep') continue;
      const slot = berths.slots[Number(key.split(':')[1])];
      if (slot) fxArc(c, slot.x, slot.y, 0, 20, ry, 'rgba(170,140,190,.14)', 'fill');
    }
  }
}

(window.THEME_RENDERERS = window.THEME_RENDERERS || {}).station = {
  buildActor, updateActor, drawBackground, drawFX,
};

// ---- trust note -------------------------------------------------------------
// Same status as themes/house/render.js and themes/car/render.js: first-party
// plain JS, not a sanitized declarative pack. See house's closing comment for
// the full reasoning (THEMES.md §4) -- it applies here unchanged.
})();
