# Phase 5: Frontend Cutover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace old `frontend/` (CRA + React 17) with `frontend-next/` (Vite + React 19) as the production frontend.

**Architecture:** Delete old frontend, rename frontend-next → frontend, update ports/configs to match existing infrastructure expectations. No nginx template changes needed — just align Vite dev port to 3000.

**Tech Stack:** Git, Docker, Vite, nginx

---

### Task 1: Delete old frontend and rename frontend-next

**Files:**
- Delete: `frontend/` (entire directory)
- Rename: `frontend-next/` → `frontend/`

**Step 1: Remove old frontend directory**

```bash
git rm -r frontend/
```

**Step 2: Move frontend-next to frontend**

```bash
git mv frontend-next/ frontend/
```

**Step 3: Commit the rename**

```bash
git add -A
git commit -m "refactor: replace old CRA frontend with new Vite frontend"
```

---

### Task 2: Update package name and dev port

After rename, update configs so the new frontend fits into existing infrastructure.

**Files:**
- Modify: `frontend/package.json` — name field
- Modify: `frontend/vite.config.js` — dev server port 3001 → 3000
- Modify: `frontend/Dockerfile.dev` — expose port 3001 → 3000

**Step 1: Update package.json name**

In `frontend/package.json`, change:
```json
"name": "frontend-next"
```
to:
```json
"name": "frontend"
```

**Step 2: Update vite.config.js port**

In `frontend/vite.config.js`, change `port: 3001` to `port: 3000` so nginx dev configs work without changes.

**Step 3: Update Dockerfile.dev port**

In `frontend/Dockerfile.dev`, change `EXPOSE 3001` to `EXPOSE 3000`.

**Step 4: Commit**

```bash
git add frontend/package.json frontend/vite.config.js frontend/Dockerfile.dev
git commit -m "chore: update package name and align dev port to 3000"
```

---

### Task 3: Update CI/CD pipeline

**Files:**
- Modify: `.github/workflows/main.yml` — remove obsolete `REACT_APP_GOOGLE_ANALYTICS_ID` build arg

The `context: ./frontend` path already points to the correct (renamed) directory. The Dockerfile inside is the Vite-based one that builds correctly.

However, the old CRA build arg `REACT_APP_GOOGLE_ANALYTICS_ID` is not used by the Vite frontend (no GA integration). Remove it.

**Step 1: Remove build-args from CI**

In `.github/workflows/main.yml`, remove lines 62-63:
```yaml
          build-args: |
            REACT_APP_GOOGLE_ANALYTICS_ID=${{ secrets.GOOGLE_ANALYTICS_ID }}
```

**Step 2: Commit**

```bash
git add .github/workflows/main.yml
git commit -m "ci: remove unused CRA build arg from frontend build"
```

---

### Task 4: Build verification

**Step 1: Run build**

```bash
cd frontend && yarn build
```

Expected: Build succeeds, output in `frontend/dist/`.

**Step 2: Verify Dockerfile builds**

```bash
docker build -t redive_frontend_test frontend/
```

Expected: Multi-stage build succeeds (node build → nginx serve).

---

### Task 5: Clean up planning docs

**Files:**
- Delete: `docs/plans/2026-02-27-frontend-rewrite-design.md`
- Delete: `docs/plans/2026-02-27-frontend-rewrite-phase1.md`
- Delete: `docs/plans/2026-02-27-frontend-rewrite-phase2.md`
- Delete: `docs/plans/2026-02-27-frontend-rewrite-phase4.md` (if exists)
- Delete: `docs/plans/2026-02-27-frontend-rewrite-phase5.md` (this file)

**Step 1: Remove plan docs**

These are development artifacts, not needed in the final codebase.

```bash
rm -rf docs/plans/
git add -A
git commit -m "chore: remove frontend rewrite planning docs"
```

---

## Summary of changes

| What | Before | After |
|------|--------|-------|
| Frontend directory | `frontend/` (CRA) + `frontend-next/` (Vite) | `frontend/` (Vite only) |
| Package name | `frontend-next` | `frontend` |
| Dev port | 3001 | 3000 |
| CI build-args | `REACT_APP_GOOGLE_ANALYTICS_ID` | (none) |
| Build output | `build/` (CRA) | `dist/` (Vite) |

**No changes needed to:**
- `docker-compose.traefik.yml` — uses image `hanshino/redive_frontend`, unchanged
- `docker/config/redive.template` — serves static from `/usr/share/nginx/html`, unchanged
- `docker/config/redive.dev.template` — proxies to `frontend:3000`, now correct
- `docker/nginx/default.conf` — proxies to `host.docker.internal:3000`, now correct
- `makefile` — references service name `frontend`, unchanged
