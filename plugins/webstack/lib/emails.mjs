import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSection, resolvePhp } from './config.mjs';
import { runHooks } from './hooks.mjs';
import { check, globToRegex, run, stop } from './util.mjs';

const PHP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'php');
const DEFAULT_SEND_ARGS = ['to', 'subject', 'html', 'text', 'replyTo', 'toName'];
const DEFAULT_TAINT = ['<script', '<img src=x', '"><'];
// Belt and braces on top of the stub mailer: the PHP process cannot open sockets or call mail().
const NO_NETWORK = [
  '-d', 'disable_functions=mail,fsockopen,pfsockopen,stream_socket_client,socket_connect,curl_exec,curl_multi_exec',
  '-d', 'allow_url_fopen=0',
];

function caseFiles(ctx, e) {
  const dir = ctx.abs(e.cases);
  if (!fs.existsSync(dir)) stop(`emails.cases folder ${e.cases} does not exist.`);
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => path.join(dir, f));
}

function within(base, rel, label) {
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel) || rel.split(/[\\/]/).includes('..')) {
    stop(`${label} "${rel}" must be a plain relative path inside the folder.`);
  }
  const full = path.resolve(base, rel);
  if (!full.startsWith(path.resolve(base) + path.sep)) stop(`${label} "${rel}" escapes ${base}.`);
  return full;
}

function builtinHarness(ctx, e, out) {
  const php = resolvePhp(ctx.cfg);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'webstack-mail-'));
  const apiDir = ctx.abs(e.apiDir);
  for (const f of new Set([...Object.values(e.handlers), ...(e.copy ?? [])])) {
    within(apiDir, f, 'emails file');
    const dest = within(work, f, 'emails file');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(apiDir, f), dest);
  }
  const cls = e.mailerClass ?? 'SimpleSmtpMailer';
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cls)) stop(`emails.mailerClass "${cls}" is not a PHP class name.`);
  const mailerDest = within(work, e.mailerFile ?? 'mailer.php', 'emails.mailerFile');
  const configDest = within(work, e.configFile ?? 'config.php', 'emails.configFile');
  fs.writeFileSync(mailerDest, fs.readFileSync(path.join(PHP_DIR, 'stub-mailer.php'), 'utf8').replace('__WEBSTACK_CLASS__', cls));
  fs.writeFileSync(path.join(path.dirname(mailerDest), 'webstack-sendargs.json'), JSON.stringify(e.sendArgs ?? DEFAULT_SEND_ARGS));
  fs.copyFileSync(path.join(PHP_DIR, 'stub-config.php'), configDest);
  fs.writeFileSync(path.join(path.dirname(configDest), 'webstack-constants.json'), JSON.stringify(e.stubConstants ?? {}));

  const results = [];
  for (const file of caseFiles(ctx, e)) {
    const name = path.basename(file, '.json');
    const prefix = Object.keys(e.handlers).find((p) => name.startsWith(`${p}-`));
    if (!prefix) {
      check(`case ${name} matches a handler prefix`, false, `prefixes: ${Object.keys(e.handlers).join(', ')}`);
      continue;
    }
    const resultFile = path.join(work, `${name}.result.json`);
    const r = run([php, ...NO_NETWORK, path.join(PHP_DIR, 'run-case.php'), path.join(work, e.handlers[prefix]), file, resultFile], {
      capture: true,
      timeoutSeconds: 60,
    });
    let res = { response: r.stdout, status: null, fatal: r.stderr || `exit ${r.code}`, messages: [] };
    if (fs.existsSync(resultFile)) res = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
    results.push({ case: name, handler: e.handlers[prefix], ...res });
  }
  fs.rmSync(work, { recursive: true, force: true });
  return results;
}

// The no-send guarantee covers only the built-in harness; a custom harness is trusted
// project code and must itself avoid real mail.
function customHarness(ctx, e, out) {
  console.log('NOTE  custom emails.harness: webstack cannot enforce that it never sends mail.');
  const manifest = path.join(out, 'manifest.json');
  const r = run(e.harness, { cwd: ctx.root, env: { WEBSTACK_OUT: out, WEBSTACK_CASES: ctx.abs(e.cases) }, timeoutSeconds: 300 });
  if (r.code !== 0 || !fs.existsSync(manifest)) stop(`emails.harness failed (exit ${r.code}) or wrote no ${manifest}.`);
  return JSON.parse(fs.readFileSync(manifest, 'utf8'));
}

