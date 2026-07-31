#!/usr/bin/env node
'use strict';

// cupola -- an ambient view of your live Claude Code sessions.
//
// Two data sources, because neither is sufficient alone:
//
//   hooks (live truth)  Claude Code POSTs here on every state transition.
//                       This is the ONLY way to know a session is working RIGHT
//                       NOW or has a question on screen. Verified: the transcript
//                       is written retroactively -- a tool_use record appears only
//                       after the tool finishes, so a session mid-Bash and a session
//                       sitting idle are byte-identical on disk.
//
//   jsonl (identity)    ~/.claude/projects/**/<id>.jsonl carries ai-title,
//                       last-prompt, cwd, gitBranch. Great for names and detail,
//                       useless for liveness.
//
// Sessions seen only in the jsonl (started before the daemon, or before hooks were
// installed) still appear -- they just can't show live chores.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync, execFile } = require('child_process');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const PORT = Number(process.env.PORT) || 7777;

// S1-c, second half. The Origin/Host guard below closes the case where a
// browser sends an attacker Origin -- but it deliberately ALLOWS requests with
// no Origin header at all (curl, hook.sh), and that's also the shape of a
// same-origin `fetch` a drive-by page can spoof with `Origin: null` handling
// or plain non-browser tooling pointed at 127.0.0.1. A random token minted
// once per boot and handed ONLY to the page this daemon itself serves closes
// that hole: a cross-origin page can neither read it (no cross-origin
// response access) nor guess it (16 random bytes). Restarting the daemon
// mints a new one on purpose -- any tab holding the old token loses write
// access until it reloads.
const TOKEN = crypto.randomBytes(16).toString('hex');

const TAIL_BYTES = 256 * 1024;          // biggest transcript here is >20MB
const ACTIVE_WINDOW_MS = Number(process.env.WINDOW_MIN || 120) * 60 * 1000;
const STALE_MS = Number(process.env.STALE_MIN || 10) * 60 * 1000;
const HOOK_TTL_MS = 5 * 60 * 1000;      // a 'working' claim older than this is a lie
const POLL_MS = 2000;

const WORKING = 'working';
const BLOCKED = 'blocked';
const IDLE = 'idle';
const STALE = 'stale';

const CHORES = {
  Read: 'reading', Grep: 'reading', Glob: 'reading', NotebookRead: 'reading',
  Edit: 'watering', Write: 'watering', MultiEdit: 'watering', NotebookEdit: 'watering',
  Bash: 'cooking', BashOutput: 'cooking', KillShell: 'cooking',
  WebFetch: 'window', WebSearch: 'window',
  Agent: 'phone', Task: 'phone', SendMessage: 'phone',
  TodoWrite: 'tidying', TaskCreate: 'tidying', TaskUpdate: 'tidying',
};

// THEMES.md §1's fix for the one leak in an otherwise theme-agnostic daemon:
// `chore` is house vocabulary (kitchen-metaphor names) baked into a payload
// that a non-house theme has no business branching on. `activity` is the
// same six-way split, named neutrally, added BESIDE chore rather than
// replacing it -- the shipped client keys STATIONS/PROPS on `chore`, so
// dropping it buys nothing and breaks the running house. New code (the
// theme contract included) speaks `activity` only.
const CHORE_ACTIVITY = {
  reading: 'read', watering: 'edit', cooking: 'exec',
  window: 'net', phone: 'delegate', tidying: 'plan',
};
function activityOf(chore) { return CHORE_ACTIVITY[chore] || (chore ? 'plan' : null); }

// ---- other tools' hooks, normalized to Claude Code's own event shape --------
// Cupola's hook contract (session_id/hook_event_name/tool_name/tool_input/
// message) is Claude Code's own hook payload shape, passed through hook.sh
// unmodified. Cursor (1.7+) and GitHub Copilot CLI (GA Feb 2026) both ship
// comparable hook systems now, but neither speaks this exact shape, so a
// same-origin adapter script for each tool POSTs its OWN native payload to
// /hook?tool=cursor|copilot&event=<CanonicalEventName>&pid=&pane=, and this
// function translates it into the shape onHook() already understands --
// onHook() itself never needs to know a non-Claude source exists.
//
// `event` arrives as an explicit query param, hardcoded per hook
// registration (see hooks/cursor-hooks.json, hooks/copilot-hooks.json),
// rather than parsed out of each tool's own payload -- every tool names its
// events differently and inconsistently (Cursor: lowerCamelCase like
// "beforeShellExecution"; Copilot: mixed casing across docs), but a hook
// registered under a specific event in that tool's OWN hooks.json always
// fires for that (and only that) event, so the config that wires the hook up
// already knows the answer with certainty -- no need to infer it from a
// payload whose exact shape wasn't independently verified against a live
// install of either tool (neither CLI was available to test against; see
// the README caveat).
//
// KNOWN GAP, stated plainly rather than silently guessed around: neither
// tool's documented hook set includes a confirmed equivalent of Claude
// Code's `Notification` event (permission prompts / idle-waiting -- the
// hand-raise, the single most important signal in this whole product). So
// TOOL_EVENT_MAP below has no 'blocked' entry for either source: a Cursor or
// Copilot session can currently show working/idle/stale, but not reliably
// "needs you", until a real equivalent is confirmed. Don't invent one.
const TOOL_NAME_MAPS = {
  // Cursor's own tool_name values (from its preToolUse/postToolUse payload)
  // -> Claude Code's canonical names, so the existing CHORES table (which
  // only knows Claude's vocabulary) keeps working unchanged. Only "Shell" is
  // confirmed from Cursor's own docs; the rest are reasonable guesses at
  // Cursor's likely naming (mirroring its beforeReadFile/afterFileEdit hook
  // names) and are NOT independently confirmed.
  cursor: {
    Shell: 'Bash', Read: 'Read', Edit: 'Edit', Write: 'Edit',
    WebSearch: 'WebSearch', WebFetch: 'WebFetch',
  },
  // Copilot CLI's toolName values are documented lowercase ("bash" was the
  // one confirmed example). Same caveat: only "bash" is confirmed, the rest
  // are inferred from Copilot's own tool set and not independently verified.
  copilot: {
    bash: 'Bash', edit: 'Edit', write: 'Edit', read: 'Read',
    websearch: 'WebSearch', webfetch: 'WebFetch', task: 'Task',
  },
};

