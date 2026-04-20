---
name: upgrade-packages
description: Audit and upgrade npm packages in app/ and frontend/ to mitigate security risks and keep dependencies current. Runs `ncu` + `yarn audit`, classifies each upgrade as safe / needs-review / skip based on semver and known breaking changes, delegates deeper investigation to the document-specialist agent, then applies approved upgrades, runs `yarn install`, and smoke-tests the result. Use this skill whenever the user says "升級套件", "update packages", "upgrade deps", "check package updates", "ncu", "資安檢查", "audit packages", or any variation of wanting to refresh dependencies / patch vulnerabilities. Also trigger when the user mentions CVE, vulnerability scan, or outdated npm packages in the context of this repo.
---

# Upgrade Packages

Two workspaces only: `app/` (Bottender backend + Express + Socket.IO) and `frontend/` (React 19 + MUI 7 + Vite). Both use **yarn**, not npm. Run every workspace step inside its own directory.

## Workflow

### Step 1 — Scan both workspaces in parallel

For each of `app/` and `frontend/`, run these two commands concurrently (one background task per command is fine; they're read-only):

```bash
# prefer global ncu; fallback to npx
ncu --version >/dev/null 2>&1 && ncu || npx -y npm-check-updates

yarn audit --level moderate   # security advisory scan
```

`yarn audit` exits non-zero when advisories exist — that's expected signal, not failure. Capture the full output.

Parallelise across workspaces: 4 commands total, all independent.

**Transitive advisories matter.** Most advisories in `app/` come through `bottender` (→ `ngrok`, `@slack/rtm-api`, `body-parser`, etc.), not direct deps. `ncu -u` only rewrites top-level `package.json`, so it cannot fix these. For each transitive advisory, consider:

- Is the vulnerable path reachable from our code? (e.g. `bottender>ngrok>*` is dev-tunnel-only; we use ngrok standalone on the host — largely not reachable in prod.)
- Can a yarn `resolutions` block in the root `package.json` pin the transitive dep to a patched version without breaking the parent?
- Is there a newer `bottender` or fork that cuts the dep chain?

Include these questions in the needs-review bucket when the CVE is critical/high.

### Step 2 — Classify each outdated package

For every package `ncu` flags, tag it into one of three buckets using semver + context:

| Bucket | Criteria |
|--------|----------|
| **safe** | patch / minor bump, no known breaking changelog entry, or explicitly addresses a `yarn audit` advisory |
| **needs-review** | major bump, or minor bump on a package known to change APIs (React, MUI, Knex, Bottender, Vite, ESLint, Jest, Socket.IO, react-router-dom) |
| **skip** | pinned on purpose (e.g. React 19 ecosystem locks, Bottender 1.x), or breaking change with no security benefit |

Hints from `CLAUDE.md`:
- Frontend is mid-migration to MUI 7 card layouts — watch MUI/Emotion majors.
- Backend is CommonJS. Don't silently bump packages that have gone ESM-only (chalk, node-fetch, got v12+, nanoid v4+, etc.) — those are `skip` or `needs-review`.
- Knex + `better-sqlite3` have native bindings — major bumps are `needs-review`.
- `react-router-dom` v7 and MUI `x-data-grid` v8 are already in use, don't regress.

### Step 3 — Research needs-review items (delegate)

For every package in the **needs-review** bucket, delegate a short investigation to the `oh-my-claudecode:document-specialist` agent (sonnet). Batch them: one agent call per workspace, listing every needs-review package in that workspace. The agent should pull the changelog / release notes / migration guide and report back.

Agent prompt template:

```
Investigate major/risky upgrades for these packages in <app|frontend>/:

<package@current> -> <latest>
<package@current> -> <latest>
...

For each, report in under 60 words:
1. Breaking changes that affect this project (CommonJS backend / React 19 + MUI 7 frontend).
2. Security fixes included (CVE IDs if any).
3. Recommendation: upgrade / defer / skip, with one-line reason.

Prefer official changelog, release notes, or GitHub releases. If the package is ESM-only on the new major and the target is `app/` (CommonJS), flag it as skip.
```

Run both workspace agent calls in parallel when both have needs-review entries.

### Step 4 — Present recommendations to the user

Show a single consolidated report, grouped by workspace and bucket. One table per workspace:

```
### app/
| package | current | latest | bucket | reason |
|---------|---------|--------|--------|--------|
| lodash  | 4.17.20 | 4.17.21 | safe | patches prototype pollution CVE-2021-23337 |
| knex    | 2.5.1   | 3.1.0  | needs-review | major; agent says compatible, migration doc linked |
| chalk   | 4.1.2   | 5.3.0  | skip | ESM-only, backend is CommonJS |

### frontend/
...

### Security summary
- <N> advisories from `yarn audit` — <X> fixed by the safe bucket, <Y> require needs-review upgrades.
```

End with a clear prompt: "Apply all safe + the needs-review ones I recommended upgrading? Or pick a subset?" **Wait for user approval before any write action.** Never upgrade unattended.

### Step 5 — Apply approved upgrades

Once the user confirms, for each workspace that has approved upgrades:

```bash
cd <workspace>

# rewrite package.json for the approved set only
ncu -u <pkg1> <pkg2> <pkg3>

# install
yarn install
```

Pass explicit package names to `ncu -u` — never `ncu -u` with no args, that would also pull in the skip bucket.

If `yarn install` fails, stop and surface the error. Don't attempt to auto-resolve peer-dep conflicts without asking.

### Step 6 — Smoke test

After install succeeds, verify each workspace hasn't obviously regressed:

- **app/**: `yarn lint` + `yarn test` (jest). Run tests in the background with `run_in_background` — they take a few minutes.
- **frontend/**: `yarn lint` + `yarn build` (Vite build — no test runner configured per `CLAUDE.md`).

Run lint synchronously (fast), tests/build in the background. Collect results when they finish.

If anything fails:
1. Report the failure with the exact error.
2. Ask the user whether to roll back (`git checkout -- package.json yarn.lock && yarn install`) or investigate. Don't auto-rollback.

### Step 7 — Report

Final summary to the user:

```
Upgraded:
  app/: <N> packages (<list>)
  frontend/: <N> packages (<list>)

Deferred (needs-review, not upgraded): <list with one-line reason each>
Skipped: <list with one-line reason each>

Security advisories resolved: <N> / <total>
Remaining advisories: <list, if any>

Smoke tests: lint ✓  test ✓  build ✓
```

Do **not** commit. The user has a separate `commit-and-pr` skill for that — mention it as a next step if appropriate.

## Notes

- Root `package.json` exists but only holds workspace glue scripts (`yarn test:app`, `yarn lint:frontend`, etc.). Don't run `ncu` on it.
- `migration/` is SQL files, not a Node package. Ignore.
- Respect `.env` — never log secrets if a package's postinstall script prints them.
- If `ncu` and `yarn audit` both come back empty for a workspace, say so in one line and skip to the next workspace. Don't manufacture work.
- Node engines in `app/package.json` and `frontend/package.json` constrain what versions are actually usable — honour them, and call out if an upgrade target exceeds the declared engine.
