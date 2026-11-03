---
name: local-apache-test
description: Deploy a React/Vite + PHP website's build to a local Apache test copy (WAMP, XAMPP, Laragon or similar) and run production-like URL checks from .claude/webstack.json - status codes, protected folders, server-rendered content, headers, sitemaps. Use to test .htaccess rules and PHP endpoints the way an Apache/cPanel host runs them. Only for projects that have .claude/webstack.json.
---

# Local Apache test

`<plugin>` is the folder two levels above this skill's directory. From the project root:

```
node "<plugin>/bin/webstack.mjs" apache-test            # build, replace the test copy, run the checks
node "<plugin>/bin/webstack.mjs" apache-test --no-build # reuse the current dist
node "<plugin>/bin/webstack.mjs" url-checks             # checks only
```

The test folder (`apache.target`) is **emptied** before each copy, so the runner refuses unless:
- the folder exists and contains an empty `.webstack-test-target` marker file,
- it is not near a drive root, does not overlap the project folder, and does not overlap any `apache.neverTouch` folder.

If the marker is missing, tell the user and ask before creating it; never create it in a folder you have not confirmed is a throwaway test copy.

URL checks send only GET and HEAD, never follow redirects, and refuse any path in `urlChecks.forbiddenPaths` (the mail endpoints). `url-checks` refuses a non-local base URL unless `--allow-remote` is passed; use that only when the user asks for checks against a live site.

**Never submit forms on the local Apache site**: its PHP loads the real mail settings and sends real email. Use the `check-emails` skill to inspect emails.

Report each `FAIL` with its detail. For visual checks, open `apache.baseUrl` in the browser pane.
