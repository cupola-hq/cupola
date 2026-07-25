#!/bin/sh
# Forward one Claude Code hook event to the cupola daemon.
#
# This runs on the critical path of every tool call, so it must never block or
# fail Claude Code: 1s cap, output discarded, always exit 0 even if the daemon
# is down. A PreToolUse hook can only block a call by exiting 2 or printing a
# permissionDecision on stdout -- this does neither, so it cannot deny anything.
#
# It reports two things nothing else on the machine knows:
#
#   pid   the claude process that owns this session. The transcript has no pid,
#         ~/.claude/session-env is empty, and cwd is ambiguous (two sessions
#         routinely share a worktree). The hook is a child of the session, so it
#         walks up its own process tree to find out.
#
#   pane  the tmux pane the session lives in, if any. $TMUX_PANE is inherited
#         from the pane, so it needs no lookup. This is what makes answering a
#         question and /clear possible: tmux send-keys types into the pane's tty,
#         which is otherwise unreachable (macOS disables TIOCSTI).
exec >/dev/null 2>&1

pid=""
p=$PPID
i=0
while [ "$i" -lt 6 ] && [ -n "$p" ] && [ "$p" != "0" ] && [ "$p" != "1" ]; do
  case "$(ps -o comm= -p "$p" 2>/dev/null)" in
    *claude*) pid=$p; break ;;
  esac
  p=$(ps -o ppid= -p "$p" 2>/dev/null | tr -d ' ')
  i=$((i + 1))
done

# Pane ids look like "%5"; a bare % is an invalid percent-escape in a query.
pane=$(printf '%s' "${TMUX_PANE:-}" | sed 's/%/%25/g')

# server.js honours $PORT (default 7777); this must match or every hook lands
# on a dead port and the house silently stops updating -- no stdout, no exit
# code, nothing to notice. install-hooks.js bakes the port into the registered
# command as a leading PORT=<n> assignment, so it's normally already in our
# environment; ${PORT:-7777} covers running hook.sh by hand too.
curl -s -m 1 -X POST -H 'Content-Type: application/json' \
     --data-binary @- "http://127.0.0.1:${PORT:-7777}/hook?pid=$pid&pane=$pane"
exit 0
