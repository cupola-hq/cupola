'use strict';
// theme-engine.js -- the host half of the theme contract (THEMES.md §3).
//
// A theme (public/themes/<name>/theme.json) declares WORLD-SPACE geometry:
// regions, portals, places, and actor sizing/speed. This file is the only
// code that knows how to turn that declaration into positions, routes, and a
// containment verdict. Themes never reimplement any of it -- that is the
// whole point of the split (THEMES.md §2.1: "a theme author can draw a bad
// map; they cannot write a bad musical-chairs algorithm").
//
// Zero dependencies, runs unmodified in the browser (loaded as a plain
// <script>, attaches to `window.ThemeEngine`) and in Node (required by
// bin/check-theme.js, attaches to `module.exports`) -- same file, same
// behaviour, so the headless checker can never disagree with what the page
// draws.
//
// ---- THE CONTRACT, for whoever builds the next theme -------------------
//
// theme.json shape (see public/themes/house/theme.json for a worked example):
//
//   format: 1
//   name, title
//   world: { w, h }
//   wall: <number>              // uniform inset applied to a region's l/r/t/b
//                                // to derive its CONTAINMENT box (footprints
//                                // must stay inside this tighter box) from its
//                                // ROUTING box (regionAt()/route() use the
//                                // wider one). One scalar reproduces the
//                                // house's old BOUNDS table exactly -- see the
//                                // comment on containmentBox() below. This is
//                                // a real correction to THEMES.md §3.1, which
//                                // showed the INSET numbers as `regions` and
//                                // didn't separate the two uses; if you feed
//                                // route() the inset numbers you get gaps at
//                                // every doorway and sessions stop mid-walk.
//   outsideRegion: 'outside'    // name returned by regionAt() for any point
//                                // outside every declared region
//   hub: 'living'               // optional: name of a single region every
//                                // other region routes through (see route())
//   regions: {
//     <name>: { l, r, t, b, anchor?: {x,y} }
//       // l/r/t/b: ROUTING bounds (wall-to-wall, no gap between adjoining
//       //   regions -- regionAt() must have exactly one owner for every
//       //   point that's inside the world, or route() can't tell which
//       //   room a sprite is standing in).
//       // anchor: optional waypoint always visited when a journey passes
//       //   through this region (hub's living-room centre, outside's gate).
//     outside: { anchor?: {x,y} }   // no l/r/t/b -- it's the fallback region
//   }
//   portals: {
//     <id>: { x, y, joins: [region, region, ...] }
//       // a door/gate. `joins` lists every region reachable from this exact
//       // point; route() looks up "the portal that joins A and B".
//   }
//   places: [ ...see PLACE KINDS below... ]
//   actor: {
//     footprint: {
//       standing: { w, h, dy? },   // dy: vertical offset of the box's
//       posed:    { w, h, dy? }    //   centre from the actor's (x,y) anchor,
//     },                           //   which is a foot-ish point, not a
//                                  //   geometric centre. Needed for a lossless
//                                  //   round-trip of the house's footprint()
//                                  //   (THEMES.md §3.1 only specced w/h).
//     speed: { base, jitter }      // world px/sec = base + hash(id) % jitter
//   }
//   entrance: { spreadX: [lo, hi], y }   // new arrivals spawn at a random x
//                                        // in [lo, hi) on this y, then route()
//                                        // into place
//   exit:     { spreadX: [lo, hi], y }   // ghosts walk to a random x here
//                                        // before waving goodbye
//   strings:  { clean?: string }        // optional UI-string overrides, host
//                                        // reads these directly (this file
//                                        // never touches them) -- e.g. the
//                                        // car theme relabels the side
//                                        // panel's Clean button "Pit stop
//                                        // (/clear)". Omit to keep the
//                                        // host's default label.
//
// PLACE KINDS -- the closed set (THEMES.md §3.2). `kind` selects the
// algorithm; everything else in a place object is that algorithm's data.
//
//   grid  { id, kind:'grid', region, accepts:{state, activity?}, faceAt?,
//           pose?, prop?, overflow?,
//           grid: { x, y, cols, colPitch, rowPitch, span } }
//     -- STATIONS today. cols x rows from anchor (x,y); rows compress into
//        `span` once they'd otherwise exceed it. Soft capacity: never
//        overflows in practice (only compresses), but `overflow` is still
//        required by the checker for schema uniformity.
//
//   slots { id, kind:'slots', region, prio, accepts:{state}, homeOnly?,
//           pose?, overflow?, slots: [ {x,y,face}, ... ] }
//     -- SEATS today. Explicit claimed positions, sticky (heldSeat), filled
//        in `prio` order across ALL slots places at once (so bed fills
//        before couch2 fills before couch3). `homeOnly`: states listed here
//        may only claim a slot in a region they're already standing in (the
//        "idle sits only where it already is" rule) -- generalizes what used
//        to be hardcoded to state==='idle'. Hard capacity: slots.length;
//        spills to `overflow` once full (by simply not qualifying -- the
//        next slots place in prio order picks it up).
//
//   field { id, kind:'field', region, accepts:{state},
//           grid: { x, y, cols, colPitch, rowPitch, span } }
//     -- MILL today. One shared grid, sticky held INDICES (not positions --
//        an index survives neighbours leaving), grid width follows the
//        highest held index so a departure never reflows the columns. No
//        capacity ceiling: only denser. This is where every overflow chain
//        must terminate (THEMES.md §2.1.3) -- the checker enforces that
//        statically, not by testing it at runtime.
//
//   loop  { id, kind:'loop', region, accepts:{state, activity?}, speed?,
//           loop: { points:[[x,y],...] } | { roundRect:{x,y,w,h,r} } }
//     -- NEW (THEMES.md §3.2), not exercised by the house (it has no loop
//        places) -- built for the car theme's track. Occupant i of n sits at
//        arc-length (i/n)*L + speed*t (mod L), i assigned by the same
//        lowest-free-index sticky scheme as `field`'s heldFloor, so joining
//        or leaving never reshuffles everyone else's phase by more than the
//        1/n share the formula already implies. Zero-overlap is a theorem up
//        to floor(L / minGap) occupants; past that, spacing compresses below
//        gap -- same doctrine as the seat maths, not tested live here because
//        the house doesn't use it. THE CAR THEME MUST VALIDATE THIS ITSELF
//        against its actual track length and footprint via bin/check-theme.
//
//        layoutTheme()'s placement record for a loop occupant additionally
//        carries `loop: { id, i, n }` (grid/slots/field records never have
//        this key). This is the ONE piece of information a host needs to
//        special-case loop placements instead of chord-walking them like
//        everything else: position is a pure function of wall-clock time
//        ((i/n)*L + speed*t), so a host that wants continuous motion (not a
//        snap once per broadcast) must resample pointOnPolyline() itself
//        every animation frame using this {id, i, n} -- not just read `pt`
//        once and setGoal() to it. See index.html's layout()/frame() for the
//        reference consumer.
//
//        ADDITIVE (car theme's bank-through-corners upgrade): pointOnPolyline()
//        now also returns `angle` -- the tangent heading in radians
//        (Math.atan2(dy,dx) of the segment the sample point falls on), world
//        space, computed the same way `face` already was (it's the unsigned
//        version of the same math `face` collapses to ±1). `face` is
//        unchanged and still returned for anything that only wants the
//        horizontal mirror. A host wanting real rotation reads `angle`
//        instead of re-deriving it from `face`; see index.html's
//        loopTrack()/updateSim() for the reference consumer -- world-space
//        smoothing happens in loopTrack(), then the smoothed angle is
//        applied directly in updateSim() (proj() is a plain scale+pan, so
//        world heading and on-screen heading are the same number).
//
// accepts.state is a string or an array of strings, matched against the
// session's `state`. accepts.activity (grid/loop only) is an array matched
// against session.activity (see activityOf() below) OR session.chore as a
// fallback, so a theme can match on the neutral vocabulary even though the
// wire still carries `chore` for the house's own rendering.
//
// Places are tried in ARRAY ORDER; the first grid/loop place whose `accepts`
// matches a working session wins that session (THEMES.md §3.1: "First place
// whose accepts matches wins"). Slots places are tried together, sorted by
// `prio`, with existing claim-holders re-checked before any slot is handed
// to a newcomer (this is what makes claims sticky -- see layoutSlots below).
// Anyone left over lands in the (single) field place.