// Only the two events actually confirmed to reach a plain command hook with
// a usable, documented payload shape for each tool -- see the doc links in
// README's "Other tools" section. Extending this needs a live install of
// the tool to confirm the payload shape, not just its docs.
const SUPPORTED_TOOL_EVENTS = {
  cursor: new Set(['SessionStart', 'SessionEnd', 'PreToolUse', 'PostToolUse', 'Stop']),
  copilot: new Set(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd']),
};

function normalizeToolHook(tool, event, body) {
  if (!SUPPORTED_TOOL_EVENTS[tool] || !SUPPORTED_TOOL_EVENTS[tool].has(event)) return null;
  const nameMap = TOOL_NAME_MAPS[tool] || {};
  const e = body || {};

  if (tool === 'cursor') {
    const rawTool = e.tool_name || (event === 'PreToolUse' || event === 'PostToolUse' ? 'Shell' : null);
    return {
      session_id: e.conversation_id,
      hook_event_name: event,
      tool_name: rawTool ? (nameMap[rawTool] || rawTool) : undefined,
      tool_input: e.tool_input || (e.command ? { command: e.command } : undefined),
      cwd: e.cwd || (Array.isArray(e.workspace_roots) ? e.workspace_roots[0] : null) || undefined,
    };
  }
  if (tool === 'copilot') {
    const rawTool = e.toolName;
    return {
      session_id: e.sessionId,
      hook_event_name: event,
      tool_name: rawTool ? (nameMap[rawTool] || rawTool) : undefined,
      tool_input: e.toolInput || e.toolResult,
      cwd: e.cwd || undefined,
    };
  }
  return null;
}

// ---- roster: who is actually running ----------------------------------------
// `claude agents --json` is authoritative and answers what the filesystem can't:
// which sessions EXIST right now, their pid, and busy-vs-idle. Before adopting
// it this house showed 7 dead sessions, missed 4 live ones, rendered a busy
// session asleep on the couch, and had discovered exactly 1 pid out of 11.
//
// It does NOT replace the other two sources, it re-tiers them:
//   CLI        roster, pid, busy/idle          (authoritative, coarse)
//   hooks      which tool, the pending question (fine-grained, live)
//   transcript title, prompts, tokens, model    (identity, lagging)
//
// Refreshed on a timer rather than per-scan: it forks a Node CLI (~200ms+) and
// scan() runs every 2s.
const roster = new Map();          // sessionId -> { pid, cwd, status, name, startedAt }
let rosterOk = false;

function refreshRoster() {
  execFile('claude', ['agents', '--json'], { timeout: 5000 }, (err, stdout) => {
    if (err) { rosterOk = false; return; }   // old CLI, or not on PATH: fall back to files
    let list;
    try { list = JSON.parse(stdout); } catch { rosterOk = false; return; }
    if (!Array.isArray(list)) { rosterOk = false; return; }
    roster.clear();
    for (const a of list) if (a && a.sessionId) roster.set(a.sessionId, a);
    rosterOk = true;
    discoverPanes();      // 3.3: make tmux sessions answerable before their first hook
    broadcast(false);
  });
}

// sessionId -> live state pushed by hooks
const live = new Map();
// sessionId -> pid of the owning claude process, reported by the hook.
// Outlives `live` so a quiet session can still be evicted.
const pids = new Map();
// sessionId -> tmux pane id (e.g. "%5"), if the session runs under tmux.
const panes = new Map();
// Sessions the user has shown out of the house. Not persisted: a dismissed
// session reappears next daemon start, which is the safe default for a view.
const dismissed = new Set();

// Never signal a pid without confirming it is still a claude process: pids get
// recycled, and the wrong SIGTERM kills something the user cares about.
//
// Windows has no `ps` -- Git Bash/MSYS ships one, but it doesn't understand
// `-o`/`-p` (BSD/GNU syntax) and answers with its own MSYS-subsystem pid
// numbering anyway, not the Windows pid Node and the CLI agree on. `ps -o
// command= -p <pid>` there just throws "unknown option", the catch below
// swallows it, and every eviction failed with "not a claude process" --
// even for a real one.
//
// A path/command-line regex (tried first) turns out actively unsafe on
// Windows, not just inconvenient: this CLI ships as a standalone
// `claude.exe` (verified against a real install, `~/.local/bin/claude.exe`)
// -- but the Claude desktop app is ALSO `Claude.exe`, and Windows filenames
// are case-insensitive, so any "does the path contain claude.exe" test
// matches both. On a machine running both (the common case, not a corner
// one), a recycled pid landing on a desktop-app helper process -- crashpad
// handler, gpu-process, a renderer -- would sail right through the guard
// it exists to be. Query the exe's own embedded product name instead
// (`Product`, from its Win32 version resource): the CLI reports "Claude
// Code", the desktop app just "Claude" -- an authoritative distinction
// neither install path nor process name can fake.
function isClaude(pid) {
  if (!pid || !Number.isInteger(pid) || pid <= 1) return false;
  try {
    if (process.platform === 'win32') {
      // A pid that's already gone (the common, expected case on the 4s
      // recheck below) makes PowerShell print an error -- stdio here keeps
      // that off the daemon's own console instead of spamming it every
      // eviction; stdout (the actual answer) is still captured either way.
      const out = execFileSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `(Get-Process -Id ${pid} -ErrorAction Stop).Product`,
      ], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      return out.trim() === 'Claude Code';
    }
    const out = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' });
    return /(^|\/)claude(\s|$)/.test(out.trim());
  } catch {
    return false; // no such process
  }
}

function alive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// ---- request origin gate -----------------------------------------------------
// Binding to loopback is NOT access control. A POST with Content-Type text/plain
// is a "simple request": no CORS preflight, so any page you visit can fire one
// at 127.0.0.1 and the browser sends it. Without this, evil.example.com could
// SIGTERM your sessions or type into them, and CORS would never object because
// the attacker doesn't need to read the response.
//
// Browsers always attach Origin to POST, and script cannot forge it. A missing
// Origin means it isn't a browser cross-site request (curl, the hook) -- those
// are already local by loopback.
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

function hostOk(req) {
  // DNS rebinding: an attacker's domain can resolve to 127.0.0.1, and then the
  // Origin check passes because it's now "same origin". The Host header is what
  // catches that -- it carries the name the browser dialled, not the IP.
  const h = (req.headers.host || '').replace(/:\d+$/, '');
  return LOCAL_HOSTS.has(h);
}

function originOk(req) {
  const o = req.headers.origin;
  if (!o) return true;              // not a browser cross-site request
  try { return LOCAL_HOSTS.has(new URL(o).hostname); } catch { return false; }
}

// The residual hole Origin/Host can't close: a request with no Origin header
// (curl, or any tooling that just points at 127.0.0.1) sails through
// originOk() by design. TOKEN is minted at boot and embedded only in the
// index.html this daemon serves, so only the page it actually served can
// present it -- a drive-by page has no way to read or guess it.
function tokenOk(req) {
  const t = req.headers['x-sim-token'];
  return typeof t === 'string' && t.length === TOKEN.length
    && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(TOKEN));
}

// Anything that mutates a session must pass all three. One error shape for
// every failure reason on purpose -- telling an attacker which check failed
// (bad origin vs. bad/missing token) is free reconnaissance.
function guard(req, res) {
  if (hostOk(req) && originOk(req) && tokenOk(req)) return true;
  res.writeHead(403, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: 'cross-origin request refused' }));
  return false;
}

// ---- tmux --------------------------------------------------------------------
// send-keys types into a pane's tty. If a pane is NOT the session we think it
// is, we'd be typing text straight into a shell prompt -- i.e. running whatever
// the user typed as a command. So every write is gated on proving the pane
// actually hosts that session's claude process.

function tmux(args) {
  return execFileSync('tmux', args, { encoding: 'utf8', timeout: 2000 });
}

function paneExists(pane) {
  if (!pane || !/^%\d+$/.test(pane)) return false;   // pane ids are %<digits>
  try {
    return tmux(['list-panes', '-a', '-F', '#{pane_id}']).split('\n').includes(pane);
  } catch {
    return false; // no tmux server, or tmux not installed
  }
}

