---
name: php-ts-parity
description: Verify that logic implemented twice - in PHP for the Apache/cPanel production host and in TypeScript for the Node dev server (parsers, SEO text, email templates, pricing rules) - produces identical output, using the pairs listed in .claude/webstack.json. Use after changing either side of a mirrored pair, or when the input data changes shape. Only for projects that have .claude/webstack.json.
---

# PHP / TypeScript parity

`<plugin>` is the folder two levels above this skill's directory. From the project root:

```
node "<plugin>/bin/webstack.mjs" parity                     # every pair, default inputs
node "<plugin>/bin/webstack.mjs" parity --name "<pair>" <input>
```

Each `parity` entry names two commands, `php` and `ts`. Each prints JSON for the same input on stdout. `{php}` is replaced by the resolved PHP binary and `{arg}` by the input (the positional argument, else `defaultArg`). The runner deep-compares the two outputs and prints up to 10 differing paths.

It fails when:
- either side fails or prints something other than JSON;
- either output is empty (two broken sides must not "agree");
- any value differs.

The dump scripts belong to the project (e.g. `.claude/webstack/parity/`). They call the real functions directly and must not write caches or touch production data. When adding a pair, have both scripts emit the same shape: only the fields both sides are meant to share.

When something differs, check these first:
- Unicode and non-breaking spaces (PHP `trim()` vs JS `trim()`);
- number formatting (scientific notation, float precision);
- blank rows or empty strings vs null;
- key order in objects that are compared as lists.

Fix the side that is wrong, keep both in step, and re-run.
