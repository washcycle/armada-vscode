# GitHub Actions Workflows

This directory contains GitHub Actions workflows for automated CI/CD of the Armada VSCode extension.

## Workflows

### 1. CI Workflow (`ci.yml`)

**Trigger**: Pull requests and pushes to `main` and `dev` branches

**Purpose**: Continuous integration - validates code quality and builds

**Steps**:
- Runs on multiple Node.js versions (18.x, 20.x) for compatibility
- Installs dependencies
- Runs ESLint for code quality
- Compiles TypeScript
- Runs tests
- Packages the extension as `.vsix` file (Node.js 20.x only)
- Uploads the `.vsix` as an artifact for review (Node.js 20.x only)

### 2. Release Please Workflow (`release-please.yml`)

**Trigger**: Pushes to `main` branch

**Purpose**: Automated release management using conventional commits

**How it works**:
- Analyzes commit messages following [Conventional Commits](https://www.conventionalcommits.org/)
- Creates/updates a release PR with:
  - Auto-generated changelog
  - Version bump based on commit types (feat, fix, etc.)
  - Updated package.json version
- When the release PR is merged, creates a GitHub release

**Commit Message Format**:
```
feat: add new feature (minor version bump)
fix: bug fix (patch version bump)
feat!: breaking change (major version bump)
chore: maintenance (no version bump)
```

### 3. Publish Workflow (`publish.yml`)

**Trigger**: When a GitHub release is published (manual or via release-please)

**Purpose**: Publishes the extension to Visual Studio Code Marketplace

**Steps**:
- Checks out the repository source code
- Installs dependencies
- Runs linter and tests
- Packages the extension
- Publishes to VS Code Marketplace using `VSCE_PAT` secret

## Setup Requirements

### For Publishing

To enable automatic publishing to the VS Code Marketplace, you need to:

1. **Create a Personal Access Token (PAT)**:
   - Go to [Azure DevOps](https://dev.azure.com/)
   - Navigate to User Settings → Personal Access Tokens
   - Create a new token with the following:
     - Name: `VSCode Marketplace Publishing`
     - Organization: All accessible organizations
     - Scopes: `Marketplace` → `Manage`
   - Copy the token (you won't be able to see it again)

2. **Add the token to GitHub Secrets**:
   - Go to your GitHub repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `VSCE_PAT`
   - Value: Paste your Personal Access Token
   - Click "Add secret"

3. **Configure the production environment** (recommended):
   - Go to your GitHub repository → Settings → Environments
   - Create a new environment named `production`
   - (Optional) Add required reviewers to approve deployments
   - (Optional) Add deployment branches rule to restrict which branches can deploy

### For Release Please

No additional setup required - uses the default `GITHUB_TOKEN` with appropriate permissions.

## Gitflow Strategy

The workflows support the following Gitflow pattern:

```
feature branches → dev → main → releases
```

1. **Development**: Create feature branches and open PRs to `dev`
   - CI workflow validates the changes
   
2. **Staging for Release**: Merge `dev` into `main`
   - CI workflow validates
   - Release Please creates/updates a release PR
   
3. **Release**: Merge the release PR
   - GitHub release is created automatically
   - Publish workflow deploys to marketplace

## Manual Release (if needed)

If you need to create a release manually:

1. Go to GitHub → Releases → "Draft a new release"
2. Create a new tag (e.g., `v0.2.0`)
3. Generate release notes or write manually
4. Publish the release
5. The Publish workflow will automatically deploy to the marketplace

## Troubleshooting

### CI Workflow Fails

- Check the workflow logs in GitHub Actions tab
- Ensure all tests pass locally: `npm run lint && npm run compile && npm run test`
- Verify Node.js version compatibility

### Release Please Not Creating PRs

- Ensure commits follow [Conventional Commits](https://www.conventionalcommits.org/)
- Check that you're pushing to the `main` branch
- Review workflow permissions in repository settings

### Publish Workflow Fails

- Verify `VSCE_PAT` secret is set correctly
- Ensure the token has `Marketplace` → `Manage` permissions
- Check that `publisher` in `package.json` matches your marketplace publisher ID
- Review workflow logs for specific errors

## Resources

- [Release Please Documentation](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Publishing VS Code Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