// Walk up from the session's claude pid; if we reach the pane's own process,
// the pane really does host this session.
function paneOwnsPid(pane, pid) {
  if (!paneExists(pane) || !pid) return false;
  let panePid;
  try { panePid = Number(tmux(['display-message', '-p', '-t', pane, '#{pane_pid}']).trim()); }
  catch { return false; }
  if (!panePid) return false;

  let p = Number(pid);
  for (let i = 0; i < 8 && p > 1; i++) {
    if (p === panePid) return true;
    try { p = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(p)], { encoding: 'utf8' }).trim()); }
    catch { return false; }
  }
  return false;
}

// PLAN 3.3, server half. Until now a pane was only learned when a session fired
// a hook carrying $TMUX_PANE -- so a freshly-started tmux session sitting at the
// prompt was NOT answerable, which is precisely when you most want to answer it.
// The roster gives us every session's pid, so walk each one up to see whether it
// lands in a tmux pane. No endpoint, no new attack surface (3.3's ⚠S), and it
// works for ANY tmux session, not just ones born via `cupola new`.
function discoverPanes() {
  if (!rosterOk || roster.size === 0) return;
  let lines;
  try { lines = tmux(['list-panes', '-a', '-F', '#{pane_id} #{pane_pid}']).trim().split('\n'); }
  catch { return; }                       // no tmux server running: nothing to find

  const paneByPid = new Map();
  for (const l of lines) {
    const [pane, pid] = l.trim().split(/\s+/);
    if (pane && pid) paneByPid.set(Number(pid), pane);
  }
  if (!paneByPid.size) return;

  for (const [id, agent] of roster) {
    if (panes.has(id) || !agent.pid) continue;
    let p = Number(agent.pid);
    for (let i = 0; i < 8 && p > 1; i++) {
      if (paneByPid.has(p)) { panes.set(id, paneByPid.get(p)); break; }
      try { p = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(p)], { encoding: 'utf8' }).trim()); }
      catch { break; }
    }
  }
}

// scan() runs every 2s over every session; verifying a pane costs a couple of
// tmux calls plus a ps walk, and the answer almost never changes. Cache it for
// display only -- an actual write always re-verifies via paneOwnsPid directly.
const paneCheck = new Map();
function paneOwnsPidCached(pane, pid) {
  const k = `${pane}:${pid}`;
  const hit = paneCheck.get(k);
  if (hit && Date.now() - hit.ts < 30000) return hit.ok;
  const ok = paneOwnsPid(pane, pid);
  paneCheck.set(k, { ok, ts: Date.now() });
  return ok;
}

// Type into a session's pane. Literal text first (-l, so nothing is interpreted
// as a tmux key name), then Enter as a separate key.
function sendToPane(pane, pid, text, { enter = true } = {}) {
  if (!paneOwnsPid(pane, pid)) throw new Error(`pane ${pane} does not host pid ${pid}`);
  if (text) tmux(['send-keys', '-t', pane, '-l', text]);
  if (enter) tmux(['send-keys', '-t', pane, 'Enter']);
}

// Read the pane back. This is the real prize: the Notification hook gives a
// one-line summary, but the pane has the actual question as rendered.
function capturePane(pane, pid) {
  if (!paneOwnsPid(pane, pid)) throw new Error(`pane ${pane} does not host pid ${pid}`);
  return tmux(['capture-pane', '-p', '-t', pane]);
}

// ---- focus a session's terminal window --------------------------------------
// The single most-requested move: click a visitor -> its real terminal window
// jumps to the front. Two tiers, tried in order:
//   tmux  select the pane/window inside tmux (so the right pane is current),
//         then activate the terminal app hosting the attached client. Reliable:
//         tmux knows exactly which pane, and select-window guarantees it's shown.
//   pid   walk up the session's process tree to the owning terminal app and
//         activate it. Best-effort: an app-level activate needs NO Accessibility
//         permission; singling out one window among several would.
//
// Injection-safe throughout, same bar as /api/say and banner(): the session id
// is validated against known sessions and only ever indexes our own maps, so
// nothing from the client reaches a shell; osascript gets its one argument via
// argv (item 1 of argv), never string interpolation -- an app name is a fixed
// whitelist value here anyway, but the argv form makes it structurally safe.
const CAN_FOCUS = process.platform === 'darwin';

// Basename of an ancestor process's executable -> the macOS app to `activate`.
const TERMINAL_APPS = [
  { rx: /(^|\/)iTerm2?$/,            app: 'iTerm2' },
  { rx: /(^|\/)Terminal$/,           app: 'Terminal' },
  { rx: /(^|\/)ghostty$/i,           app: 'Ghostty' },
  { rx: /(^|\/)alacritty$/i,         app: 'Alacritty' },
  { rx: /(^|\/)wezterm(-gui)?$/i,    app: 'WezTerm' },
  { rx: /(^|\/)kitty$/i,             app: 'kitty' },
  { rx: /(^|\/)Hyper$/i,             app: 'Hyper' },
  { rx: /Code Helper|(^|\/)Electron$|Visual Studio Code/, app: 'Visual Studio Code' },
];

// Walk up from a pid looking for a known terminal binary among its ancestors.
function terminalAppForPid(pid) {
  let p = Number(pid);
  for (let i = 0; i < 24 && p > 1; i++) {
    let comm;
    try { comm = execFileSync('ps', ['-o', 'comm=', '-p', String(p)], { encoding: 'utf8' }).trim(); }
    catch { break; }
    for (const t of TERMINAL_APPS) if (t.rx.test(comm)) return t.app;
    try { p = Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(p)], { encoding: 'utf8' }).trim()); }
    catch { break; }
  }
  return null;
}

// The terminal hosting a tmux pane is the ancestor of the CLIENT attached to
// that pane's session (the `tmux attach` process running inside the terminal),
// NOT the tmux server -- that's daemonised and has no window. A detached session
// has no client, hence no window to focus, and this returns null.
function terminalAppForPane(pane) {
  let sess;
  try { sess = tmux(['display-message', '-p', '-t', pane, '#{session_name}']).trim(); }
  catch { return null; }
  if (!sess) return null;
  let clientPids;
  try { clientPids = tmux(['list-clients', '-t', sess, '-F', '#{client_pid}']).trim().split('\n').filter(Boolean); }
  catch { return null; }
  for (const cp of clientPids) {
    const app = terminalAppForPid(Number(cp));
    if (app) return app;
  }
  return null;
}

// osascript `tell application <name> to activate`. App-level, so no Accessibility
// permission is needed. argv form (never string interpolation) for the same
// reason banner() uses it.
function activateApp(app, cb) {
  execFile('osascript', ['-e',
    'on run argv\n' +
    ' tell application (item 1 of argv) to activate\n' +
    'end run', String(app)],
    { timeout: 4000 }, (err) => cb(!err));
}

function readTail(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    if (size > TAIL_BYTES) lines.shift(); // partial first line
    const recs = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try { recs.push(JSON.parse(line)); } catch {}
    }
    return recs;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch {}
  }
}

function blocks(rec) {
  const c = rec && rec.message && rec.message.content;
  return Array.isArray(c) ? c : [];
}

