import { check, run, substitute } from './util.mjs';

// Project hook scripts: trusted project code named in webstack.json, run after the
// built-in checks of a phase. Exit code 0 passes; their output is shown as-is.
export function runHooks(ctx, phase, vars = {}, env = {}) {
  const hooks = ctx.cfg.hooks?.[phase] ?? [];
  for (const h of hooks) {
    console.log(`--- hook: ${h.name}`);
    const r = run(substitute(h.command, vars), { cwd: ctx.root, env, timeoutSeconds: h.timeoutSeconds ?? 120 });
    check(`hook: ${h.name}`, r.code === 0, r.code === 124 ? r.stderr : `exit ${r.code}`);
  }
}
