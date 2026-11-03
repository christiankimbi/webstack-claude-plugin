import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const isWin = process.platform === 'win32';

let failures = 0;
export function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
  return ok;
}
export const failureCount = () => failures;
export function summary(extra = '') {
  console.log('---');
  console.log(`${failures} failed${extra ? `, ${extra}` : ''}`);
  return failures;
}

export class StopError extends Error {}
export function stop(message) {
  throw new StopError(message);
}

export function globToRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export function matchesAny(relPath, globs = []) {
  return globs.some((g) => globToRegex(g).test(relPath));
}

export function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

// cmd.exe expands %VAR% and !VAR! even inside quotes and has no escape for a quote
// within a quoted argument, so such arguments are refused rather than half-escaped.
function quoteWin(arg) {
  if (/["%!\r\n]/.test(arg)) stop(`Argument ${JSON.stringify(arg)} cannot be passed safely through cmd.exe (contains " % ! or a line break).`);
  if (arg === '') return '""';
  return /[\s&|<>^()]/.test(arg) ? `"${arg}"` : arg;
}

const resolved = new Map();
function resolveWin(cmd) {
  if (path.extname(cmd) || cmd.includes('/') || cmd.includes('\\')) return cmd;
  if (resolved.has(cmd)) return resolved.get(cmd);
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  for (const dir of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext.toLowerCase());
      if (fs.existsSync(full)) {
        resolved.set(cmd, full);
        return full;
      }
    }
  }
  return cmd;
}

// Commands are argument arrays from the trusted project config. Executables start
// without a shell; on Windows, .cmd/.bat shims (npm, npx) only start through cmd.exe,
// so only those get quoted arguments.
export function run(argv, { cwd, env, timeoutSeconds = 600, capture = false, input } = {}) {
  const [first, ...args] = argv;
  const cmd = isWin ? resolveWin(first) : first;
  const useShell = isWin && /\.(cmd|bat)$/i.test(cmd);
  const options = {
    cwd,
    env: { ...process.env, ...env },
    timeout: timeoutSeconds * 1000,
    stdio: capture ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'inherit', 'inherit'],
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    input,
    windowsHide: true,
  };
  const result = useShell
    ? spawnSync([cmd, ...args].map(quoteWin).join(' '), { ...options, shell: true })
    : spawnSync(cmd, args, options);
  if (result.error && result.error.code === 'ETIMEDOUT') {
    return { code: 124, stdout: result.stdout ?? '', stderr: `timed out after ${timeoutSeconds}s` };
  }
  if (result.error) return { code: 127, stdout: '', stderr: String(result.error.message) };
  return { code: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

export function substitute(argv, vars) {
  return argv.map((a) => a.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)));
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
