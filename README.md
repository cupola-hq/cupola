# Cupola

An ambient, glanceable view of your live Claude Code sessions. Every running
session becomes an inhabitant of a small scene you keep on a second monitor —
you don't read logs, you glance and *feel* the whole fleet at once: who's
working, who's raised a hand for you, who's gone quiet. A cupola is the little
rooftop dome you watch your whole domain from; this is that, for your agents.

```
node server.js          # then open http://localhost:7777
```

No dependencies, no build — Node only. Binds to loopback only: it serves your
prompts and questions verbatim, so don't expose it (see [Staying safe](#staying-safe)).

## Themes

Cupola draws the same fleet two ways; switch from the header dropdown.

- **House** (default) — each session is a person in a home, doing chores that
  map to what the session is doing.
- **Racetrack** — each session is a vehicle on a circuit: working sessions lap
  the track, idle ones park, blocked ones pull onto the shoulder.

Themes are **data, not a fork**: a `theme.json` (regions, routes, and "places"
inhabitants stand in) plus a `render.js` (the art). A conformance checker keeps
every theme honest (see [What the layout guarantees](#what-the-layout-guarantees)).
To build your own, see [THEMES.md](THEMES.md).

## The house

| in the house      | where            | means                                  |
|-------------------|------------------|----------------------------------------|
| 🍳 at the stove    | kitchen          | Bash                                   |
| 🪟 at the window   | kitchen          | WebFetch / WebSearch                   |
| 📚 at the shelf    | study            | Read / Grep / Glob                     |
| ☎️ on the phone    | study            | spawned a subagent                     |
| 🪴 watering        | living room      | Edit / Write                           |
| 🧹 tidying         | living room      | TodoWrite / task bookkeeping           |
| ✋ hand up         | living room      | needs input or a permission approval   |
| 💤 on the couch    | living room      | nothing for 10 minutes                 |

Kitchen and study both open onto the living room, which acts as the hub — a
visitor moving from the stove to the bookshelf walks out through the kitchen
door, across the living room, and in through the study door. New sessions arrive
on the road and walk up the garden path through the front door; sessions already
running when you open the app are just at home already.

Walking is a constant ~50px/sec in real time (not per frame — a 120Hz display
would otherwise walk everyone at double speed), so crossing the house takes about
17 seconds. Slow enough to notice out of the corner of your eye.

## The racetrack

Each session is a vehicle, and the **model drives the chassis** — scaled by
heft, not speed:

| model  | vehicle    |
|--------|------------|
| Haiku  | motorcycle |
| Sonnet | sedan      |
| Opus   | SUV        |
| Fable  | luxury car |

- **working** — laps the circuit at a steady pace, banking through the corners,
  with a small prop riding along for the current tool.
- **needs you** — pulls off onto the shoulder with a hazard triangle and an
  amber flash. That's the hand-raise.
- **idle** — drives in off the access road and parks in the lot, **headlights
  on** — lit means ready.
- **gone quiet** — parked, dark, a "z" drifting up.

## Reading a session

Click any inhabitant to open the panel: its pending question, last prompt,
worktree, branch, token count, and model.

Each one gets a stable name (Pip, Xan, Ada…) derived from its session id, and a
colour keyed the same way. The name matters because position can't identify
anyone — this machine routinely runs two sessions in the same worktree on the
same branch, so "wt5 needs you" is ambiguous where "Pip needs you" isn't.

## Acting on a session

From the panel:

- **Dismiss** — hides it from the view. The session keeps running, untouched;
  it comes back on the next daemon restart. Non-destructive.
- **Kick out** — SIGTERMs the session's process, SIGKILLs after 4s if ignored.
  Takes two clicks (the first arms, and disarms itself after 4s) because a
  misclick kills work in progress. Before signalling, the daemon re-checks the
  pid is still a `claude` process — pids get recycled.
- **Answer** *(needs tmux)* — type a reply straight into a session's live TUI.
  **Peek** reads the pane back and shows the question exactly as the TUI renders
  it, options and all. **Clean** sends `/clear`.
- **Go to terminal** — raises the session's terminal window to the front
  (macOS).

Answering needs tmux because typing into a live interactive TUI is the only way
in: macOS disables `TIOCSTI`, and `claude --resume -p` can't answer a question a
running TUI is already blocking on. `tmux send-keys` writes to the pane's tty,
which sidesteps all of it. Start a session inside tmux and the answer box, Peek,
and Clean light up; sessions started outside tmux say why they can't.

```
tmux new-session -s work -c ~/your/repo 'claude'
```

## Why hooks, not just the transcript

Three sources feed the view, each covering what the others can't:

- **`claude agents --json`** — Claude Code's own session roster. Authoritative
  but coarse: every live session's pid, cwd, and busy/idle status, machine-wide,
  with no hooks and no daemon-lifetime dependency. (Falls back to the files if
  the CLI is too old or not on PATH.)
- **Hooks** — the fine-grained live layer: *which* tool is running right now, and
  the text of a pending question. Neither the roster nor the files carry this.
- **The transcript** (`~/.claude/projects/**/*.jsonl`) — identity: `ai-title`,
  `last-prompt`, `cwd`, `gitBranch`.

The tempting shortcut is to skip hooks and poll the transcript for live state. It
doesn't work, and it's worth knowing why before you try it:

**The transcript is written retroactively.** A `tool_use` record only lands in
the file *after* the tool finishes. Verified by polling this repo's own session
from inside a running `Bash` call — it could not see itself, and every session
sampled at rest showed `unresolved tool_use count: 0`.

Two consequences:

1. A session mid-`Bash` is byte-identical on disk to one sitting idle. **Live
   activity is not detectable from files.**
2. When `AskUserQuestion` is on your screen waiting, its record hasn't been
   written yet — it appears only *after you answer*. **A pending question is
   invisible.** The transcript can tell you a question *was* asked, never that
   one *is* pending.

Since the hand-raise is the whole point, hooks carry the fine-grained live state
the transcript can't — while the roster covers coarse liveness and pid, and the
JSONL supplies identity.

## Hooks

```
node install-hooks.js            # merge into ~/.claude/settings.json
node install-hooks.js --remove   # restores it byte-identically
```

Merges alongside existing hooks rather than replacing them, backs up first, and
is idempotent. `hook.sh` only ever POSTs to localhost with a 1s cap and always
exits 0, so a stopped daemon can never block or fail a session. Already-running
sessions pick the hooks up without a restart. Sessions that predate the hooks
still appear (via the roster) — they just can't show chores, and the panel marks
them `no live hook`.

## Staying safe

Cupola can type into your terminals, so it's built to be worth trusting — the
whole daemon is ~1,200 lines of dependency-free Node you can read in a sitting.

- **Loopback only.** It binds to `127.0.0.1` and serves your prompts verbatim.
  Don't put it behind a public proxy.
- **Write endpoints are double-guarded.** Answering, kicking, focusing, and
  preferences require both an Origin/Host match *and* a random token minted at
  startup and embedded only in the page the daemon itself serves. A drive-by
  page on another origin can neither read the token nor forge the request.
- **Kicks re-verify.** The pid is re-checked as a live `claude` before any
  signal — pids get recycled.
- **Keystrokes re-verify.** Before every write, the daemon walks up from the
  session's known pid to confirm the target tmux pane actually hosts it
  (`paneOwnsPid`), and only single-line text is allowed (a newline would submit
  early). Forging a hook that claimed a session lived in a plain shell pane gets
  `answerable: false` and the write is refused — verified by attack.

## What the layout guarantees

Stated precisely, because an earlier version claimed "inhabitants never overlap"
and that is **false** — a QA pass falsified it after the wrong claim had already
been handed to a designer as a hard constraint.

The real guarantee is **containment, not separation**:

> An inhabitant never escapes its region, at any count. When a group outgrows its
> space the rows *compress*, and past a threshold they overlap.

That trade is deliberate: a crowd that looks like a crowd beats a visitor
standing on the lawn. A conformance checker enforces it for every theme at every
population — a theme that lets anyone escape its regions fails to load:

```
node bin/check-theme.js public/themes/house
node bin/check-theme.js public/themes/car
```

## Knobs

```
PORT=7777 WINDOW_MIN=120 STALE_MIN=10 node server.js
```

`WINDOW_MIN` is how far back a session counts as live. At 24h this machine showed
25 inhabitants, most of them day-old corpses; 2h gives a view that reflects
today's work. `STALE_MIN` is the quiet-for-N-minutes threshold that flips a
session to "gone quiet."

## Deliberately not done

- **No permission inference.** A test suite that fires `PreToolUse` then goes
  quiet is indistinguishable from one waiting at a permission dialog. Guessing
  would raise false hands, and a hand you can't trust is worse than no hand —
  only a real `Notification` raises one.
- **No remote / multi-machine.** Loopback by design. Cupola watches the sessions
  on the machine it runs on; it is not a hosted dashboard.

## License

[Apache-2.0](LICENSE). The code is Apache-licensed; "Cupola" the name and any
associated marks are not granted by that license.
