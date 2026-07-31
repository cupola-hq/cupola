## What and why

<!--
What changed, and why it was the right call — not just what's visible in the
diff. See CONTRIBUTING.md's "Commits and PRs" section.
-->

## Checklist

- [ ] `npm test` passes locally
- [ ] No `dependencies` added to `package.json` (zero-dependency is a hard
      constraint — see the `"//"` comment at the top of that file)
- [ ] If this touches a theme's `theme.json`: ran
      `node bin/check-theme.js public/themes/<name>` and it prints
      `PASS -- 0 failure(s)`
- [ ] If this touches layout, rendering, or a theme: checked it against the
      fake-crowd harness (`?fake=40&boxes=1`), not just a couple of live
      sessions
- [ ] If this touches a write endpoint (answer, kick, focus, preferences) or
      anything pid/tmux-related: the PR description below explains the
      threat model, not just the change — see CONTRIBUTING.md's "Touching
      anything security-sensitive"

## Anything reviewers should know

<!--
Anything you're unsure about, deliberately left out, or want a second
opinion on. Delete this section if there's nothing here.
-->
