# Portainer Git-Managed Stack CI/CD via API

## The Insight

Portainer's "redeploy from git" does **not** recreate containers unless the rendered compose file's text changes. Webhook fire / API call returns success and the stack's `ConfigHash` updates to the new commit, but `UpdateDate` and container `CreatedAt` stay the same. With `:latest` hard-coded in compose, **CI silently deploys nothing** even though new images were pushed.

The fix is GitOps-style: image tags must be a Portainer stack-env variable that changes per deploy. CI updates that env via API as part of the redeploy call.

## Why This Matters

Symptom: GitHub Actions deploy step shows ✅ "Stack redeployed" / HTTP 200 / Discord notification fires. But:

- `docker ps --filter name=redive_linebot` shows containers from hours ago
- `docker inspect ... --format '{{.Config.Image}}'` shows the old digest under the same `:latest` tag
- Stack JSON's `UpdateDate` (Unix epoch) doesn't advance

You only see the gap if you specifically compare container creation time against the deploy timestamp. Easy to think the pipeline works when it doesn't.

## Recognition Pattern

You're working on the redive_linebot deploy pipeline (Portainer 2.39 CE, stack id #23, endpoint #3) and one of:

- Container `CREATED AT` is older than the deploy that "succeeded"
- Stack `UpdateDate` from `/api/stacks/{id}` doesn't move after the webhook
- Anyone proposes pushing only `:latest` and "Portainer will pick it up via webhook"
- New build hash didn't propagate; behaviour matches the previously-deployed code

## The Approach

Three rules for any change to `.github/workflows/main.yml` or `docker-compose.traefik.yml`:

**1. Compose images must be parameterized:**
```yaml
image: hanshino/redive_backend:${BACKEND_IMAGE_TAG:-latest}
```
The `:-latest` fallback only matters for the rare case where stack env hasn't been set yet (e.g. first deploy after recreate). In normal operation BACKEND_IMAGE_TAG and FRONTEND_IMAGE_TAG are pinned to a commit SHA.

**2. CI must push BOTH `:latest` and `:${{ github.sha }}`** — `:latest` keeps backward compatibility, `:${{ github.sha }}` is what the running compose actually points at.

**3. Deploy step calls `PUT /api/stacks/{id}/git/redeploy`** with the full env array, replacing only the two image-tag entries.

## Three API gotchas you will hit

**a. `/api/stacks/{id}/git/redeploy` is PUT, not POST.** POST returns 405. With `curl -sf` + `bash -e` (the GHA default), the script aborts with bare "exit code 22" and nothing else — your own `echo "::error::..."` never runs because curl already exited. Always do:
```bash
HTTP_STATUS=$(curl -s -o /tmp/response -w "%{http_code}" -X PUT ...)
if [ "$HTTP_STATUS" != "200" ]; then
  echo "::error::redeploy failed HTTP $HTTP_STATUS"
  cat /tmp/response   # ← critical: show what Portainer actually said
  exit 1
fi
```

**b. `env` is a full replacement, not a patch.** GET the stack, mutate the array, send all 45+ entries back:
```bash
NEW_ENV=$(jq --arg sha "$SHA" '
  map(select(.name != "BACKEND_IMAGE_TAG" and .name != "FRONTEND_IMAGE_TAG"))
  + [{name: "BACKEND_IMAGE_TAG", value: $sha},
     {name: "FRONTEND_IMAGE_TAG", value: $sha}]
' <<< "$CURRENT_ENV")
```
Sending only the two new tags wipes every other secret on the stack.

**c. There is no API to convert a manual stack to git-managed.** You must DELETE the stack and POST a new one via `/api/stacks/create/standalone/repository`. Delete preserves bind-mount volumes and external networks but **wipes Portainer-managed env vars** — back them up to a chmod-600 file in `~/.local/state/portainer-backups/` first. Stack ID changes after recreate (we went 13 → 23); update `PORTAINER_STACK_ID` secret accordingly.

**d. Initial git-stack creation requires `autoUpdate.webhook` OR `autoUpdate.interval` set.** An empty `autoUpdate: {}` returns 400 "Webhook or Interval must be provided" even if you plan to drive deploys exclusively from CI. Generate a UUID for the webhook field even if you never use it.

## Why this is the right design

- Compose hash genuinely changes per deploy (env interpolation differs) → Portainer's idempotence check works as designed; no need for `forceUpdate: true` hacks
- Stack env always records the deployed SHA → audit trail, and rollback = `PUT /git/redeploy` with old SHA values
- `/git/redeploy` is synchronous — CI fails fast if Portainer rejects the payload, instead of fire-and-forget webhook silently no-op'ing
