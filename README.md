# tml-workflows

Shared GitHub Actions reusable workflows for the `tml-*` WordPress extensions (sold via EDD Software Licensing on thememylogin.com). Successor to the Bitbucket `tml-pipelines` repo, which is decommissioned once every extension has migrated here.

Each extension repo stays a thin caller — no build/deploy logic is duplicated per repo. `secrets: inherit` passes the org-level secrets (set once on the `theme-my-login` org, reachable by every private repo since the org is on GitHub Team) straight through.

## Workflows

- **`release-please.yml`** — wraps `googleapis/release-please-action`. On every push to `master`, maintains a standing release PR (version bump computed from Conventional Commits) or, once that PR is merged and a release is tagged, calls `release-deploy.yml`.
- **`release-deploy.yml`** — builds CSS/JS (`bin/build.mjs`), generates the POT file, packages the zip (`bin/zip.mjs`), uploads it to DigitalOcean Spaces, computes this release's changelog bullets from Conventional Commits since the previous tag (`bin/publish.php`, via `bin/lib/commits.php`), and publishes to EDD via the WP release endpoint (configured via `RELEASE_ENDPOINT_URL`).
- **`code-review.yml`** — wraps `anthropics/claude-code-action`. Comments on issues found, approves a clean review; never a hard block.
- **`lint-commits.yml`** — wraps `wagoid/commitlint-github-action`. Each calling repo needs its own `commitlint.config.js` (adapt from `theme-my-login-7`'s or the `CONTRIBUTING.md` doc).
- **`test.yml`** — direct port of the base plugin's `test.yml` shape: `lint` (phpcs/WPCS via the calling repo's own `composer.json`/`phpcs.xml.dist`), `build` (same `build.mjs` as the deploy job, as a PR-time sanity check), `phpunit` (the calling repo's own `composer.json`/`phpunit.xml.dist`/`tests/`, with a MySQL service provisioned the same way the base plugin's does). The test *content* is per-repo, only the check shape is shared.

`bin/build.mjs` and `bin/zip.mjs` are checked out fresh into `.tml-workflows/` at deploy time (see `release-deploy.yml`) rather than duplicated into every extension's own repo — one source of truth for the build/package logic.

## Requirements on a consuming extension repo

- Root plugin file named `<repo-slug>.php`, extending `Theme_My_Login_Extension`, with an `x-release-please-version` marker comment on both the `Version:` header and the `protected $version = '...';` property (release-please's `extra-files` bumps these directly).
- `release-please-config.json` + `.release-please-manifest.json` at the repo root.
- `protected $item_id = <EDD download post ID>;` property — read directly by `bin/publish.php`.
- CSS/JS in `assets/styles`/`assets/scripts`, if any — `bin/build.mjs` picks up whichever directories exist and skips the rest.
- Existing git tags following the `vX.Y.Z` convention.
- Its own `composer.json`/`phpcs.xml.dist`/`phpunit.xml.dist`/`tests/` for the `test.yml` checks — not provided by this repo, since the content is extension-specific (see the plan doc's Component 2 for the base plugin's version to adapt from, and the open question about WP-integration tests needing the base plugin's own classes loaded).
- Four thin caller workflows:

  ```yaml
  # .github/workflows/release.yml
  on:
    push:
      branches: [master]
  jobs:
    release:
      uses: theme-my-login/tml-workflows/.github/workflows/release-please.yml@main
      secrets: inherit
  ```

  ```yaml
  # .github/workflows/code-review.yml
  on:
    pull_request:
      types: [opened, synchronize, ready_for_review, reopened]
  jobs:
    review:
      uses: theme-my-login/tml-workflows/.github/workflows/code-review.yml@main
      secrets: inherit
  ```

  ```yaml
  # .github/workflows/lint-commits.yml
  on:
    pull_request:
      types: [opened, edited, synchronize]
      branches: [master]
  jobs:
    lint-commits:
      uses: theme-my-login/tml-workflows/.github/workflows/lint-commits.yml@main
  ```

  ```yaml
  # .github/workflows/test.yml
  on:
    pull_request:
      branches: [master]
  jobs:
    test:
      uses: theme-my-login/tml-workflows/.github/workflows/test.yml@main
  ```

## Org-level secrets/variables (set once on `theme-my-login`)

Secrets: `CI_RELEASE_TOKEN`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `RELEASE_PLEASE_APP_ID`, `RELEASE_PLEASE_APP_PRIVATE_KEY` (same GitHub App already installed for `theme-my-login/theme-my-login` — add each new repo to its installation's repo-access list), `CLAUDE_CODE_OAUTH_TOKEN`.

Variables: `RELEASE_ENDPOINT_URL`, `DO_SPACES_BUCKET`, `DO_SPACES_HOST`.

**`RELEASE_DRY_RUN` stays repo-level**, deliberately — each extension needs to be flippable to live independently of the others. Defaults safe: anything other than the literal string `false` is dry-run.

## Status

Scaffolded 2026-08-17, not yet proven end-to-end. Next: set the org secrets/variables, then prove the chain against a throwaway pilot repo before wiring `tml-favorites` itself.