// A subagent's own transcript never says what it was FOR -- but the parent that
// spawned it does. The parent records an Agent tool_use (description + model),
// and the tool_result echoes back `agentId: <id>`. Joining those gives each
// guest a real name ("Build the fx layer") instead of a truncated prompt.
function spawnsIn(recs, parentId, parentRoom) {
  const byToolId = new Map(), out = new Map();
  for (const r of recs) {
    for (const b of blocks(r)) {
      if (b.type === 'tool_use' && b.name === 'Agent') {
        byToolId.set(b.id, b.input || {});
      } else if (b.type === 'tool_result' && byToolId.has(b.tool_use_id)) {
        const m = /agentId:\s*([a-z0-9]+)/.exec(JSON.stringify(b.content) || '');
        if (!m) continue;
        const i = byToolId.get(b.tool_use_id);
        out.set('agent-' + m[1], {
          desc: i.description || null, model: i.model || null,
          type: i.subagent_type || null, parentId, parentRoom,
        });
      }
    }
  }
  return out;
}

// How long a subagent's transcript can go quiet before we call it finished.
// Unlike an interactive session -- which can idle for hours and is why file age
// was such a bad liveness signal -- a subagent tool-calls continuously from
// birth to death, so a quiet file really does mean it's gone.
const SUBAGENT_TTL_MS = 90 * 1000;

function identity(recs) {
  let title = null, lastPrompt = null, cwd = null, gitBranch = null;
  for (const r of recs) {
    if (r.type === 'ai-title' && r.aiTitle) title = r.aiTitle;
    if (r.type === 'last-prompt' && r.lastPrompt) lastPrompt = r.lastPrompt;
    if (r.cwd) cwd = r.cwd;
    if (r.gitBranch) gitBranch = r.gitBranch;
  }

  // The last thing Claude actually said. Safe to read from the transcript --
  // it's written once a turn completes, which is exactly when this exists.
  // (Liveness isn't readable this way; a finished message is.)
  let lastResponse = null, contextTokens = 0, model = null;
  for (let i = recs.length - 1; i >= 0; i--) {
    const r = recs[i];
    // isSidechain skipped on purpose: a subagent may run a different model, but
    // the visitor represents the main session, not its helpers.
    if (r.type !== 'assistant' || r.isSidechain) continue;
    if (!model && r.message && r.message.model) model = r.message.model;

    // How much context this session is carrying. Everything the model was fed
    // on its last turn: fresh input + whatever came from (or went into) cache.
    if (!contextTokens) {
      const u = (r.message && r.message.usage) || {};
      contextTokens = (u.input_tokens || 0)
        + (u.cache_read_input_tokens || 0)
        + (u.cache_creation_input_tokens || 0);
    }
    if (!lastResponse) {
      const text = blocks(r).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (text) lastResponse = text;
    }
    if (lastResponse && contextTokens && model) break;
  }

  return { title, lastPrompt, cwd, gitBranch, lastResponse, contextTokens, model };
}

// Dress by model. Matched on substring, not exact id, so date-stamped and
// suffixed variants (claude-opus-4-8[1m], claude-haiku-4-5-20251001) still land.
function tier(model) {
  if (!model) return 'plain';
  const m = model.toLowerCase();
  if (m.includes('haiku')) return 'haiku';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('opus')) return 'opus';
  if (m.includes('fable')) return 'fable';
  return 'plain';
}

// How heavy a session has got, 0..1. Log-scaled on purpose: real sessions on
// this machine span 27k..675k tokens and cluster low, so a linear ramp leaves
// everything under 200k looking identically clean.
const CTX_MIN = 20000, CTX_MAX = 800000;
function heft(tokens) {
  if (!tokens || tokens <= CTX_MIN) return 0;
  const t = Math.log(tokens / CTX_MIN) / Math.log(CTX_MAX / CTX_MIN);
  return Math.max(0, Math.min(1, t));
}

// Visitors need names, not addresses. Two sessions can share a worktree AND a
// branch (wt5 runs two on dea-767), so the room can't identify anyone -- and
// "wt5 needs you" is useless when there are two of them.
const NAMES = [
  'Ada', 'Bo', 'Cy', 'Dot', 'Eli', 'Fen', 'Gus', 'Hal', 'Ida', 'Jo',
  'Kit', 'Lou', 'Mo', 'Nell', 'Ora', 'Pip', 'Quinn', 'Roz', 'Sal', 'Tex',
  'Uma', 'Vic', 'Wren', 'Xan', 'Yuri', 'Zed', 'Ari', 'Bea', 'Cleo', 'Dex',
  'Ember', 'Fitz', 'Gil', 'Hux', 'Iris', 'Jem', 'Koa', 'Lark', 'Milo', 'Nix',
  'Otis', 'Poe', 'Reed', 'Sage', 'Tao', 'Vale', 'Wes', 'Zola',
];

function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// id -> name, held for as long as the session is in the house.
//
// The name MUST NOT depend on who else is present. A pure hash collides far too
// often to be usable (48 names, 13 sessions => ~83% chance of a duplicate), so
// collisions have to be probed -- but probing against the live set means one
// visitor leaving renames the others, which is exactly what a name is for.
// Assign once, then keep it; only release when the session actually leaves.
const assigned = new Map();

function assignNames(list) {
  const present = new Set(list.map(s => s.id));
  for (const id of [...assigned.keys()]) if (!present.has(id)) assigned.delete(id);

  const taken = new Set(assigned.values());
  for (const s of list) {
    if (assigned.has(s.id)) { s.name = assigned.get(s.id); continue; }
    const start = hashStr(s.id) % NAMES.length;
    let name = null;
    for (let i = 0; i < NAMES.length && !name; i++) {
      const cand = NAMES[(start + i) % NAMES.length];
      if (!taken.has(cand)) name = cand;
    }
    name = name || s.id.slice(0, 4);   // more visitors than names
    assigned.set(s.id, name); taken.add(name);
    s.name = name;
  }
}

function shortCwd(cwd, slug) {
  if (cwd) return path.basename(cwd);
  return slug.split('-').filter(Boolean).pop() || slug;
}

function roomOf(cwd, slug) {
  const m = /worktrees[/-](wt\d+)/.exec(cwd || slug);
  return m ? m[1] : shortCwd(cwd, slug);
}

function describeTool(name, input) {
  const i = input || {};
  const arg = i.file_path || i.path || i.command || i.pattern || i.url || i.description || '';
  // Heredocs and chained commands arrive with newlines; collapse to one line.
  const short = String(arg)
    .replace(os.homedir(), '~')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 70);
  return short ? `${name}(${short})` : name;
}

