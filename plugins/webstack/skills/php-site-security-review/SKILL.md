---
name: php-site-security-review
description: Security review for a React/Vite + PHP website on Apache/cPanel - secrets kept outside the web root and out of git, protected data folders, form handlers (validation, escaping, header injection, false success), CORS, mailer TLS, rate limits and anything else that would expose the project's protected data. Runs the automated probes from .claude/webstack.json, then a judgement-led code review. Use before a release, after changes to the api folder, .htaccess, the dev server or the forms, or when asked for a security review. Only for projects that have .claude/webstack.json.
---

# PHP site security review

Review the current code (or the diff the user names). Report findings ranked by severity: file:line, failure scenario, fix. Do not edit files unless the user asked for fixes. Never print secret values, and never open secret-bearing files (`.env*`, `secrets/`, `*secrets*.php`); checking that they exist and are ignored is enough.

## 1. Automated probes (support, not an audit)

`<plugin>` is the folder two levels above this skill's directory. From the project root:

```
node "<plugin>/bin/webstack.mjs" security
```

It checks:
- `security.mustBeIgnored` paths are git-ignored, and no secret-bearing file is tracked;
- `security.secretPatterns` (e.g. a literal password assignment) have no match in tracked files;
- the built `dist/` holds no secrets;
- with the local Apache copy running, `security.protectedUrls` return 401/403/404.

Run `check-emails` and `local-apache-test` too when the change touches mail or `.htaccess`.

## 2. Review by reading the code

**Protected data.** Read the project's `AGENTS.md` for what must never be downloadable or exported in bulk.
- The data folders are denied in `.htaccess` and `robots.txt`.
- No endpoint returns the whole dataset.
- Paging is capped.
- Rate limits cannot be bypassed with spoofed headers (`X-Forwarded-For`, a forged crawler user agent without a reverse-DNS check).

**Secrets.**
- Settings load from outside the document root (environment or a file above `public_html`) through one function.
- Health or debug endpoints expose only booleans.
- The release zip has no secrets file.

**Form handlers.**
- Required fields and lengths are validated on the server; list sizes are capped.
- Every user value in HTML email goes through an escaping helper, and header values are stripped of CR/LF.
- Reply-To takes only a validated address.
- A send failure produces a failure the UI shows. Flag handlers that return HTTP 200 with `success:false` when the UI treats any 200 as success.

**Transport and headers.**
- Mailer TLS certificate checking (`verify_peer`, `rejectUnauthorized`) is on.
- CORS is not `*` on a same-origin site.
- Cache headers on API responses match intent (`no-store` for per-user or rate-limited data), and `.htaccess` does not override them.

**Dev server parity.** The Node dev server must not weaken any of the above in code that mirrors production behaviour.

**Content claims.** Flag certifications or standards in the copy that `site-brief.md` does not confirm.

## Output

1. A findings table: severity, file:line, issue, fix.
2. The checks that passed.
3. What could not be verified, such as the live host's configuration or the firewall.
