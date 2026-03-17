## 1. Retroactive Release Trigger

- [x] 1.1 Push an empty conventional commit: `git commit --allow-empty -m "chore: trigger release for #39 #40 #41"`
- [x] 1.2 Push to `main` and verify release-please opens a 0.2.4 PR within ~1 minute of the workflow run

## 2. PR Title Validation Workflow

- [x] 2.1 Create `.github/workflows/semantic-pr.yml` using `amannn/action-semantic-pull-request@v5` on `pull_request_target` with `types: [opened, edited, synchronize, reopened]`
- [x] 2.2 Configure allowed types in the workflow: `feat, fix, chore, docs, refactor, test, perf, build, ci, style, revert`
- [x] 2.3 Verify the workflow runs and passes on a test PR with a valid title

## 3. Branch Protection

- [ ] 3.1 In GitHub repo Settings → Branches → `main` branch protection rule, add `Semantic PR title` as a required status check
- [ ] 3.2 Confirm a PR with a non-conventional title is blocked from merging

## 4. AGENT.md Documentation

- [x] 4.1 Create `AGENT.md` at the repo root documenting: PR title convention, all allowed types, why enforcement exists, and an example of a valid title
- [x] 4.2 Mention that the `Semantic PR title` check is required and non-conventional titles will be blocked
