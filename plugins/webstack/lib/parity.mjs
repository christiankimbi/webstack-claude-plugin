import { resolvePhp, requireSection } from './config.mjs';
import { runHooks } from './hooks.mjs';
import { check, run, stop, substitute } from './util.mjs';

function diff(a, b, at, out) {
  if (out.length >= 10) return;
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) {
    out.push(`${at || '(root)'}: php ${JSON.stringify(a)?.slice(0, 160)} | ts ${JSON.stringify(b)?.slice(0, 160)}`);
    return;
  }
  if (a && typeof a === 'object') {
    if (Array.isArray(a) && a.length !== b.length) out.push(`${at || '(root)'}: length php ${a.length} | ts ${b.length}`);
    const keys = Array.isArray(a) ? [...Array(Math.min(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) diff(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : `${at}.${k}`, out);
  } else if (a !== b) out.push(`${at || '(root)'}: php ${JSON.stringify(a)} | ts ${JSON.stringify(b)}`);
}

function parse(side, r) {
  if (r.code !== 0) return { error: `${side} command failed (exit ${r.code}): ${r.stderr.trim().split('\n').slice(-3).join(' ')}` };
  try {
    return { value: JSON.parse(r.stdout) };
  } catch {
    return { error: `${side} output is not JSON: ${r.stdout.slice(0, 120)}` };
  }
}

export function parity(ctx, opts) {
  const pairs = requireSection(ctx.cfg, 'parity');
  const only = opts.name;
  const php = pairs.some((p) => p.php.includes('{php}')) ? resolvePhp(ctx.cfg) : undefined;
  const selected = pairs.filter((x) => !only || x.name === only);
  if (!selected.length) stop(only ? `No parity pair named "${only}".` : 'The parity list is empty.');
  for (const p of selected) {
    const vars = { php, arg: opts._[0] ?? p.defaultArg ?? '' };
    const a = parse('php', run(substitute(p.php, vars), { cwd: ctx.root, capture: true, timeoutSeconds: p.timeoutSeconds ?? 300 }));
    const b = parse('ts', run(substitute(p.ts, vars), { cwd: ctx.root, capture: true, timeoutSeconds: p.timeoutSeconds ?? 300 }));
    if (a.error || b.error) {
      check(`${p.name}: both sides ran`, false, a.error ?? b.error);
      continue;
    }
    const empty = (v) => v === null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Object.keys(v).length);
    const shape = (v) =>
      Array.isArray(v) ? `${v.length} items` : Object.entries(v).map(([k, x]) => (Array.isArray(x) ? `${k}=${x.length}` : k)).join(' ');
    console.log(`${p.name}: php ${shape(a.value)} | ts ${shape(b.value)}`);
    if (!check(`${p.name}: output is not empty`, !empty(a.value) && !empty(b.value))) continue;
    const out = [];
    diff(a.value, b.value, '', out);
    out.forEach((d) => console.log(`  DIFF ${d}`));
    check(`${p.name}: PHP and TypeScript outputs identical`, out.length === 0, `${out.length}${out.length >= 10 ? '+' : ''} differences`);
  }
  runHooks(ctx, 'parity');
}