(function (root) {
  // ---- small pure helpers, identical to index.html's originals -----------
  function hash(s) {
    let h = 0;
    for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
    return Math.abs(h);
  }

  // The neutral activity channel (THEMES.md §1). server.js now emits it
  // directly; this fallback lets a theme match on activity even against an
  // older payload (or the ?fake= harness, which only sets `chore`) by
  // deriving it from the same table server.js uses.
  const CHORE_ACTIVITY = {
    reading: 'read', watering: 'edit', cooking: 'exec',
    window: 'net', phone: 'delegate', tidying: 'plan',
  };
  function activityOf(s) {
    return s.activity || CHORE_ACTIVITY[s.chore] || null;
  }

  // ---- regions & routing ---------------------------------------------------

  function regionAt(theme, pt) {
    for (const name in theme.regions) {
      const r = theme.regions[name];
      if (r.l == null) continue; // unbounded (e.g. 'outside') -- fallback only
      if (pt.x >= r.l && pt.x <= r.r && pt.y >= r.t && pt.y <= r.b) return name;
    }
    return theme.outsideRegion || 'outside';
  }

  // The tighter box a footprint must stay inside -- the routing region inset
  // by `theme.wall` on every side. Verified against the house's original
  // BOUNDS table: a uniform 9px inset of the routing regions reproduces
  // {kitchen:{69,491,69,341}, study:{509,931,69,341}, living:{69,931,359,631}}
  // exactly, so one scalar replaces a whole second hand-maintained table.
  function containmentBox(theme, name) {
    const r = theme.regions[name];
    if (!r || r.l == null) return null;
    const w = theme.wall || 0;
    return { l: r.l + w, r: r.r - w, t: r.t + w, b: r.b - w };
  }

  function findPortal(theme, a, b) {
    for (const id in theme.portals) {
      const p = theme.portals[id];
      if (p.joins && p.joins.includes(a) && p.joins.includes(b)) return { x: p.x, y: p.y };
    }
    return null;
  }

  // Fallback for themes with no declared hub: shortest path over the portal
  // graph (regions = nodes, portals = edges), used verbatim (not the hub
  // shortcut) so an arbitrary topology still routes correctly even though it
  // won't get the house's "always detour through the hub" polish.
  function bfsPortalPath(theme, fromRegion, toRegion) {
    if (fromRegion === toRegion) return [];
    const edges = [];
    for (const id in theme.portals) {
      const p = theme.portals[id];
      const js = p.joins || [];
      for (let i = 0; i < js.length; i++)
        for (let j = 0; j < js.length; j++)
          if (i !== j) edges.push({ from: js[i], to: js[j], pt: { x: p.x, y: p.y } });
    }
    const q = [[fromRegion, []]], seen = new Set([fromRegion]);
    while (q.length) {
      const [region, path] = q.shift();
      for (const e of edges) {
        if (e.from !== region || seen.has(e.to)) continue;
        const nextPath = path.concat([e.pt]);
        if (e.to === toRegion) return nextPath;
        seen.add(e.to);
        q.push([e.to, nextPath]);
      }
    }
    return [];
  }

  // Generalizes index.html's original route(): "leave whichever room you're
  // in for the hub, then head for the target." Verified by hand against
  // every from/to combination the house actually uses (kitchen<->study via
  // living, either <-> outside, either <-> living) -- see the design notes
  // in THEMES.md-review; this reproduces every one of those paths waypoint
  // for waypoint. Themes without a `hub` fall back to plain BFS.
  function route(theme, fromPt, toRegion, toPt) {
    const fromRegion = regionAt(theme, fromPt);
    if (fromRegion === toRegion) return [toPt];
    const path = [];
    const hub = theme.hub;
    if (hub) {
      if (fromRegion !== hub) {
        const rFrom = theme.regions[fromRegion];
        if (rFrom && rFrom.anchor) path.push(rFrom.anchor);
        const p1 = findPortal(theme, fromRegion, hub);
        if (p1) path.push(p1);
        const rHub = theme.regions[hub];
        if (rHub && rHub.anchor) path.push(rHub.anchor);
      }
      if (toRegion !== hub) {
        const p2 = findPortal(theme, hub, toRegion);
        if (p2) path.push(p2);
        const rTo = theme.regions[toRegion];
        if (rTo && rTo.anchor) path.push(rTo.anchor);
      }
    } else {
      for (const w of bfsPortalPath(theme, fromRegion, toRegion)) path.push(w);
    }
    path.push(toPt);
    return path;
  }

  // ---- footprint & containment (the conformance contract, THEMES.md §2.1) --

  function footprint(theme, sp) {
    const seated = !!sp.pose;
    const fp = (theme.actor.footprint && (seated ? theme.actor.footprint.posed : theme.actor.footprint.standing))
      || { w: 82, h: 65, dy: 0 };
    const dy = fp.dy || 0;
    return { l: sp.x - fp.w / 2, r: sp.x + fp.w / 2, t: sp.y + dy - fp.h / 2, b: sp.y + dy + fp.h / 2 };
  }
  const boxHit = (A, B) => A.r > B.l && B.r > A.l && A.b > B.t && B.b > A.t;
  const inBox = (b, r) => b.l >= r.l && b.r <= r.r && b.t >= r.t && b.b <= r.b;

  // Theme-independent by construction (THEMES.md §2.1.1): the only theme
  // inputs are containmentBox() and footprint(); everything else is generic
  // rectangle math. Runs identically in the browser harness (?boxes=1) and
  // in bin/check-theme.js.
  function checkContainment(theme, sprites) {
    const list = [];
    for (const [id, sp] of sprites) if (!sp.moving) list.push([id, sp]);
    const escapes = [], clashes = [];
    for (const [id, sp] of list) {
      const b = footprint(theme, sp);
      const region = regionAt(theme, { x: sp.x, y: sp.y });
      const box = containmentBox(theme, region);
      if (box && !inBox(b, box)) escapes.push(id);
      for (const [id2, sp2] of list) {
        if (id2 === id) continue;
        if (boxHit(b, footprint(theme, sp2))) { clashes.push(id); break; }
      }
    }
    return { ok: escapes.length === 0, escapes, clashes, count: list.length };
  }

  // Static check (THEMES.md §2.1.3): every place's overflow chain must
  // terminate at a `field` kind, so a first-time theme author can't ship a
  // crowd with nowhere to compress into. Runs before a single actor is
  // placed.
  function checkOverflowChains(theme) {
    const byId = new Map(theme.places.map(p => [p.id, p]));
    const errors = [];
    for (const p of theme.places) {
      if (p.kind === 'field' || p.kind === 'loop') continue; // no ceiling, nothing to chain
      let cur = p, seen = new Set();
      while (cur.kind !== 'field') {
        if (seen.has(cur.id)) { errors.push(`${p.id}: overflow chain cycles at ${cur.id}`); break; }
        seen.add(cur.id);
        if (!cur.overflow) { errors.push(`${p.id}: overflow chain does not terminate at a field`); break; }
        const next = byId.get(cur.overflow);
        if (!next) { errors.push(`${p.id}: overflow "${cur.overflow}" is not a declared place`); break; }
        cur = next;
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // ---- placement: the four kinds -------------------------------------------

  function matchState(accepts, s) {
    if (!accepts || accepts.state == null) return false;
    const states = Array.isArray(accepts.state) ? accepts.state : [accepts.state];
    return states.includes(s.state);
  }
  function matchActivity(accepts, s) {
    if (!accepts.activity) return true;
    const a = activityOf(s);
    return a != null && accepts.activity.includes(a);
  }
  function matchesGrid(accepts, s) { return matchState(accepts, s) && matchActivity(accepts, s); }

  function layoutGrid(p, list, place) {
    const g = p.grid, n = list.length;
    const cols = Math.min(n, g.cols), rows = Math.ceil(n / cols);
    const gap = rows > 1 ? Math.min(g.rowPitch, g.span / (rows - 1)) : 0;
    list.sort((a, b) => hash(a.id) - hash(b.id)); // stable: no reshuffle when one leaves
    const faceAt = p.faceAt != null ? p.faceAt : g.x;
    list.forEach((s, i) => {
      const x = g.x + ((i % cols) - (cols - 1) / 2) * g.colPitch;
      const y = g.y + Math.floor(i / cols) * gap;
      place.set(s.id, { pt: { x, y }, room: p.region, face: x <= faceAt ? 1 : -1, pose: p.pose || null });
    });
  }

  function seatPlace(f) {
    return { pt: { x: f.sl.x, y: f.sl.y }, room: f.seat.region, face: f.sl.face, pose: f.seat.pose || null };
  }

  // Sticky claims (THEMES.md §2.2, §3.2): claim-holders are re-checked and
  // kept BEFORE any free slot is offered to a newcomer, which is what stops
  // one arrival/departure from renumbering everyone already seated.
  function layoutSlots(slotsPlaces, sessions, place, heldSeat, sprites, theme) {
    const sorted = slotsPlaces.slice().sort((a, b) => (a.prio || 0) - (b.prio || 0));
    const free = sorted.flatMap(seat => seat.slots.map((sl, i) => ({ seat, sl, key: `${seat.id}:${i}` })));
    const byKey = new Map(free.map(f => [f.key, f]));

    const qualifies = (s, f) => {
      if (!matchState(f.seat.accepts, s)) return false;
      const homeOnly = f.seat.homeOnly || [];
      if (!homeOnly.includes(s.state)) return true;
      const sp = sprites.get(s.id);
      const here = sp ? regionAt(theme, { x: sp.x, y: sp.y }) : null;
      return here === f.seat.region || heldSeat.get(s.id) === f.key;
    };

    const live = new Set(sessions.map(s => s.id));
    for (const id of [...heldSeat.keys()]) if (!live.has(id)) heldSeat.delete(id);

    const seekers = sessions.filter(s => !place.has(s.id) && sorted.some(sp => matchState(sp.accepts, s)));
    const taken = new Set();
    for (const s of seekers) {
      const key = heldSeat.get(s.id);
      const f = key && byKey.get(key);
      if (f && qualifies(s, f)) { taken.add(key); place.set(s.id, seatPlace(f)); }
      else heldSeat.delete(s.id);
    }
    for (const s of seekers) {
      if (place.has(s.id)) continue;
      const f = free.find(f => !taken.has(f.key) && qualifies(s, f));
      if (!f) continue;
      taken.add(f.key); heldSeat.set(s.id, f.key);
      place.set(s.id, seatPlace(f));
    }
    for (const s of sessions) if (!place.has(s.id)) heldSeat.delete(s.id);
  }

  // Held INDICES, not positions -- an index survives neighbours leaving, so
  // the grid never reflows out from under someone still standing in it.
  function layoutField(fieldPlace, sessions, place, heldFloor) {
    if (!fieldPlace) return;
    const floor = sessions.filter(s => !place.has(s.id));
    const floorIds = new Set(floor.map(s => s.id));
    for (const id of [...heldFloor.keys()]) if (!floorIds.has(id)) heldFloor.delete(id);
    const used = new Set(heldFloor.values());
    for (const s of floor) {
      if (heldFloor.has(s.id)) continue;
      let i = 0; while (used.has(i)) i++;
      used.add(i); heldFloor.set(s.id, i);
    }
    const maxIdx = Math.max(0, ...[...heldFloor.values()]);
    const g = fieldPlace.grid;
    const fcols = Math.min(maxIdx + 1, g.cols), frows = Math.floor(maxIdx / fcols) + 1;
    const fgap = frows > 1 ? Math.min(g.rowPitch, g.span / (frows - 1)) : 0;
    for (const s of floor) {
      const i = heldFloor.get(s.id);
      place.set(s.id, {
        pt: { x: g.x + ((i % fcols) - (fcols - 1) / 2) * g.colPitch, y: g.y + Math.floor(i / fcols) * fgap },
        room: fieldPlace.region,
      });
    }
  }

  // ---- loop geometry (new kind; see the header comment) --------------------

  function buildLoopPolyline(loop) {
    if (loop.points) {
      const pts = loop.points.map(p => ({ x: p[0], y: p[1] }));
      return finishPolyline(pts);
    }
    // roundRect: a closed rounded-rectangle centerline, resampled into line
    // segments (16 per corner) so arc length and point-at-length are both
    // plain polyline math -- no separate arc code path to keep correct.
    const { x, y, w, h, r } = loop.roundRect;
    const pts = [];
    const corner = (cx, cy, a0, a1) => {
      const N = 16;
      for (let i = 0; i <= N; i++) {
        const a = a0 + (a1 - a0) * (i / N);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
    };
    const L = Math.PI / 2;
    corner(x + w - r, y + r, -L, 0);
    corner(x + w - r, y + h - r, 0, L);
    corner(x + r, y + h - r, L, 2 * L);
    corner(x + r, y + r, 2 * L, 3 * L);
    return finishPolyline(pts);
  }
  function finishPolyline(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    }
    const last = pts[0], closing = Math.hypot(last.x - pts[pts.length - 1].x, last.y - pts[pts.length - 1].y);
    const L = cum[cum.length - 1] + closing;
    return { pts, cum, L };
  }
  function pointOnPolyline(poly, s) {
    const { pts, cum, L } = poly;
    let sMod = ((s % L) + L) % L;
    for (let i = 1; i < pts.length; i++) {
      if (sMod <= cum[i]) {
        const t = (sMod - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
        const a = pts[i - 1], b = pts[i];
        return { pt: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
                 face: (b.x - a.x) >= 0 ? 1 : -1,
                 angle: Math.atan2(b.y - a.y, b.x - a.x) };
      }
    }
    // closing segment, last point back to first
    const a = pts[pts.length - 1], b = pts[0];
    const segLen = L - cum[cum.length - 1];
    const t = segLen > 0 ? (sMod - cum[cum.length - 1]) / segLen : 0;
    return { pt: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, face: (b.x - a.x) >= 0 ? 1 : -1,
             angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }

  const loopCache = new WeakMap();
  function loopPolyOf(p) {
    if (!loopCache.has(p)) loopCache.set(p, buildLoopPolyline(p.loop));
    return loopCache.get(p);
  }

  // t: a monotonically increasing real-time clock in seconds (NOT reset per
  // frame), so position is a pure function of (id, t) -- no per-frame
  // integration to drift.
  function layoutLoop(p, list, place, heldLoop, t) {
    const n = list.length;
    if (!n) return;
    list.sort((a, b) => hash(a.id) - hash(b.id));
    const ids = new Set(list.map(s => s.id));
    for (const id of [...heldLoop.keys()]) if (!ids.has(id)) heldLoop.delete(id);
    const used = new Set(heldLoop.values());
    for (const s of list) {
      if (heldLoop.has(s.id)) continue;
      let i = 0; while (used.has(i)) i++;
      used.add(i); heldLoop.set(s.id, i);
    }
    const poly = loopPolyOf(p);
    const speed = p.speed != null ? p.speed : 60;
    for (const s of list) {
      const i = heldLoop.get(s.id);
      const s_ = (i / n) * poly.L + speed * t;
      const { pt, face } = pointOnPolyline(poly, s_);
      // `loop: {id, i, n}` is the one field that isn't in grid/slots/field's
      // placement record. It's what lets a host distinguish "this is a
      // t-based loop placement, don't chord-walk it" from every other kind
      // without re-deriving the accepts-matching itself -- see index.html's
      // layout()/frame() for the consumer. i/n are exactly what the host
      // needs to keep resampling this same formula every animation frame
      // (not just once per layoutTheme() call) without drifting out of the
      // sticky-index scheme heldLoop already guarantees.
      place.set(s.id, { pt, room: p.region, face, loop: { id: p.id, i, n } });
    }
  }

  // ---- the whole layout, one theme + one session list -> placements --------
  //
  // `held` bundles every sticky-claim Map the theme needs; the caller (host
  // page or bin/check-theme.js) owns their lifetime, exactly as index.html
  // owned heldSeat/heldFloor before this file existed.
  function layoutTheme(theme, sessions, sprites, held, t) {
    held.heldSeat = held.heldSeat || new Map();
    held.heldFloor = held.heldFloor || new Map();
    held.heldLoop = held.heldLoop || new Map();

    const place = new Map();
    const byId = new Map(theme.places.map(p => [p.id, p]));

    // Phase A: grid + loop places (first matching place, in document order,
    // wins -- THEMES.md §3.1's "first place whose accepts matches wins").
    const gridGroups = new Map(), loopGroups = new Map();
    for (const s of sessions) {
      for (const p of theme.places) {
        if (p.kind !== 'grid' && p.kind !== 'loop') continue;
        if (!matchesGrid(p.accepts, s)) continue;
        const groups = p.kind === 'grid' ? gridGroups : loopGroups;
        if (!groups.has(p.id)) groups.set(p.id, []);
        groups.get(p.id).push(s);
        break;
      }
    }
    for (const [pid, list] of gridGroups) layoutGrid(byId.get(pid), list, place);
    for (const [pid, list] of loopGroups) layoutLoop(byId.get(pid), list, place, held.heldLoop, t);

    // Phase B: slots places, all together (sticky claims span the whole set).
    const slotsPlaces = theme.places.filter(p => p.kind === 'slots');
    layoutSlots(slotsPlaces, sessions, place, held.heldSeat, sprites, theme);

    // Phase C: field -- whoever is left.
    const fieldPlace = theme.places.find(p => p.kind === 'field');
    layoutField(fieldPlace, sessions, place, held.heldFloor);

    return place;
  }

  const api = {
    hash, activityOf,
    regionAt, containmentBox, findPortal, route, bfsPortalPath,
    footprint, boxHit, inBox, checkContainment, checkOverflowChains,
    layoutGrid, layoutSlots, layoutField, layoutLoop, layoutTheme,
    buildLoopPolyline, pointOnPolyline,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ThemeEngine = api;
})(typeof self !== 'undefined' ? self : this);
