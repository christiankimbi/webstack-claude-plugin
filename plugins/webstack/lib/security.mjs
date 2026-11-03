import fs from 'node:fs';
import path from 'node:path';
import { runHooks } from './hooks.mjs';
import { assertAllowed } from './urlchecks.mjs';
import { check, listFiles, matchesAny, run, stop } from './util.mjs';

// Automated probes only. They support the agent-led review in the skill; they are not an audit.
export async function security(ctx, opts) {
  const s = ctx.cfg.security ?? {};
  const git = (args) => run(['git', ...args], { cwd: ctx.root, capture: true });
  if (git(['rev-parse', '--is-inside-work-tree']).code !== 0) stop('Not a git repository.');

  for (const p of s.mustBeIgnored ?? []) {
    check(`git ignores ${p}`, git(['check-ignore', '-q', p]).code === 0, 'not ignored');
  }
  const tracked = git(['ls-files']).stdout.split('\n').filter(Boolean);
  const templates = ['**/*.example', '**/*.example.*', '**/*.sample', '**/*.sample.*'];
  const leakedFiles = tracked.filter(
    (f) => matchesAny(f, ['**/.env', '**/.env.*', '**/*secrets*.php', 'secrets/**']) && !matchesAny(f, [...templates, ...(s.allowTracked ?? [])]),
  );
  check('no secret-bearing files tracked', leakedFiles.length === 0, leakedFiles.join(', '));

  if ((s.secretPatterns ?? []).length) {
    const texts = [];
    for (const f of tracked) {
      const full = ctx.abs(f);
      if (!fs.existsSync(full) || fs.statSync(full).size > 2 * 1024 * 1024) continue;
      const buf = fs.readFileSync(full);
      if (!buf.includes(0)) texts.push([f, buf.toString('utf8')]);
    }
    for (const pattern of s.secretPatterns) {
      const re = new RegExp(pattern);
      const hits = [];
      for (const [f, text] of texts) {
        text.split('\n').forEach((line, i) => re.test(line) && hits.push(`${f}:${i + 1}`));
      }
      check(`no tracked match for /${pattern}/`, hits.length === 0, hits.slice(0, 10).join(', '));
    }
  }

  const dist = ctx.cfg.release?.dist && ctx.abs(ctx.cfg.release.dist);
  if (dist && fs.existsSync(dist)) {
    const bad = listFiles(dist).filter((f) => matchesAny(f, ['**/.env', '**/.env.*', '**/*secrets*.php', 'secrets/**']));
    check(`no secrets in ${ctx.cfg.release.dist}/`, bad.length === 0, bad.join(', '));
  }

  const base = opts.base ?? ctx.cfg.apache?.baseUrl;
  if (base && (s.protectedUrls ?? []).length) {
    for (const p of s.protectedUrls) {
      const url = base.replace(/\/$/, '') + p;
      assertAllowed(ctx.cfg, url, 'GET');
      try {
        const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
        check(`${p} is blocked`, [401, 403, 404].includes(res.status), `status ${res.status}`);
      } catch (err) {
        check(`${p} is blocked`, false, `request failed: ${err.message} (is the local site running?)`);
      }
    }
  }
  runHooks(ctx, 'security', { base: base ?? '' }, { WEBSTACK_BASE_URL: base ?? '' });
  console.log(`scope: ${path.basename(ctx.root)} working tree${base ? ` and ${base}` : ''}`);
}