function scan() {
  // A brand-new machine (or, tellingly, any fresh CI runner -- this exact
  // gap shipped once already and only broke in CI, never locally, because
  // every local dev machine already has real Claude Code history) has no
  // ~/.claude/projects at all yet. That used to `return []` immediately,
  // which happened to be harmless when the jsonl scan below was the ONLY
  // source of session rows -- but it silently skipped the roster tier and
  // the hook-only tier too, both of which have nothing to do with this
  // directory existing. `dirs = []` instead of an early return: the jsonl
  // loop below just does zero iterations, and every other tier still runs.
  let dirs;
  try { dirs = fs.readdirSync(PROJECTS); } catch { dirs = []; }

  const now = Date.now();
  const out = [];
  const agentFiles = [];          // subagent transcripts, built after the main pass
  const spawns = new Map();       // agent-<id> -> { desc, model, type, parentId, parentRoom }

  for (const d of dirs) {
    const dir = path.join(PROJECTS, d);
    let files;
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch { continue; }

    // Subagent transcripts are NOT beside their parent's -- they live at
    //   <project>/<parentSessionId>/subagents/agent-<id>.jsonl
    // two levels down, which is why a top-level-only scan never saw one. The
    // path is also the parentage: the directory IS the parent's session id, so
    // no spawn-parsing is needed to know whose guest this is.
    for (const sub of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const sdir = path.join(dir, sub.name, 'subagents');
      let sfiles;
      try { sfiles = fs.readdirSync(sdir).filter(f => f.startsWith('agent-') && f.endsWith('.jsonl')); }
      catch { continue; }
      for (const sf of sfiles) {
        const sfile = path.join(sdir, sf);
        let sst; try { sst = fs.statSync(sfile); } catch { continue; }
        if (sst.size === 0) continue;
        // Cheap gate before any read: most of these are long-dead history.
        if (now - sst.mtimeMs > SUBAGENT_TTL_MS) continue;
        agentFiles.push({ id: sf.replace(/\.jsonl$/, ''), file: sfile, st: sst, parentId: sub.name });
      }
    }

    for (const f of files) {
      const file = path.join(dir, f);
      let st;
      try { st = fs.statSync(file); } catch { continue; }
      if (st.size === 0) continue;

      const id = f.replace(/\.jsonl$/, '');
      if (dismissed.has(id)) continue;
      // Subagents write their own agent-<id>.jsonl but are NOT in the roster
      // (it only reports kind:'interactive'). Collected here and built below --
      // the roster filter that killed 7 ghost sessions was also silently hiding
      // every subagent, so a session orchestrating five agents looked identical
      // to one doing nothing.
      if (id.startsWith('agent-')) { agentFiles.push({ id, file, st }); continue; }
      // The CLI is the roster. A session it doesn't list is over, however
      // recently its file was touched -- that heuristic was showing 7 corpses.
      if (rosterOk && !roster.has(id)) continue;
      const agent = roster.get(id);
      const hook = live.get(id);
      const fileAge = now - st.mtimeMs;

      // The age window is a proxy for "is this session still alive" -- and the
      // roster answers that outright. When the CLI vouches for a session it
      // belongs in the house however stale its file is: a live session idle for
      // three hours was being excluded for having an old transcript.
      const hookAge = hook ? now - hook.ts : Infinity;
      if (!agent && fileAge > ACTIVE_WINDOW_MS && hookAge > ACTIVE_WINDOW_MS) continue;

      const recs = readTail(file);
      if (!recs.length && !hook) continue;

      const id_ = identity(recs);
      const age = Math.min(fileAge, hookAge);
      // Harvest this session's Agent spawns so its guests can be named.
      for (const [k, v] of spawnsIn(recs, id, roomOf(id_.cwd, d))) spawns.set(k, v);

      let state, chore = null, question = null, detail = null, live_ = false;

      if (hook && hookAge < HOOK_TTL_MS) {
        live_ = true;
        state = hook.state;
        chore = hook.chore;
        question = hook.question;
        detail = hook.detail;
        // Deliberately NOT inferring "blocked" from a long-running tool call.
        // A 5-minute test suite fires PreToolUse then goes silent until it
        // finishes, which is indistinguishable from waiting on a permission
        // dialog -- but Notification already tells us the truth, so guessing
        // here would only produce false hands. A dead session's claim expires
        // via HOOK_TTL_MS and falls back to file age instead.
      } else if (agent) {
        // The CLI knows busy-vs-idle without any hook. It can't say WHICH tool
        // is running -- that's what the hook adds -- but it is never wrong about
        // whether the session is doing something.
        state = agent.status === 'busy' ? WORKING : IDLE;
        chore = agent.status === 'busy' ? (hook && hook.chore) || 'tidying' : null;
        detail = agent.status === 'busy' ? 'Working' : 'Waiting for you';
      } else {
        // No CLI, no hook. The transcript cannot distinguish working from
        // waiting, so claim neither -- only recency.
        state = age < STALE_MS ? IDLE : STALE;
      }

      // Resting means "quiet a long time", never "busy". A 15-minute test suite
      // used to put its session to sleep on the couch: the file goes untouched
      // while the tool runs, and file age was all this had to go on.
      const busy = agent ? agent.status === 'busy' : state === WORKING;
      if (state !== BLOCKED && !busy && age >= STALE_MS) state = STALE;

      // The CLI hands us the pid for every session; the hook only learns it once
      // that session happens to run a tool.
      if (agent && agent.pid) pids.set(id, agent.pid);
      const pid = pids.get(id) || null;
      const pane = panes.get(id) || null;
      out.push({
        id,
        project: d,
        room: roomOf(id_.cwd, d),
        label: id_.title || (id_.lastPrompt ? id_.lastPrompt.slice(0, 60) : null) || shortCwd(id_.cwd, d),
        state, chore, activity: activityOf(chore), question, detail, live: live_,
        lastPrompt: id_.lastPrompt,
        lastResponse: id_.lastResponse,
        cwd: id_.cwd,
        gitBranch: id_.gitBranch,
        contextTokens: id_.contextTokens,
        heft: Number(heft(id_.contextTokens).toFixed(3)),
        model: id_.model,
        tier: tier(id_.model),
        pid,
        pane,
        // Only offer eviction when there's a process we can actually verify.
        evictable: pid ? alive(pid) : false,
        // Only offer typing when we can prove the pane hosts this session.
        answerable: pane ? paneOwnsPidCached(pane, pid) : false,
        age,
      });
    }
  }

  // Subagents, as guests. They are the only place this machine has model
  // variety (10x opus interactive, while its helpers are sonnet and fable), and
  // a session orchestrating five of them currently looks like a session doing
  // nothing.
  //
  // Liveness is file age here, deliberately -- the heuristic that was so wrong
  // for interactive sessions is right for these: a subagent tool-calls
  // continuously from birth to death, so a quiet transcript really does mean
  // it's finished. When it goes quiet it drops out of the payload, and the
  // client walks it out of the front door and waves. Which is exactly what a
  // guest leaving should look like.
  for (const { id, file, st, parentId } of agentFiles) {
    if (dismissed.has(id)) continue;
    const recs = readTail(file);
    if (!recs.length) continue;
    // parentId comes from the directory; the spawn record adds the PURPOSE
    // ("Build the fx layer"), which the subagent's own transcript never states.
    const meta = spawns.get(id) || {};
    const parent = out.find(s => s.id === parentId);
    const id_ = identity(recs);

    // A subagent's file grows as it works, so its last tool_use IS its current
    // activity -- the retroactive-write problem that makes this impossible for
    // interactive sessions doesn't bite, because we only ever show a subagent
    // while its file is actively growing.
    let chore = null;
    for (let i = recs.length - 1; i >= 0 && !chore; i--) {
      if (recs[i].type !== 'assistant') continue;
      for (const b of blocks(recs[i])) if (b.type === 'tool_use') { chore = CHORES[b.name] || 'tidying'; break; }
    }

    const model = id_.model || meta.model || null;
    out.push({
      id,
      kind: 'subagent',
      parentId: meta.parentId || null,
      project: id_.cwd || '',
      room: meta.parentRoom || roomOf(id_.cwd, ''),
      label: meta.desc || id_.title || 'subagent',
      state: WORKING,                    // only ever in the house while working
      chore: chore || 'tidying',
      activity: activityOf(chore || 'tidying'),
      question: null,
      detail: meta.type ? `subagent · ${meta.type}` : 'subagent',
      live: true,
      lastPrompt: null,
      lastResponse: id_.lastResponse,
      cwd: id_.cwd || null,
      gitBranch: id_.gitBranch || null,
      contextTokens: id_.contextTokens,
      heft: Number(heft(id_.contextTokens).toFixed(3)),
      model,
      tier: tier(model),
      // No pid and no pane: a subagent is not a process we can signal, and
      // there is nothing to type into. Both buttons must stay off.
      pid: null, pane: null, evictable: false, answerable: false,
      age: now - st.mtimeMs,
    });
  }

  // A brand-new session has no transcript yet -- it hasn't been prompted, so
  // nothing has been written. The loop above is file-driven and cannot see it,
  // which is why 4 live sessions were missing from the house. The roster knows
  // they exist; add them with whatever the CLI gives us and no transcript detail.
  if (rosterOk) {
    for (const [id, agent] of roster) {
      if (dismissed.has(id) || out.some(s => s.id === id)) continue;
      const pid = agent.pid || null;
      if (pid) pids.set(id, pid);
      // Hooks outrank the roster here exactly as they do above. This branch used
      // to hardcode live:false and ignore them, so a session with no transcript
      // yet could not raise its hand -- and a fresh session sitting at the prompt
      // is the single most likely one to be waiting on you.
      const h = live.get(id);
      const fresh = h && (Date.now() - h.ts) < HOOK_TTL_MS;
      const pane = panes.get(id) || null;
      out.push({
        id,
        project: agent.cwd || '',
        room: roomOf(agent.cwd, agent.name || ''),
        label: agent.name || shortCwd(agent.cwd, '') || 'new session',
        state: fresh ? h.state : (agent.status === 'busy' ? WORKING : IDLE),
        chore: fresh ? h.chore : (agent.status === 'busy' ? 'tidying' : null),
        activity: activityOf(fresh ? h.chore : (agent.status === 'busy' ? 'tidying' : null)),
        question: fresh ? h.question : null,
        detail: fresh ? h.detail : (agent.status === 'busy' ? 'Working' : 'Just arrived — no prompt yet'),
        live: !!fresh,
        lastPrompt: null, lastResponse: null,
        cwd: agent.cwd || null, gitBranch: null,
        contextTokens: 0, heft: 0, model: null, tier: 'plain',
        pid, pane,
        evictable: pid ? alive(pid) : false,
        // This branch is roster-only sessions with no transcript yet -- exactly
        // what `cupola new` produces before the first prompt. It used to hardcode
        // `answerable: false` unconditionally, which meant a session was
        // permanently unanswerable for its entire pre-first-prompt life even
        // when its pane genuinely hosted it. Same proof as every other write
        // path: paneOwnsPidCached re-derives it from the pid/pane the roster
        // and discoverPanes() just gave us, never trusted blind.
        answerable: pane ? paneOwnsPidCached(pane, pid) : false,
        age: agent.startedAt ? Date.now() - agent.startedAt : 0,
      });
    }
  }

  // Hook-only sessions: the same "no transcript yet" problem the roster
  // tier above solves, one layer further down. That tier still needs the
  // roster (`claude agents --json`) to know the session exists at all --
  // fine for Claude Code, which the roster covers, but a Cursor or Copilot
  // session is invisible to both the jsonl scan AND that roster (neither
  // tool writes to ~/.claude/projects, and `claude agents` obviously
  // doesn't enumerate another vendor's sessions). A hook is the ONLY signal
  // that a non-Claude session exists at all, so this tier is the floor:
  // anything reporting live hook state that the two tiers above didn't
  // already claim gets a minimal row built from hook data alone -- no
  // title, no branch, no token count, because hooks carry none of that.
  for (const [id, h] of live) {
    if (dismissed.has(id) || out.some(s => s.id === id)) continue;
    if (now - h.ts >= HOOK_TTL_MS) continue; // a claim this old is a lie, same rule as everywhere else
    const pid = pids.get(id) || null;
    const pane = panes.get(id) || null;
    out.push({
      id,
      project: h.cwd || '',
      room: roomOf(h.cwd, h.tool || ''),
      label: shortCwd(h.cwd, h.tool || '') || `${h.tool || 'external'} session`,
      state: h.state, chore: h.chore, activity: activityOf(h.chore), question: h.question, detail: h.detail,
      live: true,
      lastPrompt: null, lastResponse: null,
      cwd: h.cwd || null, gitBranch: null,
      contextTokens: 0, heft: 0, model: null, tier: 'plain',
      source: h.tool || 'claude',
      pid, pane,
      evictable: pid ? alive(pid) : false,
      answerable: pane ? paneOwnsPidCached(pane, pid) : false,
      age: now - h.ts,
    });
  }

  out.sort((a, b) => a.id.localeCompare(b.id)); // stable => visitors don't teleport
  assignNames(out);
  return out;
}

