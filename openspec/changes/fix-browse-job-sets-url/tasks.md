# Tasks: fix-browse-job-sets-url

- [x] Add `lookoutUrl?: string` field to `ArmadaContext` in `src/types/config.ts`
- [x] Add `lookoutUrl?: string` to `ResolvedConfig` in `src/types/config.ts`
- [x] Resolve `lookoutUrl` from context in `src/config/configManager.ts` with localhost fallback + warning
- [x] Add optional `authHeader?: string` to `LookoutConfig` in `src/api/lookoutClient.ts`
- [x] Pass `authHeader` in `httpPost()` calls in `src/api/lookoutClient.ts`
- [x] Replace hardcoded URL in `src/commands/browseJobSets.ts` with resolved config value
- [x] Warn in output channel if non-localhost `http://` URL is used (no TLS)
