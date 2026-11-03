import fs from 'node:fs';
import path from 'node:path';
import { run, stop } from './util.mjs';

export const CONFIG_REL = '.claude/webstack.json';

export function findProjectRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, CONFIG_REL))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) stop(`No ${CONFIG_REL} found from ${start} upwards. This project is not set up for webstack.`);
    dir = parent;
  }
}

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrArr = (v) => Array.isArray(v) && v.every(isStr);
const isCmd = (v) => isStrArr(v) && v.length > 0;

// Hand-written so the runner needs no dependencies; schema/webstack.schema.json
// documents the same shape for editors.
export function validate(cfg) {
  const errors = [];
  const need = (cond, msg) => {
    if (!cond) errors.push(msg);
  };
  need(cfg.schemaVersion === 1, 'schemaVersion must be 1');
  const known = ['$schema', 'schemaVersion', 'php', 'release', 'apache', 'urlChecks', 'emails', 'parity', 'security', 'hooks'];
  for (const k of Object.keys(cfg)) need(known.includes(k), `unknown section "${k}"`);

  const keys = (obj, label, allowed) => {
    if (obj === undefined) return;
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return errors.push(`${label} must be an object`);
    for (const k of Object.keys(obj)) need(allowed.includes(k), `${label}: unknown field "${k}"`);
  };
  keys(cfg.php, 'php', ['env', 'candidates']);
  keys(cfg.release, 'release', ['lint', 'build', 'dist', 'zip', 'phpLint', 'mirrors', 'exclude', 'required', 'forbidden']);
  keys(cfg.apache, 'apache', ['target', 'baseUrl', 'neverTouch']);
  keys(cfg.urlChecks, 'urlChecks', ['forbiddenPaths', 'checks']);
  for (const [i, c] of (cfg.urlChecks?.checks ?? []).entries()) {
    keys(c, `urlChecks.checks[${i}]`, ['name', 'path', 'method', 'status', 'timeoutSeconds', 'headers', 'body']);
    keys(c?.body, `urlChecks.checks[${i}].body`, ['contains', 'notContains', 'regex', 'counts']);
    for (const k of c?.body?.counts ?? []) {
      need(isStr(k.pattern) && [k.exact, k.min, k.max].some((n) => Number.isInteger(n)), `urlChecks.checks[${i}].body.counts needs pattern and exact/min/max`);
    }
  }
  keys(cfg.emails, 'emails', ['harness', 'apiDir', 'handlers', 'copy', 'mailerFile', 'configFile', 'mailerClass', 'sendArgs', 'stubConstants', 'cases', 'taint', 'assertions']);
  const FIELDS = ['to', 'toName', 'replyTo', 'subject', 'text', 'html', 'any'];
  for (const [i, a] of (cfg.emails?.assertions ?? []).entries()) {
    keys(a, `emails.assertions[${i}]`, ['name', 'case', 'message', 'messages', 'field', 'contains', 'notContains', 'regex', 'ignoreCase']);
    need(a?.field === undefined || FIELDS.includes(a.field), `emails.assertions[${i}].field must be one of ${FIELDS.join(', ')}`);
    for (const f of ['contains', 'notContains', 'regex']) need(a?.[f] === undefined || isStrArr(a[f]), `emails.assertions[${i}].${f} must be a list of strings`);
    need(a?.message === undefined || (Number.isInteger(a.message) && a.message >= 1), `emails.assertions[${i}].message must be 1 or more`);
  }
  for (const [i, p] of (Array.isArray(cfg.parity) ? cfg.parity : []).entries()) keys(p, `parity[${i}]`, ['name', 'php', 'ts', 'defaultArg', 'timeoutSeconds']);
  keys(cfg.security, 'security', ['mustBeIgnored', 'allowTracked', 'secretPatterns', 'protectedUrls']);
  keys(cfg.hooks, 'hooks', ['release', 'url-checks', 'emails', 'parity', 'security']);

  if (cfg.php !== undefined) {
    need(cfg.php.candidates === undefined || isStrArr(cfg.php.candidates), 'php.candidates must be a list of paths');
  }
  const r = cfg.release;
  if (r !== undefined) {
    need(r.lint === undefined || (Array.isArray(r.lint) && r.lint.every(isCmd)), 'release.lint must be a list of commands');
    need(r.build === undefined || isCmd(r.build), 'release.build must be a command');
    need(isStr(r.dist), 'release.dist is required');
    need(isStr(r.zip) && r.zip.endsWith('.zip'), 'release.zip must be a path ending in .zip');
    need(r.phpLint === undefined || isStrArr(r.phpLint), 'release.phpLint must be a list of globs');
    need(
      r.mirrors === undefined || (Array.isArray(r.mirrors) && r.mirrors.every((m) => isStr(m.source) && isStr(m.copy))),
      'release.mirrors entries need source and copy',
    );
    need(r.exclude === undefined || isStrArr(r.exclude), 'release.exclude must be a list of globs');
    need(r.required === undefined || isStrArr(r.required), 'release.required must be a list of zip paths');
    need(r.forbidden === undefined || isStrArr(r.forbidden), 'release.forbidden must be a list of globs');
  }
  const a = cfg.apache;
  if (a !== undefined) {
    need(isStr(a.target), 'apache.target is required');
    need(isStr(a.baseUrl) && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(a.baseUrl), 'apache.baseUrl must be a localhost URL');
    need(a.neverTouch === undefined || isStrArr(a.neverTouch), 'apache.neverTouch must be a list of folders');
  }
  const u = cfg.urlChecks;
  if (u !== undefined) {
    need(u.forbiddenPaths === undefined || isStrArr(u.forbiddenPaths), 'urlChecks.forbiddenPaths must be a list');
    need(Array.isArray(u.checks), 'urlChecks.checks must be a list');
    for (const [i, c] of (u.checks ?? []).entries()) {
      need(isStr(c.name) && isStr(c.path), `urlChecks.checks[${i}] needs name and path`);
      need(c.method === undefined || ['GET', 'HEAD'].includes(c.method), `urlChecks.checks[${i}].method must be GET or HEAD`);
    }
  }
  const e = cfg.emails;
  if (e !== undefined) {
    need(isStr(e.cases), 'emails.cases (folder of JSON cases) is required');
    if (e.harness !== undefined) need(isCmd(e.harness), 'emails.harness must be a command');
    else {
      need(isStr(e.apiDir), 'emails.apiDir is required');
      need(e.handlers && Object.keys(e.handlers).length > 0 && Object.values(e.handlers).every(isStr), 'emails.handlers maps a case prefix to a handler file');
      need(e.copy === undefined || isStrArr(e.copy), 'emails.copy must be a list of files');
      const real = [e.mailerFile ?? 'mailer.php', e.configFile ?? 'config.php'];
      need(!(e.copy ?? []).some((f) => real.includes(f)), 'emails.copy must not include the real mailer or config file');
    }
    need(e.assertions === undefined || Array.isArray(e.assertions), 'emails.assertions must be a list');
  }
  if (cfg.parity !== undefined) {
    need(Array.isArray(cfg.parity), 'parity must be a list');
    for (const [i, p] of (cfg.parity ?? []).entries()) {
      need(isStr(p.name) && isCmd(p.php) && isCmd(p.ts), `parity[${i}] needs name, php and ts commands`);
    }
  }
  if (cfg.hooks !== undefined) {
    for (const [phase, list] of Object.entries(cfg.hooks)) {
      need(Array.isArray(list) && list.every((h) => isStr(h.name) && isCmd(h.command)), `hooks.${phase} entries need name and command`);
    }
  }
  return errors;
}

export function loadConfig() {
  const root = findProjectRoot();
  const file = path.join(root, CONFIG_REL);
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    stop(`${CONFIG_REL} is not valid JSON: ${err.message}`);
  }
  const errors = validate(cfg);
  if (errors.length) stop(`${CONFIG_REL} has problems:\n  - ${errors.join('\n  - ')}`);
  return { root, cfg, abs: (p) => path.resolve(root, p) };
}

export function requireSection(cfg, name) {
  if (cfg[name] === undefined) stop(`${CONFIG_REL} has no "${name}" section.`);
  return cfg[name];
}

let phpBin;
export function resolvePhp(cfg) {
  if (phpBin) return phpBin;
  const envName = cfg.php?.env ?? 'PHP_BIN';
  const candidates = [process.env[envName], ...(cfg.php?.candidates ?? []), 'php'].filter(Boolean);
  for (const c of candidates) {
    if (c !== 'php' && !fs.existsSync(c)) continue;
    if (run([c, '-v'], { capture: true, timeoutSeconds: 20 }).code === 0) return (phpBin = c);
  }
  stop(`PHP not found. Set ${envName} or add php.candidates to ${CONFIG_REL}.`);
}
