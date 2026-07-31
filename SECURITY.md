# Security policy

Cupola runs a local HTTP daemon that can read your Claude Code session
transcripts, type into your terminals, and signal live processes. It's built
to be worth that trust (see [Staying safe](README.md#staying-safe) in the
README for the actual threat model — Origin/Host-gated writes, a random
startup token, pid re-verification before every signal or keystroke), but if
you find a hole in any of that, please report it privately rather than as a
public issue.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repo:
[github.com/cupola-hq/cupola/security/advisories/new](https://github.com/cupola-hq/cupola/security/advisories/new).
That opens a private thread with the maintainer — nothing gets public until
there's a fix, and you'll get credit in the advisory unless you'd rather stay
anonymous.

Please don't open a public issue for anything that could let someone else's
page or process do one of the following on a machine running Cupola:

- Read a session's transcript, prompt, or answer text
- Type into a session's terminal, or send `/clear` or another command as if
  it came from the user
- Signal (kick/terminate) a session's process
- Do any of the above from an origin other than the page Cupola itself
  serves

## What's in scope

The daemon (`server.js`), the hook (`hook.sh`), the hook installer
(`install-hooks.js`), and the CLI (`bin/`). Cupola binds to `127.0.0.1` only
by design — a report that assumes it's reachable from the network without
something else (a proxy, a tunnel, port forwarding) putting it there is out
of scope, though "here's how someone could be tricked into exposing it
anyway" is exactly the kind of thing worth reporting.

## What's not a vulnerability report

- "It reads my prompts and screen text" — yes, by design, that's how the
  live view works. It never leaves your machine (loopback only). See
  [Staying safe](README.md#staying-safe).
- Missing rate limiting, CSRF-style concerns on GET-only reads, or other
  reports that assume a threat model beyond "another origin/page on the same
  machine" — loopback-only means the realistic attacker is a malicious page
  in the same browser, not a remote one, and the mitigations in
  [Staying safe](README.md#staying-safe) are built against exactly that.

## Supported versions

Cupola ships as a single rolling `latest` on npm — there's no maintained
older major version to backport a fix to. A fix lands as the next patch
release.
