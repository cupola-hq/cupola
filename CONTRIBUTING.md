# Contributing to Cupola

Thanks for wanting to work on this. A few things worth knowing before you dig in.

## Read this first

- **Zero dependencies is a hard constraint, not a starting point.** The daemon,
  the CLI, and the hook installer are all built from Node core modules only —
  `http`, `fs`, `path`, `os`, `crypto`, `child_process`, `net`, `readline`.
  Don't add anything to `package.json`'s (nonexistent) `dependencies` — there's
  a `"//"` comment at the top of that file guarding exactly that. If a problem
  seems to need a library, the right first move is usually to ask whether it
  needs solving at all.
- **Read the README's ["Deliberately not done"](README.md#deliberately-not-done)
  section before proposing permission inference or remote/multi-machine
  support.** Those aren't gaps — they were considered and rejected for reasons
  explained there. A PR reopening them needs to argue with that reasoning, not
  route around it.
- **Comments explain *why*, not *what*.** The codebase leans hard on this — see
  the top of `server.js` or `install-hooks.js` for the tone. A comment earns
  its place by recording a non-obvious constraint, a bug that motivated a
  workaround, or a decision that would otherwise look arbitrary. If removing a
  comment wouldn't confuse the next reader, don't add it.
- Style otherwise: 2-space indent, `'use strict'`, CommonJS (`require`, not
  `import`) — match what's already in the file you're editing.

## Getting set up

No install step — that's the point.

If you don't have push access (most contributors won't, and don't need it):
[fork the repo](https://github.com/cupola-hq/cupola/fork) first, then clone
your fork instead of the URL below. Everything else — running it, testing
it, opening the PR back against `cupola-hq/cupola` — works the same either
way.

```
git clone https://github.com/cupola-hq/cupola.git
cd cupola
node server.js          # http://localhost:7777
```

Node >=18. `bin/cupola.js` is the packaged CLI entry point; running
`server.js` directly is the equivalent of what `cupola` does once hooks are
already installed, minus the CLI dispatch.

## Testing your changes

```
npm test
```

Runs the suite (`node --test`, Node's built-in runner — no test framework
dependency, consistent with the zero-dep rule above): syntax-checks every
shipped `.js` file, verifies `package.json` has no `dependencies`, runs the
theme conformance checker for both themes, checks every tracked file for
CRLF line endings (a real bug — see `.gitattributes`), and starts the actual
daemon to hit a few endpoints over HTTP. CI runs this on Linux, macOS, and
Windows on every PR.

It's deliberately not exhaustive — it won't catch a layout/rendering
regression or a hook-wiring bug. Two things stand in for that:

**The fake-crowd harness**, for anything touching layout, rendering, or a
theme — synthesizes sessions instead of connecting to real ones, so you don't
need live Claude Code sessions to see a full house:

```
http://localhost:7777/?fake=40&boxes=1
```

`fake=N` — N synthetic sessions, stable ids so names/colors don't churn on
reload. `boxes=1` — draws every visitor's footprint and each region's
containment rect, reddening anything that escapes its region. Add
`&chore=cooking`, `&state=blocked`, or `&heft=ramp` to pin what you're
checking rather than getting the round-robin default mix.

**The theme conformance checker**, required for any theme change — a theme
that lets an inhabitant escape its regions at any population fails to load:

```
node bin/check-theme.js public/themes/house
node bin/check-theme.js public/themes/car
# same for brigade / hive / orchestra / station
```

For anything else (hooks, the daemon's HTTP endpoints, `install-hooks.js`),
there's no substitute for running it for real: install the hooks, drive an
actual Claude Code session, and watch the house respond.

## Adding or changing a theme

Themes are data (`theme.json` + `render.js`), not a fork of the engine — see
[THEMES.md](THEMES.md) for the full contract: regions, routing, the four place
behaviors themes compose from, and why third-party JavaScript in a theme isn't
on the table (this app can SIGTERM real processes and type into live
terminals — a same-origin script isn't a color scheme, it's remote code
execution against your work). Read it before starting on a new theme; it'll
save you from a design the conformance checker is just going to reject anyway.

## Touching anything security-sensitive

Write endpoints (answer, kick, focus, preferences) are double-guarded —
Origin/Host match plus a startup-minted token — and kicks/keystrokes re-verify
the target right before acting (pid re-checked as a live `claude` process,
tmux pane ownership re-walked from the pid). See "Staying safe" in the README
for the reasoning. If your change touches any of this, explain the threat
model in the PR description, not just the diff — "why is this still safe"
matters more than "what changed" here.

## Commits and PRs

- Keep diffs focused — one concern per PR is easier to reason about against
  the constraints above than a bundle of unrelated changes.
- Write commit messages and PR descriptions that explain *why*, matching the
  existing log (`git log --oneline`). "What changed" is visible in the diff;
  what isn't visible is why it was the right call.
- Small, well-explained PRs get reviewed faster than large ones.

## Reporting bugs / proposing features

Open an issue at
[github.com/cupola-hq/cupola/issues](https://github.com/cupola-hq/cupola/issues).
For a bug, include your OS, Node version, and — if it's about the live view —
whether it reproduces under the fake-crowd harness (that isolates
rendering/layout bugs from hook/transcript data issues).

## License

Cupola is [Apache-2.0](LICENSE). By contributing, you agree your contribution
is licensed under the same terms.
