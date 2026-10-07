# CI and Node Test Contract

This project runs unit tests directly with Node. CI uses Node 22 and Node 24. Astro/Vite supplies TypeScript, aliases, and extension resolution during development, but `node --test` does not; code loaded by tests must work in both environments.

## CI content preparation

The theme checkout excludes materialized content, data, and user configuration.
GitHub Actions sets `CONTENT_DIR` to `tests/fixtures/ci-content` and runs
`pnpm content:sync` before Astro diagnostics. `pnpm build` performs the same
sync as its first step. The fixture supplies a post, an about page, a series,
a moment, empty data collections, and image configuration pointing to a tracked
public logo. Music is disabled to avoid remote playlist requests during builds.

This makes theme checks reproducible without private content credentials,
including pull requests from forks. Production still resolves the real content
repository through `shirone.content.json` and its deployment credentials.
Tests for data resolvers must pass explicit items rather than assume a
particular site's content.

## Runtime boundaries

- Do not make a pure Node test path import a TypeScript module containing a runtime `enum`. Node's strip-only TypeScript loader does not support `enum`.
- When a Node test needs enum-shaped keys, expose string keys through an `.mjs` runtime bridge and keep the TypeScript declaration in a matching `.d.mts` file.
- TypeScript files loaded directly by Node must use explicit `.ts` extensions for relative imports. Do not rely on Vite aliases such as `@/`.
- User-facing copy must still go through `i18n()` and the `I18nKey` registry. A runtime bridge changes loading only; it must not duplicate translations or bypass the ten locale modules.

## Local validation order

After changing Markdown processing, i18n modules, or test loading paths, run:

```powershell
pnpm.cmd exec biome ci ./src
npx.cmd astro check
pnpm.cmd check:manifest
node --test "tests/**/*.test.mjs"
git diff --check
```

Do not run `astro check` in parallel with content-sync tests. Astro check triggers content synchronization, while `tests/content/*` uses temporary repository fixtures; concurrent runs can cause false failures such as empty stderr. Run the complete unit suite separately.

## GitHub Actions diagnosis

Inspect the run summary first, then the failed job logs:

```powershell
gh run view <run-id> --json status,conclusion,headSha,jobs,url
gh run view <run-id> --job <job-id> --log-failed
```

Reproduce the failed step locally with the same Node major version and command. Keep build, diagnostics, and unit-test failures separate; change implementation only when the failure reproduces in an isolated run.

## Before committing

- Review `git diff` and confirm locale files contain only required import or formatting changes.
- Stage paths explicitly. Never use `git add -A`, which can include `Shirone-Content/`, temporary fixtures, or build output.
- Use a conventional commit such as `fix(markdown): support direct Node markdown tests`.
