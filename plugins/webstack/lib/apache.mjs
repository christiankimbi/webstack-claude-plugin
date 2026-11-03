import fs from 'node:fs';
import path from 'node:path';
import { requireSection } from './config.mjs';
import { build, distEntries } from './release.mjs';
import { check, isWin, stop } from './util.mjs';
import { urlChecks } from './urlchecks.mjs';

export const MARKER = '.webstack-test-target';

const norm = (p) => {
  const r = path.resolve(fs.existsSync(p) ? fs.realpathSync.native(p) : p);
  return isWin ? r.toLowerCase() : r;
};
const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
const overlaps = (a, b) => inside(a, b) || inside(b, a);

// The target is emptied before each copy, so every guard here must hold first.
export function assertSafeTarget(ctx) {
  const a = requireSection(ctx.cfg, 'apache');
  const target = ctx.abs(a.target);
  if (!fs.existsSync(target)) stop(`Test folder ${target} does not exist. Create it and put an empty ${MARKER} file in it.`);
  const t = norm(target);
  if (path.parse(t).root === t || t.split(path.sep).filter(Boolean).length < 2) stop(`Refusing to use ${target}: too close to the drive root.`);
  if (overlaps(t, norm(ctx.root))) stop(`Refusing to use ${target}: it overlaps the project folder.`);
  for (const n of a.neverTouch ?? []) {
    if (overlaps(t, norm(ctx.abs(n)))) stop(`Refusing to use ${target}: it overlaps the never-touch folder ${n}.`);
  }
  if (!fs.existsSync(path.join(target, MARKER))) {
    stop(`${target} has no ${MARKER} file. Add an empty one to confirm this folder may be emptied and replaced.`);
  }
  return target;
}

export async function deploy(ctx, opts) {
  const target = assertSafeTarget(ctx);
  if (!opts['no-build'] && !build(ctx)) return;
  const entries = distEntries(ctx);

  for (const entry of fs.readdirSync(target)) {
    if (entry === MARKER) continue;
    fs.rmSync(path.join(target, entry), { recursive: true, force: true });
  }
  for (const { name, file } of entries) {
    const dest = path.join(target, ...name.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  check(`copied ${entries.length} files to ${target} (old files removed)`, true);
  await urlChecks(ctx, {});
}
