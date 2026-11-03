---
name: release-zip
description: Build a React/Vite + PHP website and package it as an upload-ready zip for Apache/cPanel hosting, using the project's .claude/webstack.json. Lints TypeScript and PHP, fails if the PHP reference copy drifted, refuses builds containing secrets, and verifies the zip. Use when the user asks to make a release, rebuild the zip or prepare a webstack site for upload. Only for projects that have .claude/webstack.json.
---

# Release zip

`<plugin>` is the folder two levels above this skill's directory (it holds `bin/webstack.mjs`). Run from the project root:

```
node "<plugin>/bin/webstack.mjs" release
```

It runs, in order, and stops at the first hard failure:
1. `release.lint` commands (e.g. `npm run lint`).
2. `php -l` on every file matching `release.phpLint`.
3. Mirror check: each `release.mirrors` copy must equal its source byte for byte. A difference **fails**; it is never synced automatically. Tell the user which files differ and ask before copying source → copy.
4. `release.build` (skip with `--no-build` to repackage the current `dist`).
5. Refuses to zip if the build contains `.env*`, `*secrets*.php`, `secrets/**`, `.git`, `node_modules` or `release.forbidden` matches.
6. Writes `release.zip` (`{date}` = today) with forward-slash paths and Unix permissions, leaving out `release.exclude`, then reads it back (CRC per file) and checks `release.required` entries.
7. Project hooks for the `release` phase.

PHP comes from `PHP_BIN`, then `php.candidates`, then `PATH`.

Report the zip path, size and file count, and every `FAIL`. Remind the user, in plain words:
- Extracting into `public_html` replaces the live site; back up first.
- Any data files in the zip (check `release.required`) overwrite the server's copies, which the owner may have updated on the server.
- Secrets files live outside the web root on the host and must be uploaded separately before the first deploy that needs them.
- Forms send real email once deployed.

Never upload anything yourself.
