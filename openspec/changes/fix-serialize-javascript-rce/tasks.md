## 1. Upgrade mocha

- [ ] 1.1 In `package.json`, change `"mocha": "^10.3.0"` → `"mocha": "^11"` in `devDependencies`
- [ ] 1.2 Run `npm install` to update `package-lock.json`
- [ ] 1.3 Verify `npm ls serialize-javascript` shows only versions ≥7.0.3

## 2. Verify tests pass

- [ ] 2.1 Run `npm run test:unit` and confirm all tests pass

## 3. Commit and push

- [ ] 3.1 Commit `package.json` and `package-lock.json` with message `fix: upgrade mocha to v11 to patch serialize-javascript RCE (CVE-2024-11831)`
- [ ] 3.2 Push and confirm Dependabot alert #18 is resolved