const FIELDS = ['to', 'toName', 'replyTo', 'subject', 'text', 'html'];
function fieldValues(msg, field) {
  if (!field || field === 'any') return FIELDS.map((f) => msg[f] ?? '');
  return [msg[field] ?? ''];
}

function assertion(results, a, i) {
  const label = a.name ?? `assertion ${i + 1}`;
  const caseRe = globToRegex(a.case ?? '*');
  const cases = results.filter((r) => caseRe.test(r.case));
  if (!cases.length) return check(label, false, `no case matches "${a.case}"`);
  const problems = [];
  for (const c of cases) {
    if (a.messages !== undefined && c.messages.length !== a.messages) problems.push(`${c.case}: ${c.messages.length} messages, expected ${a.messages}`);
    const msgs = a.message ? [c.messages[a.message - 1]].filter(Boolean) : c.messages;
    const hasContent = a.contains || a.notContains || a.regex;
    if (hasContent && !msgs.length) problems.push(`${c.case}: no ${a.message ? `message ${a.message}` : 'messages'} to check`);
    for (const [k, m] of msgs.entries()) {
      const where = `${c.case}#${a.message ?? k + 1}`;
      const values = fieldValues(m, a.field);
      const has = (s) => values.some((v) => (a.ignoreCase ? v.toLowerCase().includes(s.toLowerCase()) : v.includes(s)));
      for (const s of a.contains ?? []) if (!has(s)) problems.push(`${where}: missing ${JSON.stringify(s)}`);
      for (const s of a.notContains ?? []) if (has(s)) problems.push(`${where}: contains ${JSON.stringify(s)}`);
      for (const p of a.regex ?? []) if (!values.some((v) => new RegExp(p, a.ignoreCase ? 'i' : '').test(v))) problems.push(`${where}: no match /${p}/`);
    }
  }
  return check(label, problems.length === 0, problems.slice(0, 8).join('; '));
}

export function emails(ctx) {
  const e = requireSection(ctx.cfg, 'emails');
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'webstack-emails-'));
  const results = e.harness ? customHarness(ctx, e, out) : builtinHarness(ctx, e, out);
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(results, null, 2));
  for (const r of results) {
    r.messages.forEach((m, k) => {
      const base = path.join(out, `${r.case}-${k + 1}`);
      fs.writeFileSync(`${base}.html`, m.html ?? '');
      fs.writeFileSync(`${base}.txt`, `TO: ${m.to} (${m.toName ?? ''})\nREPLY-TO: ${m.replyTo ?? ''}\nSUBJECT: ${m.subject}\n\n${m.text ?? ''}`);
    });
    console.log(`${r.case.padEnd(20)} ${r.messages.length} message(s)  status ${r.status}  ${(r.response ?? '').trim().slice(0, 100)}`);
  }
  console.log(`output folder: ${out}`);
  console.log('---');

  const all = results.flatMap((r) => r.messages.map((m) => ({ ...m, case: r.case })));
  check('every case ran without a PHP fatal error', results.every((r) => !r.fatal), results.filter((r) => r.fatal).map((r) => `${r.case}: ${r.fatal}`).join('; '));
  check('at least one case ran', results.length > 0);
  const injected = all.filter((m) => ['to', 'toName', 'replyTo', 'subject'].some((f) => /[\r\n]/.test(m[f] ?? '')));
  check('no CR/LF in recipient, Reply-To or subject (header injection)', injected.length === 0, injected.map((m) => m.case).join(', '));
  const taint = e.taint ?? DEFAULT_TAINT;
  const raw = all.filter((m) => taint.some((t) => (m.html ?? '').includes(t)));
  check('no raw HTML from input in HTML bodies', raw.length === 0, raw.map((m) => `${m.case}: ${taint.find((t) => m.html.includes(t))}`).join('; '));
  const entity = /&(amp|lt|gt|quot|#0?39|apos);/;
  const doubled = all.filter((m) => entity.test(m.subject ?? '') || entity.test(m.text ?? ''));
  check('no HTML entities in subjects or plain text (double escaping)', doubled.length === 0, doubled.map((m) => m.case).join(', '));
  (e.assertions ?? []).forEach((a, i) => assertion(results, a, i));

  runHooks(ctx, 'emails', { out }, { WEBSTACK_OUT: out });
}
