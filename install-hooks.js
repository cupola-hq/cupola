#!/usr/bin/env node
'use strict';

// Add (or remove) the cupola hooks in ~/.claude/settings.json.
//
//   node install-hooks.js          add
//   node install-hooks.js --remove remove
//
// Merges into the existing hooks array rather than replacing it, so other
// tooling already registered there (this machine also runs aicodemetricsd
// hooks) is left alone. Always backs up first.
//
// Two things this file is deliberately paranoid about, both found by actually
// running it against a fresh-machine simulation:
//
// 1. ~/.claude/settings.json may not exist yet -- that's exactly the machine
//    an installer is for, so a missing file is treated as `{}`, not a crash.
//
// 2. The command baked into settings.json must NOT be this file's own
//    __dirname. Under `npx cupola`, __dirname is an npm-managed cache
//    directory that npx is free to garbage-collect after this process exits.
//    A path into it is fine while installing, fatal forever after: every
//    Claude Code session on the machine would fire a hook at a deleted file,
//    silently (hook.sh discards all output by design), until someone notices
//    the house stopped updating and goes looking. So install copies hook.sh
//    to a location this package does not own and cannot get cleaned up from
//    under it -- ~/.claude/cupola/hook.sh -- and registers *that* path.
//    A real npm/global install and a one-shot npx run end up identical on
//    disk after this: both point at the same stable copy.

const fs = require('fs');
const path = require('path');
const os = require('os');

const EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
                'Notification', 'Stop', 'SessionEnd'];

function paths(home) {
  const base = home || os.homedir();
  const claudeDir = path.join(base, '.claude');
  return {
    settings: path.join(claudeDir, 'settings.json'),
    installDir: path.join(claudeDir, 'cupola'),
    hookDest: path.join(claudeDir, 'cupola', 'hook.sh'),
  };
}

// A settings.json that doesn't exist yet reads as "no hooks installed", not
// an error -- ENOENT is exactly the state a first-time installer must handle.
function readSettings(settingsPath) {
  let raw;
  try {
    raw = fs.readFileSync(settingsPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { raw: '{}', cfg: {} };
    throw e;
  }
  return { raw, cfg: JSON.parse(raw) };
}

// Matched by path, not full command string, so re-running with a different
// PORT (the leading `PORT=<n> ` assignment) still recognizes -- and cleanly
// replaces -- a previous install instead of leaving two copies registered.
function isOurs(command, hookDest) {
  return typeof command === 'string' && command.indexOf(hookDest) !== -1;
}

function buildCommand(hookDest, port) {
  // Quoted so a HOME path containing spaces doesn't split into two argv
  // words. PORT is a leading shell assignment, exactly like `FOO=bar cmd` --
  // Claude Code runs hook commands through a shell, so this reaches hook.sh
  // as a real environment variable without hook.sh needing any argv parsing.
  return `PORT=${port} "${hookDest}"`;
}

function install({ home, hookSrc, port = 7777 } = {}) {
  const { settings, installDir, hookDest } = paths(home);
  hookSrc = hookSrc || path.join(__dirname, 'hook.sh');

  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.mkdirSync(installDir, { recursive: true });
  // Copy, don't symlink/reference: the source (an npx cache dir, or this
  // checkout) is not guaranteed to survive. The copy is our own, forever.
  fs.copyFileSync(hookSrc, hookDest);
  fs.chmodSync(hookDest, 0o755);

  const { raw, cfg } = readSettings(settings);
  cfg.hooks = cfg.hooks || {};

  const backup = `${settings}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.writeFileSync(backup, raw);

  let added = 0, dropped = 0;
  for (const ev of EVENTS) {
    const groups = cfg.hooks[ev] || [];
    for (const g of groups) {
      const before = (g.hooks || []).length;
      g.hooks = (g.hooks || []).filter(h => !isOurs(h.command, hookDest));
      dropped += before - g.hooks.length;
    }
    cfg.hooks[ev] = groups.filter(g => (g.hooks || []).length > 0);
    cfg.hooks[ev].push({ hooks: [{ type: 'command', command: buildCommand(hookDest, port), timeout: 2 }] });
    added++;
  }

  fs.writeFileSync(settings, JSON.stringify(cfg, null, 2) + '\n');
  return { settings, backup, hookDest, added, dropped, cfg };
}

function remove({ home } = {}) {
  const { settings, installDir, hookDest } = paths(home);
  const { raw, cfg } = readSettings(settings);
  cfg.hooks = cfg.hooks || {};

  const backup = `${settings}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.writeFileSync(backup, raw);

  let dropped = 0;
  for (const ev of Object.keys(cfg.hooks)) {
    const groups = cfg.hooks[ev] || [];
    for (const g of groups) {
      const before = (g.hooks || []).length;
      g.hooks = (g.hooks || []).filter(h => !isOurs(h.command, hookDest));
      dropped += before - g.hooks.length;
    }
    cfg.hooks[ev] = groups.filter(g => (g.hooks || []).length > 0);
    if (cfg.hooks[ev].length === 0) delete cfg.hooks[ev];
  }
  if (Object.keys(cfg.hooks).length === 0) delete cfg.hooks;

  fs.writeFileSync(settings, JSON.stringify(cfg, null, 2) + '\n');

  // Clean up what install() added beyond settings.json -- an uninstall that
  // leaves files behind isn't really an uninstall.
  try { fs.unlinkSync(hookDest); } catch {}
  try { fs.rmdirSync(installDir); } catch {} // only succeeds if now empty

  return { settings, backup, hookDest, dropped, cfg };
}

function main() {
  const doRemove = process.argv.includes('--remove');
  const portArg = process.argv.find(a => /^--port=/.test(a));
  const port = portArg ? Number(portArg.slice('--port='.length)) : (Number(process.env.PORT) || 7777);

  const result = doRemove ? remove({}) : install({ port });

  console.log(doRemove
    ? `removed ${result.dropped} cupola hook(s)`
    : `installed on ${EVENTS.length} events (port ${port}), hook copied to ${result.hookDest}`);
  console.log(`backup: ${result.backup}`);
  console.log(`\nother hooks still registered:`);
  for (const ev of Object.keys(result.cfg.hooks || {})) {
    for (const g of result.cfg.hooks[ev]) {
      for (const h of g.hooks || []) {
        if (!isOurs(h.command, result.hookDest)) console.log(`  ${ev.padEnd(17)} ${h.command.slice(0, 60)}`);
      }
    }
  }
  console.log('\nRestart Claude Code sessions for hooks to take effect.');
}

if (require.main === module) main();

module.exports = { install, remove, paths, isOurs, EVENTS };