// ---- hook intake -------------------------------------------------------------

function onHook(e, pid, pane, tool) {
  const id = e.session_id;
  if (!id) return;
  if (pid) pids.set(id, pid);
  if (pane) panes.set(id, pane); else panes.delete(id);
  // A session that reports in has clearly not been shown out.
  dismissed.delete(id);
  const ev = e.hook_event_name;
  const now = Date.now();
  const prev = live.get(id) || {};
  // `tool`/`cwd` exist for one reason: a Cursor or Copilot session has no
  // ~/.claude/projects/**/*.jsonl and never appears in `claude agents --json`
  // -- scan()'s two normal ways to discover a session ROW at all -- so it
  // needs a third path built from hook data alone (see the "hook-only"
  // fallback tier in scan(), below the roster-only one it mirrors). `tool`
  // defaults to 'claude' (the original, tested path) whenever the /hook
  // handler doesn't pass one, which today is never -- see its own comment.
  let s = {
    ts: now, state: WORKING, chore: prev.chore || 'tidying', question: null, detail: null,
    tool: tool || prev.tool || 'claude', cwd: e.cwd || prev.cwd || null,
  };

  switch (ev) {
    case 'SessionStart':
    case 'UserPromptSubmit':
      s.state = WORKING; s.chore = 'tidying'; s.detail = 'Getting started';
      break;
    case 'PreToolUse':
      s.state = WORKING;
      s.chore = CHORES[e.tool_name] || 'tidying';
      s.detail = describeTool(e.tool_name, e.tool_input);
      break;
    case 'PostToolUse':
      s.state = WORKING;
      s.chore = CHORES[e.tool_name] || 'tidying';
      s.detail = `Finished ${e.tool_name}`;
      break;
    case 'Notification':
      // Fires for permission prompts and for idle-waiting. This is the hand-raise.
      s.state = BLOCKED;
      s.question = e.message || 'Needs your input';
      s.detail = 'Claude Code notification';
      break;
    case 'Stop':
      s.state = IDLE; s.detail = 'Finished its turn';
      break;
    case 'SessionEnd':
      live.delete(id);
      return;
    default:
      return;
  }
  live.set(id, s);
}

// ---- server ------------------------------------------------------------------

