#!/usr/bin/env node
'use strict';

// cupola CLI. Subcommand dispatcher for `npx cupola`.
//
//   cupola                start the daemon, open the view
//   cupola install-hooks  merge hooks into ~/.claude/settings.json
//   cupola remove-hooks   undo that, byte-identically
//   cupola new [dir]      start an answerable (tmux-hosted) session
//
// Zero dependencies -- same constraint as the daemon. Only child_process, net,
// readline, fs, path: all Node builtins.

const path = require('path');
const net = require('net');
const readline = require('readline');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 7777;
const URL = `http://localhost:${PORT}`;

const installHooks = require(path.join(ROOT, 'install-hooks.js'));

function openBrowser(url) {
  const plat = process.platform;
  const cmd = plat === 'darwin' ? 'open' : plat === 'win32' ? 'cmd' : 'xdg-open';
  const args = plat === 'win32' ? ['/c', 'start', '""', url] : [url];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).unref(); }
  catch { /* best effort -- print the URL either way (caller already does) */ }
}

// True once something is listening -- used both to decide "start a daemon"
// vs "one's already up, just open the browser" and to know when a freshly
// started daemon is ready to load.
function probePort(port, cb) {
  const sock = net.createConnection({ port, host: '127.0.0.1' });
  sock.once('connect', () => { sock.destroy(); cb(true); });
  sock.once('error', () => { sock.destroy(); cb(false); });
}

function waitForPort(port, cb) {
  probePort(port, up => {
    if (up) return cb();
    setTimeout(() => waitForPort(port, cb), 150);
  });
}

// Best-effort: is our hook already registered for at least one event? Read
// directly rather than shelling out, so a broken/missing settings.json just
// reads as "not installed" (install-hooks.js's own readSettings already
// treats ENOENT as `{}`).
function hooksInstalled() {
  const { settings, hookDest } = installHooks.paths();
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(settings, 'utf8')); } catch { return false; }
  const hooks = (cfg && cfg.hooks) || {};
  for (const ev of Object.keys(hooks)) {
    for (const g of hooks[ev] || []) {
      for (const h of (g.hooks || [])) {
        if (installHooks.isOurs(h.command, hookDest)) return true;
      }
    }
  }
  return false;
}

function ask(question) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) return resolve(false);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(/^y(es)?$/i.test(answer.trim()) || answer.trim() === ''); });
  });
}

function printInstallResult(result, removed) {
  console.log(removed
    ? `removed ${result.dropped} cupola hook(s)`
    : `hooks installed (port ${PORT}) -> ${result.hookDest}`);
  console.log(`backup: ${result.backup}`);
}

// ---- cupola (no args): the 60-second first run -------------------------

async function cmdStart() {
  probePort(PORT, async up => {
    if (up) {
      console.log(`cupola already running -> ${URL}`);
      openBrowser(URL);
      return;
    }

    if (!hooksInstalled()) {
      const yes = await ask(
        'Install Claude Code hooks so chores and questions show up live? ' +
        '(writes into ~/.claude/settings.json, merged alongside anything already there) [Y/n] '
      );
      if (yes) {
        try {
          const result = installHooks.install({ port: PORT });
          printInstallResult(result, false);
        } catch (e) {
          console.error(`could not install hooks: ${e.message || e}`);
          console.error(`you can retry any time with: cupola install-hooks`);
        }
      } else {
        console.log('Skipping hooks -- the view still shows who is running and busy/idle.');
        console.log('Install any time with: cupola install-hooks');
      }
    }

    console.log(`starting cupola -> ${URL}`);
    waitForPort(PORT, () => openBrowser(URL));
    // Executes server.js's own top-level listen() in this process, so Ctrl+C
    // here stops the daemon -- same lifecycle as `node server.js` today.
    require(path.join(ROOT, 'server.js'));
  });
}

// ---- cupola install-hooks / remove-hooks --------------------------------

