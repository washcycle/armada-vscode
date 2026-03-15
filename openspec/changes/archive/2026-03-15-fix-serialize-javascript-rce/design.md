## Context

`mocha@10.x` ships `serialize-javascript@6.0.2` which has CVE-2024-11831 (RCE via `RegExp.flags`). Mocha v11 ships `serialize-javascript@7.0.3` which is patched. Mocha v11 requires Node.js ≥18.18.0 — compatible with the project's Node 20 CI target.

Current: `mocha@^10.3.0` → `serialize-javascript@6.0.2` (vulnerable)
Target: `mocha@^11` → `serialize-javascript@7.0.3` (patched)

## Goals / Non-Goals

**Goals:**
- Close Dependabot alert #18 (high RCE in serialize-javascript)
- Unit tests continue to pass under mocha v11

**Non-Goals:**
- Upgrading any other dependencies
- Changing test structure or syntax

## Decisions

**Use `npm overrides` to force `serialize-javascript` to `>=7.0.3`.**
Rationale: mocha v11 pins `serialize-javascript: "^6.0.2"` — upgrading mocha alone does not pull in 7.x. npm `overrides` is the correct mechanism to resolve transitive dependencies to a safe version without forking or patching upstream. Also upgraded mocha to v11 for unrelated improvements. `overrides` entry is removed once mocha bumps their own dep.

## Risks / Trade-offs

- **[mocha v11 breaking change]** mocha v11 dropped some rarely-used APIs → Mitigation: project only uses `describe`/`it`/`before`/`after` which are stable across v10→v11; CI catches any breakage immediately