// ---- ambient notifications ---------------------------------------------------
// The highest-value moment in this product is "a visitor raised a hand" -- and
// until now it only reached you if you happened to be looking at the tab. That
// is the entire case for a desktop shell, and it needs ~60 lines instead:
// http://localhost is a secure context (verified) so the page can badge itself,
// and osascript fires a real banner with no dependency at all. Electron was
// going to cost 100MB, a build step, signing, and `npx` to buy exactly this.
//
// Subtractive on purpose: ONLY a hand-raise fires. Not heft, not errors, not
// "session finished". A notifier that cries wolf gets muted, and then the one
// notification that mattered is missed too.
const NOTIFY = process.env.SIM_NOTIFY !== '0' && process.platform === 'darwin';
const NOTIFY_DEBOUNCE_MS = 5 * 60 * 1000;   // never re-nag for the same session
const NOTIFY_BATCH_MS = 1500;               // collapse a burst into one banner
let muted = false;
const notifiedAt = new Map();
let batch = [], batchTimer = null;

function banner(title, message, subtitle) {
  if (!NOTIFY || muted) return;
  // argv form, NOT string concatenation: `message` contains a model-authored
  // question. Interpolating it into AppleScript source would be an injection
  // hole -- verified that `"; do shell script "..."` arrives as inert data here.
  execFile('osascript', ['-e',
    'on run argv\n' +
    ' display notification (item 1 of argv) with title (item 2 of argv) subtitle (item 3 of argv)\n' +
    'end run', String(message).slice(0, 200), String(title), String(subtitle || '')],
    { timeout: 4000 }, () => {});
}

function flushBatch() {
  const list = batch; batch = []; batchTimer = null;
  if (!list.length) return;
  if (list.length === 1) {
    const s = list[0];
    banner('Someone needs you', `${s.name} — ${s.question || 'is waiting for input'}`,
           [s.room, s.label].filter(Boolean).join(' · ').slice(0, 80));
  } else {
    // A fleet-wide permission prompt would otherwise machine-gun 17 banners.
    banner(`${list.length} visitors need you`, list.map(s => s.name).join(', '), '');
  }
}

// Fired from broadcast() rather than the hook, because only here do we know the
// visitor's name, room and question -- the hook only carries a session id.
const prevState = new Map();
function detectHandRaises(sessions) {
  const live = new Set();
  for (const s of sessions) {
    live.add(s.id);
    const was = prevState.get(s.id);
    prevState.set(s.id, s.state);
    if (s.state !== 'blocked') { if (was === 'blocked') notifiedAt.delete(s.id); continue; }
    if (was === 'blocked') continue;                       // already raised
    if (Date.now() - (notifiedAt.get(s.id) || 0) < NOTIFY_DEBOUNCE_MS) continue;
    notifiedAt.set(s.id, Date.now());
    batch.push(s);
    if (!batchTimer) batchTimer = setTimeout(flushBatch, NOTIFY_BATCH_MS);
  }
  for (const id of [...prevState.keys()]) if (!live.has(id)) { prevState.delete(id); notifiedAt.delete(id); }
}

const clients = new Set();
let lastSig = '';