function cmdInstallHooks() {
  const result = installHooks.install({ port: PORT });
  printInstallResult(result, false);
}

function cmdRemoveHooks() {
  const result = installHooks.remove({});
  printInstallResult(result, true);
}

// ---- cupola new [dir] ---------------------------------------------------
// Provides tmux rather than requiring it: send-keys/capture-pane (answering a
// question, /clear, Peek at screen) only work on a tmux pane, and nothing on
// this machine started that way before this command existed. Once hooks are
// installed, the new session self-reports its pane on the next hook event --
// no daemon-side registration needed, which is why this stays a plain CLI
// subcommand with no new HTTP endpoint.

function haveTmux() {
  try { execFileSync('tmux', ['-V'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function haveClaude() {
  try { execFileSync('sh', ['-c', 'command -v claude'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function cmdNew(dir) {
  const cwd = path.resolve(dir || process.cwd());
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    console.error(`not a directory: ${cwd}`);
    process.exitCode = 1;
    return;
  }

  if (!haveClaude()) {
    console.log('warning: `claude` was not found on PATH -- the session will fail to start.');
  }

  if (!haveTmux()) {
    console.log('tmux not found (brew install tmux) -- starting claude directly instead.');
    console.log('This session will be watch-only: no answering, no /clear, no Peek at screen.');
    spawn('claude', [], { cwd, stdio: 'inherit' });
    return;
  }

  const name = `sim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    execFileSync('tmux', ['new-session', '-d', '-s', name, '-c', cwd, 'claude']);
  } catch (e) {
    console.error(`could not start tmux session: ${e.message || e}`);
    process.exitCode = 1;
    return;
  }

  let pane = '';
  try { pane = execFileSync('tmux', ['display-message', '-p', '-t', name, '#{pane_id}'], { encoding: 'utf8' }).trim(); }
  catch { /* session started fine either way; pane id is just for the log line */ }

  console.log(`started ${name}${pane ? ` (pane ${pane})` : ''} in ${cwd}`);
  if (!hooksInstalled()) {
    console.log('hooks are not installed -- run `cupola install-hooks` so this session becomes answerable from the view.');
  }

  if (process.env.TMUX) {
    // Already inside tmux: attaching here would nest one tmux client inside
    // another, which is awkward at best. Tell the user how to get there
    // instead of doing it for them.
    console.log(`already inside tmux -- switch with: tmux switch-client -t ${name}`);
    console.log(`(or from a plain terminal: tmux attach -t ${name})`);
    return;
  }

  // Plain terminal: `cupola new`'s entire point is a session you can act on, so
  // land the user in it rather than making them run a second command.
  try {
    execFileSync('tmux', ['attach', '-t', name], { stdio: 'inherit' });
  } catch {
    // Attach can fail (e.g. no real tty in some CI-like shells) -- the
    // session itself is fine, so degrade to instructions rather than erroring.
    console.log(`could not attach automatically -- run: tmux attach -t ${name}`);
  }
}

// ---- dispatch ------------------------------------------------------------------

function usage() {
  console.log(`cupola -- an ambient view of your live Claude Code sessions

  cupola                start the daemon and open the view
  cupola install-hooks  merge hooks into ~/.claude/settings.json
  cupola remove-hooks   remove them (byte-identical restore of anything else there)
  cupola new [dir]      start an answerable session in tmux (default: cwd)
  cupola help           this message

Env: PORT (default 7777), WINDOW_MIN (default 120), STALE_MIN (default 10)`);
}

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case undefined:
    cmdStart();
    break;
  case 'install-hooks':
    cmdInstallHooks();
    break;
  case 'remove-hooks':
    cmdRemoveHooks();
    break;
  case 'new':
    cmdNew(rest[0]);
    break;
  case 'help':
  case '-h':
  case '--help':
    usage();
    break;
  default:
    console.error(`unknown command: ${cmd}\n`);
    usage();
    process.exitCode = 1;
}
