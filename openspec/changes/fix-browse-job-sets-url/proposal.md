## Why

`browseJobSets.ts` hardcodes `const lookoutUrl = 'http://localhost:30000'` on line 18. This means Browse Job Sets silently fails against any non-local Armada cluster — the most common production usage. Additionally, the `LookoutClient` sends no authentication headers and uses plain HTTP, exposing job metadata in transit. This is both a critical bug and a security issue.

## What Changes

1. Add `lookoutUrl` field to `ArmadaContext` in `src/types/config.ts`
2. Wire it through `configManager.ts` resolver and `ResolvedConfig`
3. Replace the hardcode in `browseJobSets.ts` with the resolved URL from config
4. Add authentication header support to `LookoutClient.httpPost()` using the current auth context
5. Enforce HTTPS by default; warn (don't silently allow) if `http://` is configured

## Perspectives

**Job Submitter**: This is a blocking bug — Browse Job Sets is simply broken for anyone using a real cluster. The fix makes it functional. The Lookout URL should be configurable in `~/.armadactl.yaml` alongside the existing `armadaUrl` field.

**VS Code Extension**: The `configManager.ts` resolver already handles `binocularsUrl` as a per-context field — `lookoutUrl` follows the same pattern. Fall back to a warning in the output channel if not configured rather than silently using localhost. Consistent with existing resolver conventions.

**DevSecOps**: This is the most urgent security fix in the entire feature list. Plain HTTP `http://localhost:30000` with no auth headers transmits job metadata (queue names, job set IDs, states, owner fields) in plaintext on non-local clusters. `LookoutClient.httpPost()` must support Bearer token / OIDC header from the current auth context. HTTPS must be default; an HTTP `lookoutUrl` should log a warning to the output channel.

**Armada Developer**: The Lookout v2 REST endpoint `POST /api/v1/jobs?backend=jsonb` is correct and already working. No API changes needed. The `lookoutUrl` is typically the Lookout service host (e.g. `https://lookout.armada.example.com`). If Lookout is behind the same auth proxy as Armada, the same OIDC token can be passed as `Authorization: Bearer <token>`. Some deployments may not have Lookout at all — handle graceful fallback.

## Security Considerations

- HTTPS enforced by default; warn if `http://` is used for non-localhost URLs
- Auth header (Bearer token from OIDC context) passed to all Lookout requests
- Lookout URL must come from config, not hardcoded or user-supplied at runtime

## Capabilities

### Modified Capabilities

- `lookoutClient`: Accepts configurable URL and optional auth header
- `browseJobSets`: Reads Lookout URL from resolved config instead of hardcode

## Impact

- `src/types/config.ts` — add `lookoutUrl?: string` to `ArmadaContext` and `ResolvedConfig`
- `src/config/configManager.ts` — resolve `lookoutUrl` from context config
- `src/api/lookoutClient.ts` — add `authHeader?: string` to `LookoutConfig`, pass in `httpPost`
- `src/commands/browseJobSets.ts` — remove hardcode, inject `lookoutUrl` from config
- `package.json` / README — document the new `lookoutUrl` config field