function broadcast(force) {
  const sessions = scan();
  // Before the change-detection early-out below: a hand-raise must fire even on
  // a frame the browser doesn't need, and `force` frames must not re-fire it.
  detectHandRaises(sessions);
  // Everything EXCEPT age, which ticks every second and would stream forever.
  //
  // Derived from the payload rather than a hand-listed subset on purpose: the
  // old list named seven fields and was never revisited, so every field added
  // later (model, tier, contextTokens, heft, lastResponse, pid, pane) was
  // invisible to change detection -- a /model switch with no other activity
  // never reached the browser at all. Deriving it means a new field can't be
  // forgotten.
  const sig = JSON.stringify(sessions.map(({ age, ...rest }) => rest));
  if (!force && sig === lastSig) return;
  lastSig = sig;
  const payload = `data: ${JSON.stringify({ t: Date.now(), sessions, canFocus: CAN_FOCUS })}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch {} }
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/hook')) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      let pid = null, pane = null;
      const m = /[?&]pid=(\d+)/.exec(req.url);
      if (m) pid = Number(m[1]);
      const pm = /[?&]pane=([^&]*)/.exec(req.url);
      if (pm && pm[1]) { try { pane = decodeURIComponent(pm[1]) || null; } catch {} }
      // Absent or explicit `tool=claude` -- the original, tested path:
      // Claude Code's own hook.sh POSTs its payload already shaped exactly
      // as onHook() expects, unmodified. Any other `tool=` value goes
      // through normalizeToolHook() first (see its comment for why `event`
      // is a separate, explicit query param rather than read off the body).
      const tm = /[?&]tool=([^&]*)/.exec(req.url);
      const tool = tm ? decodeURIComponent(tm[1]) : 'claude';
      const em = /[?&]event=([^&]*)/.exec(req.url);
      const event = em ? decodeURIComponent(em[1]) : null;
      try {
        const parsed = JSON.parse(body);
        const e = tool === 'claude' ? parsed : normalizeToolHook(tool, event, parsed);
        if (e) onHook(e, pid, pane, tool);
      } catch {}
      res.writeHead(204).end();   // never make Claude Code (or another tool) wait or fail
      broadcast(false);
    });
    return;
  }

  // Mute/unmute banners. Behind guard() deliberately: a drive-by page that could
  // silence your hand-raise alarms is an attack, not a preference.
  if (req.method === 'POST' && req.url === '/api/prefs') {
    if (!guard(req, res)) return;
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e4) req.destroy(); });
    req.on('end', () => {
      try { const r = JSON.parse(body); if (typeof r.muted === 'boolean') muted = r.muted; } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, muted, notifier: NOTIFY ? 'osascript' : 'off' }));
    });
    return;
  }

  // Read a session's pane back, so the house can show the question as the TUI
  // actually renders it rather than the hook's one-line summary.
  if (req.method === 'GET' && req.url.startsWith('/api/screen')) {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const pane = panes.get(id), pid = pids.get(id);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (!pane) return res.end(JSON.stringify({ ok: false, error: 'session is not running under tmux' }));
    try { res.end(JSON.stringify({ ok: true, pane, screen: capturePane(pane, pid) })); }
    catch (e) { res.end(JSON.stringify({ ok: false, error: String(e.message || e) })); }
    return;
  }

  // Type into a session: answer a question, or /clear it.
  if (req.method === 'POST' && req.url === '/api/say') {
    if (!guard(req, res)) return;
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      const reply = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      let r;
      try { r = JSON.parse(body); } catch { return reply(400, { ok: false, error: 'bad json' }); }
      if (!r.id) return reply(400, { ok: false, error: 'no session id' });

      const pane = panes.get(r.id), pid = pids.get(r.id);
      if (!pane) return reply(409, {
        ok: false,
        error: 'This session is not running under tmux, so there is no way to type into it. Start sessions inside tmux to answer from here.',
      });

      const text = typeof r.text === 'string' ? r.text : '';
      if (!text.trim()) return reply(400, { ok: false, error: 'nothing to say' });
      // Newlines would submit early and split one answer into several prompts.
      if (/[\r\n]/.test(text)) return reply(400, { ok: false, error: 'text must be a single line' });

      try {
        sendToPane(pane, pid, text);
        broadcast(true);
        return reply(200, { ok: true, pane, sent: text });
      } catch (e) {
        return reply(409, { ok: false, error: String(e.message || e) });
      }
    });
    return;
  }

  // Bring a session's real terminal window to the front. Guarded exactly like
  // /api/kick and /api/say: raising a window is lower-risk than typing or
  // killing, but a drive-by page must still not be able to make your terminal
  // jump around, so it sits behind the same Origin + Host check.
  if (req.method === 'POST' && req.url === '/api/focus') {
    if (!guard(req, res)) return;
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      const reply = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (!CAN_FOCUS) return reply(400, {
        ok: false, unsupported: true,
        error: 'Focusing a terminal is macOS-only for now.',
      });

      let r;
      try { r = JSON.parse(body); } catch { return reply(400, { ok: false, error: 'bad json' }); }
      if (!r.id || typeof r.id !== 'string') return reply(400, { ok: false, error: 'no session id' });

      // Client input never reaches a shell: the id only indexes our own maps and
      // must resolve to a session we already track. Unknown id -> nothing to do.
      const pane = panes.get(r.id) || null;
      const pid = pids.get(r.id) || (roster.get(r.id) && roster.get(r.id).pid) || null;
      if (!pane && !pid) return reply(404, { ok: false, error: 'unknown session — nothing to focus' });

      // Tier 1 -- tmux. Prove the pane hosts this session (same invariant as
      // every other pane write) before selecting it, bring its window/pane to
      // the front within tmux, then activate the terminal app hosting it.
      if (pane && paneOwnsPid(pane, pid)) {
        try {
          tmux(['select-window', '-t', pane]);
          tmux(['select-pane', '-t', pane]);
        } catch (e) { return reply(409, { ok: false, error: String(e.message || e) }); }
        const app = terminalAppForPane(pane);
        if (!app) return reply(200, {
          // The pane IS current now, so a later attach lands on it -- partial
          // success (detached session, or an unrecognised terminal), not failure.
          ok: true, method: 'tmux', app: null, selected: true,
          note: 'Selected the tmux pane, but its terminal window could not be identified (the session may be detached).',
        });
        return activateApp(app, ok => reply(200, { ok: true, method: 'tmux', app, selected: true, focused: ok }));
      }

      // Tier 2 -- pid fallback. Walk to the owning terminal app and activate it.
      if (pid) {
        const app = terminalAppForPid(pid);
        if (!app) return reply(409, { ok: false, error: "Couldn't find this session's terminal window." });
        return activateApp(app, ok => ok
          ? reply(200, { ok: true, method: 'pid', app, focused: true })
          : reply(409, { ok: false, error: "Couldn't find this session's terminal window." }));
      }

      return reply(409, { ok: false, error: "Couldn't find this session's terminal window." });
    });
    return;
  }

  // Show a visitor out. `dismiss` only hides them here; `evict` really
  // terminates the session's process.
  if (req.method === 'POST' && req.url === '/api/kick') {
    if (!guard(req, res)) return;
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      const reply = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
        broadcast(true);
      };
      let r;
      // JSON shape here too -- this branch used to reply in plain text, unlike
      // every other endpoint.
      try { r = JSON.parse(body); } catch { return reply(400, { ok: false, error: 'bad json' }); }

      if (!r.id) return reply(400, { ok: false, error: 'no session id' });

      if (r.mode === 'dismiss') {
        dismissed.add(r.id);
        live.delete(r.id);
        return reply(200, { ok: true, mode: 'dismiss', id: r.id });
      }

      if (r.mode === 'evict') {
        const pid = pids.get(r.id);
        if (!pid) return reply(409, { ok: false, error: 'no pid known for this session — it predates the hooks' });
        // Verify before signalling: pids get recycled, and a stale mapping
        // would otherwise SIGTERM an unrelated process.
        if (!isClaude(pid)) return reply(409, { ok: false, error: `pid ${pid} is not a claude process` });

        try { process.kill(pid, 'SIGTERM'); } catch (e) { return reply(500, { ok: false, error: String(e) }); }
        // Escalate only if it ignores the polite request.
        setTimeout(() => {
          if (alive(pid) && isClaude(pid)) { try { process.kill(pid, 'SIGKILL'); } catch {} }
          pids.delete(r.id); live.delete(r.id); dismissed.add(r.id); broadcast(true);
        }, 4000);
        return reply(200, { ok: true, mode: 'evict', id: r.id, pid });
      }

      return reply(400, { ok: false, error: 'mode must be dismiss or evict' });
    });
    return;
  }

  if (req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ t: Date.now(), sessions: scan(), canFocus: CAN_FOCUS })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.url === '/api/sessions') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ t: Date.now(), hooksSeen: live.size, canFocus: CAN_FOCUS, sessions: scan() }, null, 1));
    return;
  }

  // Theme gallery source (THEMES.md §6): scan public/themes/*/theme.json and
  // report whatever parses. GET-only, read-only -- no side effects, same
  // invariant the static handler already keeps.
  if (req.url === '/api/themes') {
    const dir = path.join(__dirname, 'public', 'themes');
    let names = [];
    try { names = fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); }
    catch { names = []; }
    const themes = [];
    for (const name of names) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, name, 'theme.json'), 'utf8'));
        themes.push({ name: j.name || name, title: j.title || j.name || name, format: j.format });
      } catch { /* a directory without a valid theme.json just doesn't list */ }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ themes }));
    return;
  }

  // Strip the query BEFORE testing for '/', or '/?fake=40' misses the index and
  // resolves to the public directory itself -- a 404 that made the debug harness
  // unreachable exactly when it had parameters.
  const pathname = req.url.split('?')[0];
  const file = (pathname === '/' || pathname === '') ? 'index.html' : pathname.replace(/^\//, '');
  const full = path.join(__dirname, 'public', file);
  if (!full.startsWith(path.join(__dirname, 'public'))) { res.writeHead(403).end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    // Browsers refuse a stylesheet served as text/plain -- it loads, parses to
    // zero rules, and everything silently loses its layout.
    const MIME = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
      '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
    };
    // S1-c: hand the boot token to the page as it's served, and only that way.
    // There is deliberately no /api/token endpoint -- a drive-by page could hit
    // that just as easily as the write endpoints it's meant to gate. Embedding
    // it in the HTML response means only a same-origin document (this served
    // page) ever sees it; a cross-origin page's `fetch` response is opaque to
    // its own JS.
    if (file === 'index.html') {
      const html = data.toString('utf8')
        .replace('<script src="theme-engine.js"></script>',
          `<script>window.__SIM_TOKEN__ = ${JSON.stringify(TOKEN)};</script>\n<script src="theme-engine.js"></script>`);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'text/plain' });
    res.end(data);
  });
});

// Loopback only: this serves your prompts and questions verbatim.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`cupola  ->  http://localhost:${PORT}`);
  console.log(`watching       ${PROJECTS}`);
  console.log(`window ${ACTIVE_WINDOW_MS / 60000}min · stale ${STALE_MS / 60000}min`);
  refreshRoster();
  setInterval(refreshRoster, 4000);
  setTimeout(() => {
    console.log(rosterOk
      ? `roster       claude agents --json (${roster.size} live)`
      : `roster       UNAVAILABLE -- falling back to file age (older claude CLI?)`);
    console.log(`${scan().length} session(s) in view`);
  }, 1200);
  setInterval(() => broadcast(false), POLL_MS);
});
