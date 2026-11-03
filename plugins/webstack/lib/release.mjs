import fs from 'node:fs';
import path from 'node:path';
import { resolvePhp, requireSection } from './config.mjs';
import { runHooks } from './hooks.mjs';
import { check, failureCount, listFiles, matchesAny, run, stop, today } from './util.mjs';
import { readZip, writeZip } from './zip.mjs';

export const DEFAULT_FORBIDDEN = ['**/.env', '**/.env.*', '**/*secrets*.php', 'secrets/**', '**/.git/**', '**/node_modules/**'];

export function lintPhp(ctx) {
  const globs = ctx.cfg.release?.phpLint ?? [];
  if (!globs.length) return;
  const php = resolvePhp(ctx.cfg);
  const files = listFiles(ctx.root).filter((f) => matchesAny(f, globs) && !f.startsWith('node_modules/'));
  const bad = [];
  for (const f of files) {
    const r = run([php, '-l', ctx.abs(f)], { capture: true, timeoutSeconds: 30 });
    if (r.code !== 0) bad.push(`${f}: ${(r.stdout + r.stderr).trim().split('\n')[0]}`);
  }
  check(`PHP lint (${files.length} files)`, bad.length === 0, bad.join('; '));
}

export function checkMirrors(ctx) {
  for (const m of ctx.cfg.release?.mirrors ?? []) {
    const src = ctx.abs(m.source);
    const copy = ctx.abs(m.copy);
    if (!fs.existsSync(copy)) {
      check(`${m.copy} matches ${m.source}`, false, `${m.copy} missing`);
      continue;
    }
    const ignore = m.ignore ?? [];
    const a = listFiles(src).filter((f) => !matchesAny(f, ignore));
    const b = listFiles(copy).filter((f) => !matchesAny(f, ignore));
    const diffs = [];
    for (const f of new Set([...a, ...b])) {
      if (!a.includes(f)) diffs.push(`only in ${m.copy}: ${f}`);
      else if (!b.includes(f)) diffs.push(`only in ${m.source}: ${f}`);
      else if (!fs.readFileSync(path.join(src, f)).equals(fs.readFileSync(path.join(copy, f)))) diffs.push(`differs: ${f}`);
    }
    check(`${m.copy} matches ${m.source}`, diffs.length === 0, diffs.slice(0, 10).join('; '));
  }
}

export function build(ctx) {
  const r = ctx.cfg.release;
  if (!r?.build) return true;
  console.log(`--- build: ${r.build.join(' ')}`);
  return check('build', run(r.build, { cwd: ctx.root }).code === 0);
}

export function distEntries(ctx) {
  const r = requireSection(ctx.cfg, 'release');
  const dist = ctx.abs(r.dist);
  if (!fs.existsSync(path.join(dist, 'index.html'))) stop(`${r.dist}/index.html missing: build first.`);
  return listFiles(dist)
    .filter((f) => !matchesAny(f, r.exclude ?? []))
    .map((name) => ({ name, file: path.join(dist, name) }));
}

export function release(ctx, opts) {
  const r = requireSection(ctx.cfg, 'release');
  for (const cmd of r.lint ?? []) {
    console.log(`--- ${cmd.join(' ')}`);
    if (!check(cmd.join(' '), run(cmd, { cwd: ctx.root }).code === 0)) return;
  }
  const before = failureCount();
  lintPhp(ctx);
  checkMirrors(ctx);
  if (failureCount() > before) {
    console.log('Stopped before building: no zip written.');
    return;
  }
  if (!opts['no-build'] && !build(ctx)) return;

  const entries = distEntries(ctx);
  const forbidden = [...DEFAULT_FORBIDDEN, ...(r.forbidden ?? [])];
  const leaked = entries.filter((e) => matchesAny(e.name, forbidden)).map((e) => e.name);
  if (!check('no secrets or forbidden files in the build', leaked.length === 0, leaked.join(', '))) return;

  const zipPath = ctx.abs(r.zip.replace('{date}', today()));
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  writeZip(zipPath, entries);

  let names = [];
  try {
    names = readZip(zipPath);
    check(`zip reads back intact (${names.length} files)`, names.length === entries.length);
  } catch (err) {
    check('zip reads back intact', false, err.message);
  }
  check('zip paths use forward slashes', names.every((n) => !n.includes('\\')));
  const missing = (r.required ?? []).filter((req) => !names.includes(req));
  check('required entries present', missing.length === 0, `missing ${missing.join(', ')}`);
  const excluded = names.filter((n) => matchesAny(n, r.exclude ?? []));
  check('excluded files left out', excluded.length === 0, excluded.join(', '));

  runHooks(ctx, 'release', { zip: zipPath }, { WEBSTACK_ZIP: zipPath });
  const mb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  console.log(`zip: ${zipPath}\n${names.length} files, ${mb} MB`);
}
