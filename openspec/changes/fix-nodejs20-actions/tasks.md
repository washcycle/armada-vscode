## 1. Update ci.yml

- [x] 1.1 Upgrade `actions/setup-node@v4` → `@v5` in `.github/workflows/ci.yml`
- [x] 1.2 Upgrade `actions/upload-artifact@v4` → `@v5` in `.github/workflows/ci.yml`

## 2. Update publish.yml

- [x] 2.1 Upgrade `actions/checkout@v4` → `@v5` in `.github/workflows/publish.yml`
- [x] 2.2 Upgrade `actions/setup-node@v4` → `@v5` in `.github/workflows/publish.yml`

## 3. Update integration-tests.yml

- [x] 3.1 Upgrade `actions/checkout@v4` → `@v5` in `.github/workflows/integration-tests.yml`
- [x] 3.2 Upgrade `actions/setup-node@v4` → `@v5` in `.github/workflows/integration-tests.yml`

## 4. Verify

- [ ] 4.1 Push to a branch and confirm CI runs with no Node.js 20 deprecation annotations
