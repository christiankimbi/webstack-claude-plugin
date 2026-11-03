---
name: check-emails
description: Render a PHP website's real form emails (the handlers in its api folder) with a stub mailer that records messages instead of sending them, then check header injection, HTML escaping, double escaping and the project's own required and banned wording from .claude/webstack.json. Use after changing form handlers, email helpers, the mailer or the forms. Only for projects that have .claude/webstack.json.
---

# Check emails (no real mail is sent)

`<plugin>` is the folder two levels above this skill's directory. From the project root:

```
node "<plugin>/bin/webstack.mjs" emails
```

## How it works

The built-in harness copies only the handlers (`emails.handlers`) and helpers (`emails.copy`) from `emails.apiDir` into a temp folder. It then writes stubs in place of the real mailer and config files (`emails.mailerFile`, `emails.configFile`, default `mailer.php` / `config.php`).

- The stub config defines only `emails.stubConstants`.
- The stub mailer has the same class name (`emails.mailerClass`) and records each `send()` call, mapping its arguments by `emails.sendArgs`.
- PHP runs with `mail()`, sockets and curl disabled.

Each JSON file in `emails.cases` becomes the POST body for the handler whose prefix starts its name (`rfq-mixed.json` → `handlers.rfq`).

**Contract the project must follow for the built-in harness:** handlers load the mailer and config from their own folder (`require __DIR__ . '/mailer.php'`), send through one mailer class with a fixed `send()` argument order, and read the body from `php://input` or `$_POST`. Projects built differently set `emails.harness` to their own command. That command reads the cases from `WEBSTACK_CASES` and writes `manifest.json` into `WEBSTACK_OUT` in the same format: `[{case, handler, response, status, fatal, messages: [{to, toName, replyTo, subject, html, text}]}]`. The no-send guarantee covers only the built-in harness; before running a custom one, read it and confirm it cannot reach a real mailer.

A case whose name matches no handler prefix fails, and a content assertion fails when it selects no message.

## Checks

Built in:
- no PHP fatal errors;
- no CR/LF in the recipient, Reply-To or subject;
- none of the `emails.taint` strings appear raw in HTML bodies;
- no HTML entities (`&amp;`) in subjects or plain text.

Project assertions (`emails.assertions`): `case` (glob), optional `message` (1-based), `field` (`to`, `replyTo`, `subject`, `text`, `html` or `any`), `contains`, `notContains`, `regex`, `messages` (expected count), `ignoreCase`.

## Then read the output

The run prints an output folder holding `manifest.json` plus `<case>-<n>.txt` / `.html` for each message.
- Read every `.txt`.
- For layout, serve the folder with `php -S 127.0.0.1:8098 -t <folder>` in the background, view it in the browser pane, then stop the server.
- Check the wording against the project's `site-brief.md` / `AGENTS.md` content rules: company name, contact details, promised turnaround, banned claims.

Add a case file to cover a new field or scenario. Never POST to the real endpoints, locally or live, to test email.
