#!/bin/sh
# Forward one hook event from a non-Claude-Code tool (Cursor, GitHub Copilot
# CLI) to the cupola daemon. This is hook.sh's own pid-walk/pane/curl logic,
# factored out so Cursor and Copilot's hook configs can each reference the
# SAME script instead of three near-identical copies -- see hook.sh's own
# header for why every property below (1s cap, discarded output, always
# exit 0) is load-bearing, not stylistic. It applies here unchanged: this
# also runs on the critical path of another tool's own tool calls.
#
# Usage: adapter.sh <tool> <event>
#   tool   a short tag ("cursor", "copilot") -- becomes /hook?tool=<tool>,
#          and the substring adapter.sh greps the process tree for below.
#   event  the CANONICAL (Claude-Code-shaped) event name for the entry this
#          is registered under, e.g. "PreToolUse", "SessionStart", "Stop" --
#          hardcoded per hooks.json entry, not parsed from the payload. See
#          server.js's normalizeToolHook() comment for why: every tool
#          names its own events differently and inconsistently, but a hook
#          entry registered under one of that tool's OWN events always
#          fires for that event and only that one, so the config wiring it
#          up already knows the answer with certainty.
#
# UNTESTED against a live Cursor or Copilot install -- built from each
# tool's current documentation (linked in README's "Other tools" section),
# not verified hands-on the way hook.sh/Claude Code's own integration is.
# If events aren't showing up, the most likely culprit is a payload field
# name that doesn't match what's actually sent -- see server.js's
# normalizeToolHook() and TOOL_NAME_MAPS, which is where that mapping lives.
exec >/dev/null 2>&1

tool="$1"
event="$2"

pid=""
p=$PPID
i=0
while [ "$i" -lt 6 ] && [ -n "$p" ] && [ "$p" != "0" ] && [ "$p" != "1" ]; do
  case "$(ps -o comm= -p "$p" 2>/dev/null)" in
    *"$tool"*) pid=$p; break ;;
  esac
  p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
  i=$((i + 1))
done

# Pane ids look like "%5"; a bare % is an invalid percent-escape in a query.
pane=$(printf '%s' "${TMUX_PANE:-}" | sed 's/%/%25/g')

curl -s -m 1 -X POST -H 'Content-Type: application/json' \
     --data-binary @- \
     "http://127.0.0.1:${PORT:-7777}/hook?tool=${tool}&event=${event}&pid=${pid}&pane=${pane}"
exit 0
