# tml-workflows

Shared GitHub Actions reusable workflows for the `tml-*` WordPress extensions (sold via EDD Software Licensing on thememylogin.com). Successor to the Bitbucket `tml-pipelines` repo, which is decommissioned once every extension has migrated here.

Each extension repo stays a thin caller — no build/deploy logic is duplicated per repo. `secrets: inherit` passes the org-level secrets (set once on the `theme-my-login` org, reachable by every private repo since the org is on GitHub Team) straight through.

## Workflows

- **`release-please.yml`** — wraps `googleapis/release-please-action`. On every push to `master`, maintains a standing release PR (version bump computed from Conventional Commits) or, once that PR is merged and a release is tagged, calls `release-deploy.yml`.
- **`release-deploy.yml`** — builds CSS/JS (`build.mjs`), generates the POT file, packages the zip (`zip.mjs`), uploads it to DigitalOcean Spaces, computes this release's changelog bullets from Conventional Commits since the previous tag (`bin/publish.php`, via `bin/lib/commits.php`), and publishes to EDD via the WP release endpoint (configured via `RELEASE_ENDPOINT_URL`).
- **`code-review.yml`** — wraps `anthropics/claude-code-action`. Comments on issues found, approves a clean review; never a hard block.
- **`lint-commits.yml`** — wraps `wagoid/commitlint-github-action`. Each calling repo needs its own `commitlint.config.js` (adapt from `theme-my-login-7`'s or the `CONTRIBUTING.md` doc).
- **`test.yml`** — `lint` (phpcs/WPCS via the calling repo's own `composer.json`/`phpcs.xml.dist`) and `phpunit` (the calling repo's own `composer.json`/`phpunit.xml.dist`/`tests/`, with a MySQL service provisioned the same way the base plugin's does; if the repo has `tests/phpunit/multisite.xml`, that suite runs too). The test *content* is per-repo, only the check shape is shared.
- **`build.yml`** — same `build.mjs` as the deploy job, as a PR-time sanity check. Shared by the base plugin and every extension alike (see `build.mjs` below for how one script serves both).

## `build.mjs`

One script, two auto-detected modes:

- **In place** (no `src/` directory) — today's typical extension shape. `assets/styles`, `assets/scripts`, `assets/images` (and their `admin/assets/` equivalents, if present) are compiled where they sit: each CSS/JS file gets an independent `.min` sibling written next to it, SVGs get optimized in place. Nothing to configure.
- **Build directory** (`src/` exists) — the base plugin's WordPress.org packaging convention. Everything under `src/` is copied to `build/` (the asset subtrees declared in `build.config.json` are excluded from the copy, since they're compiled separately), and a root-level `build.config.json` declares which files bundle into which named output per subtree, e.g.:
  ```json
  {
    "subtrees": [
      { "dir": "assets", "styles": { "theme-my-login": ["tml.css", "alerts.css"] }, "scripts": "theme-my-login" }
    ]
  }
  ```
  Verified byte-for-byte identical output against the base plugin's original standalone build script before this was adopted.

SVG optimization (svgo) runs automatically wherever an `images/` subdirectory is present, in either mode — no config needed. `postcss-nested` is always included in the CSS pipeline (a no-op on CSS that doesn't use nested syntax), so extensions get it for free if they ever want nested selectors.

## Consuming this as a dependency

Add it as a `devDependency` pointing at the repo directly (it's public, no auth needed):

```json
"devDependencies": {
  "tml-workflows": "github:theme-my-login/tml-workflows"
}
```

`npm ci`/`npm install` then makes `build.mjs`/`zip.mjs` available via `npx tml-build`/`npx tml-zip`, and `bin/publish.php` at `node_modules/tml-workflows/bin/publish.php` — no second checkout needed, and `npm ci` resolves to a specific commit SHA recorded in `package-lock.json`, so builds stay reproducible until something in the consuming repo explicitly runs `npm update tml-workflows`.

## Requirements on a consuming extension repo

- Root plugin file named `<repo-slug>.php`, extending `Theme_My_Login_Extension`, with an `x-release-please-version` marker comment on both the `Version:` header and the `protected $version = '...';` property (release-please's `extra-files` bumps these directly).
- `release-please-config.json` + `.release-please-manifest.json` at the repo root.
- `protected $item_id = <EDD download post ID>;` property — read directly by `bin/publish.php`.
- `tml-workflows` as a `devDependency` (see above) — needed by both `test.yml`'s `build` caller and `release-deploy.yml`.
- CSS/JS in `assets/styles`/`assets/scripts`, if any — `build.mjs` picks up whichever directories exist and skips the rest.
- Existing git tags following the `vX.Y.Z` convention.
- Its own `CONTRIBUTING.md` and `CLAUDE.md` — not provided by this repo, since Conventional Commits type rules and code conventions are repo-specific. Adapt both from `tml-favorites`, the reference extension for each; `CLAUDE.md` is auto-discovered by `code-review.yml`'s Claude Code action from the repo root with no workflow change needed.
- Its own `composer.json`/`phpcs.xml.dist`/`phpunit.xml.dist`/`tests/` for the `test.yml` checks — not provided by this repo, since the content is extension-specific. Adapt `composer.json`/`phpcs.xml.dist` from the base plugin's version; for `phpunit.xml.dist`/`tests/bootstrap.php`, adapt `tml-favorites`' version instead — it resolves the "needs the base plugin's own classes loaded" question by pulling TML core from WPackagist's `dev-trunk` (so the pin never needs bumping) and loading both plugins through a real `muplugins_loaded` bootstrap against a real DB.
- Five thin caller workflows:

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
    build:
      uses: theme-my-login/tml-workflows/.github/workflows/build.yml@main
  ```

## Org-level secrets/variables (set once on `theme-my-login`)

Secrets: `CI_RELEASE_TOKEN`, `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `RELEASE_PLEASE_APP_ID`, `RELEASE_PLEASE_APP_PRIVATE_KEY` (same GitHub App already installed for `theme-my-login/theme-my-login` — add each new repo to its installation's repo-access list), `CLAUDE_CODE_OAUTH_TOKEN`.

Variables: `RELEASE_ENDPOINT_URL`, `DO_SPACES_BUCKET`, `DO_SPACES_HOST`.

**`RELEASE_DRY_RUN` stays repo-level**, deliberately — each extension needs to be flippable to live independently of the others. Defaults safe: anything other than the literal string `false` is dry-run.

## Status

`build.mjs`/`zip.mjs` live at the repo root as an installable package, verified byte-identical against the base plugin's original build script.

The base plugin and one extension are fully onboarded and merged to their default branches, proving the pipeline end to end including a real WP-integration `phpunit` suite. Onboarding the rest of the extensions is in progress; use an already-onboarded repo as the reference for every requirement above, including its `CONTRIBUTING.md`/`CLAUDE.md`.
