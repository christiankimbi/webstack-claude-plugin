# webstack

A Claude Code plugin (and Codex skill pack) for one kind of project: **React/Vite + TypeScript websites with a PHP backend, hosted on Apache/cPanel shared hosting**. These are typically slow WordPress sites rebuilt as a single-page app plus `public/api/*.php`. There is no Node in production; any Node server is for local development only.

It applies to a project only when that project has `.claude/webstack.json`. React projects with any other backend should not use it.

## What it contains

| Skill / agent | Command | Purpose |
|---|---|---|
| `release-zip` | `release` | Lint TypeScript and PHP, fail on PHP reference-copy drift, build, refuse builds containing secrets, zip with forward slashes, read the zip back and check required entries |
| `local-apache-test` | `apache-test`, `url-checks` | Replace a guarded local Apache test copy (WAMP/XAMPP/Laragon) with the build, run GET/HEAD URL checks |
| `check-emails` | `emails` | Render the real PHP form emails with a stub mailer (mail, sockets and curl disabled), check injection, escaping and project wording |
| `php-ts-parity` | `parity` | Prove PHP (production) and TypeScript (dev server) copies of the same logic give identical JSON |
| `php-site-security-review` | `security` | Automated probes plus a judgement-led review checklist |
| agent `email-checker` | `emails` | Runs the email harness and reviews every rendered email |

Everything runs through one dependency-free Node CLI: `plugins/webstack/bin/webstack.mjs` (Node 20+).

```
node <plugin>/bin/webstack.mjs <validate|release|apache-test|url-checks|emails|parity|security>
```

It prints `PASS`/`FAIL` lines and exits with the number of failures. `STOP` (exit 2) means a safety guard or configuration problem.

## Project settings

All project facts live in `<project>/.claude/webstack.json`. The schema is `plugins/webstack/schema/webstack.schema.json`, and `plugins/webstack/examples/webstack.json` is a starting point. Project-only scripts, such as parity dump scripts and email cases, sit beside it in `.claude/webstack/`. Content rules (company name, contact details, banned claims) stay in the project's `site-brief.md` / `AGENTS.md`.

For checks the settings file cannot express, use `hooks.<phase>`. Each hook is a command array with a timeout that runs after the built-in checks. Hooks are trusted project code.

## Safety rules built in

- **Local Apache test folder.** It is emptied before each copy, so the runner first requires a `.webstack-test-target` marker file. It also refuses folders near a drive root, folders overlapping the project, and folders overlapping any `neverTouch` path.
- **URL checks.** They use only GET and HEAD, never follow redirects, refuse the configured mail endpoints, and refuse non-local URLs unless `--allow-remote` is passed.
- **Email harness.** The built-in harness never copies the real mailer or config, defines only the constants listed in the settings file, keeps every copied path inside the temp folder, and runs PHP with `mail()`, sockets and curl disabled. A custom `emails.harness` is trusted project code; webstack cannot enforce that it never sends.
- **Release.** It refuses to zip `.env*`, `*secrets*.php`, `secrets/**`, `.git` or `node_modules`, and fails instead of syncing when the PHP reference copy has drifted.

## Install (Claude Code)

```
claude plugin marketplace add E:/Work/claude-plugins/webstack
claude plugin install webstack@webstack
```

Then enable it in each project that has `.claude/webstack.json` (`enabledPlugins` in that project's `.claude/settings.json`), or install it at user scope.

## Codex

Codex cannot load Claude plugins. In each project, `.agents/skills/<skill>/SKILL.md` wrappers point to this repository's source folder, `E:/Work/claude-plugins/webstack/plugins/webstack/skills/<skill>/SKILL.md`, which does not move between versions. They never point to Claude's versioned plugin cache. In those skills, `<plugin>` is `E:/Work/claude-plugins/webstack/plugins/webstack`.

## Versioning

Bump `version` in `plugins/webstack/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` together, note the change in `CHANGELOG.md`, then run `claude plugin marketplace update webstack`. Settings files carry `schemaVersion`; a breaking settings change bumps it.
