#!/usr/bin/env node
// webstack: release, local Apache test, email, parity and security checks for
// React/Vite + PHP sites hosted on Apache/cPanel. Reads <project>/.claude/webstack.json.
import { deploy } from '../lib/apache.mjs';
import { loadConfig } from '../lib/config.mjs';
import { emails } from '../lib/emails.mjs';
import { parity } from '../lib/parity.mjs';
import { release } from '../lib/release.mjs';
import { security } from '../lib/security.mjs';
import { urlChecks } from '../lib/urlchecks.mjs';
import { StopError, summary } from '../lib/util.mjs';

const USAGE = `usage: node webstack.mjs <command> [options]

  validate                      check .claude/webstack.json
  release [--no-build]          lint, mirror check, build, zip, verify the zip
  apache-test [--no-build]      build, replace the local Apache test copy, run the URL checks
  url-checks [--base URL]       GET/HEAD checks only (--allow-remote for a non-local URL)
  emails                        render the real PHP emails with a stub mailer (never sends)
  parity [--name N] [arg]       compare PHP and TypeScript outputs that must be identical
  security [--base URL]         automated security probes (supports the review skill)`;

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) opts._.push(a);
    else if (['--base', '--name'].includes(a)) opts[a.slice(2)] = argv[++i];
    else opts[a.slice(2)] = true;
  }
  return opts;
}

const commands = {
  validate: () => console.log('webstack.json is valid'),
  release,
  'apache-test': deploy,
  'url-checks': urlChecks,
  emails,
  parity,
  security,
};

const [command, ...rest] = process.argv.slice(2);
if (!commands[command]) {
  console.log(USAGE);
  process.exit(command ? 2 : 0);
}
try {
  const ctx = loadConfig();
  await commands[command](ctx, parseArgs(rest));
  process.exit(command === 'validate' ? 0 : Math.min(summary(), 100));
} catch (err) {
  if (err instanceof StopError) {
    console.error(`STOP  ${err.message}`);
    process.exit(2);
  }
  throw err;
}
