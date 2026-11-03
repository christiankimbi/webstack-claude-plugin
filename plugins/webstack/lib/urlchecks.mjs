import { requireSection } from './config.mjs';
import { runHooks } from './hooks.mjs';
import { check, stop } from './util.mjs';

// Mail endpoints on a local Apache copy still load the real SMTP settings, so the
// runner only ever sends GET/HEAD and refuses the configured form paths outright.
export function assertAllowed(cfg, url, method) {
  if (!['GET', 'HEAD'].includes(method)) stop(`Refusing ${method} ${url}: only GET and HEAD are allowed.`);
  const p = new URL(url).pathname.toLowerCase();
  for (const f of cfg.urlChecks?.forbiddenPaths ?? []) {
    if (p.includes(f.toLowerCase())) stop(`Refusing ${url}: ${f} is a forbidden path (it can send email).`);
  }
}

function countMatches(text, pattern, flags = '') {
  return (text.match(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')) ?? []).length;
}

async function runCheck(cfg, base, c) {
  const method = c.method ?? 'GET';
  const url = base.replace(/\/$/, '') + c.path;
  assertAllowed(cfg, url, method);
  let res;
  let body = '';
  try {
    res = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout((c.timeoutSeconds ?? 30) * 1000) });
    if (method === 'GET') body = new TextDecoder('utf-8').decode(await res.arrayBuffer());
  } catch (err) {
    return check(c.name, false, `request failed: ${err.message}`);
  }
  const problems = [];
  const status = c.status ?? 200;
  if (res.status !== status) problems.push(`status ${res.status}, expected ${status}`);
  for (const h of c.headers ?? []) {
    const v = res.headers.get(h.name);
    if (h.absent) {
      if (v !== null) problems.push(`header ${h.name} should be absent`);
    } else if (v === null) problems.push(`header ${h.name} missing`);
    else if (h.regex && !new RegExp(h.regex, h.flags ?? 'i').test(v)) problems.push(`header ${h.name}: "${v}"`);
  }
  const b = c.body ?? {};
  for (const s of b.contains ?? []) if (!body.includes(s)) problems.push(`missing ${JSON.stringify(s)}`);
  for (const s of b.notContains ?? []) if (body.includes(s)) problems.push(`contains ${JSON.stringify(s)}`);
  for (const r of b.regex ?? []) if (!new RegExp(r.pattern ?? r, r.flags ?? '').test(body)) problems.push(`no match for /${r.pattern ?? r}/`);
  for (const k of b.counts ?? []) {
    const n = countMatches(body, k.pattern, k.flags);
    if (k.exact !== undefined && n !== k.exact) problems.push(`${n} matches of /${k.pattern}/, expected ${k.exact}`);
    if (k.min !== undefined && n < k.min) problems.push(`${n} matches of /${k.pattern}/, expected at least ${k.min}`);
    if (k.max !== undefined && n > k.max) problems.push(`${n} matches of /${k.pattern}/, expected at most ${k.max}`);
  }
  return check(c.name, problems.length === 0, problems.join('; '));
}

export async function urlChecks(ctx, opts) {
  const u = requireSection(ctx.cfg, 'urlChecks');
  const base = opts.base ?? ctx.cfg.apache?.baseUrl;
  if (!base) stop('No base URL: pass --base or set apache.baseUrl.');
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(base) && !opts['allow-remote']) {
    stop(`${base} is not local. Pass --allow-remote to run the GET/HEAD checks against it.`);
  }
  console.log(`base: ${base}`);
  for (const c of u.checks) await runCheck(ctx.cfg, base, c);
  runHooks(ctx, 'url-checks', { base }, { WEBSTACK_BASE_URL: base });
}
