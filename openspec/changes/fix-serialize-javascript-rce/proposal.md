## Why

Dependabot alert #18 (high severity): `serialize-javascript` ≤7.0.2 contains an RCE vulnerability via `RegExp.flags` and `Date.prototype.toISOString()`. It's a transitive dependency through `mocha@10.x`. The fix is to upgrade `mocha` from `^10.3.0` to `^11` which ships with `serialize-javascript@7.0.3` (patched).

## What Changes

- Upgrade `mocha` from `^10.3.0` to `^11` in `devDependencies`
- Run `npm install` to update `package-lock.json`
- Verify unit tests still pass with mocha v11

## Capabilities

### New Capabilities

- `secure-test-runner`: mocha devDependency ships with patched serialize-javascript, closing the RCE vector

### Modified Capabilities

<!-- none -->

## Impact

- `package.json`: mocha version bump in devDependencies
- `package-lock.json`: dependency tree update
- No changes to test files — mocha v11 is backward-compatible with v10 for this project's usage
- CI: unit tests must continue to pass
