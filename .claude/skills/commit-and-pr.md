---
name: commit-and-pr
description: Commit all current changes and create a GitHub Pull Request with a structured summary. Use this skill whenever the user says "commit", "push PR", "開 PR", "開 MR", "commit and push", "準備部署", or any variation of wanting to commit changes and/or create a pull request. Also trigger when the user says they're done with a feature and want to ship it.
---

# Commit and Create Pull Request

This skill handles the full workflow from uncommitted changes to a GitHub PR. It follows the project's commit conventions and optionally runs a pre-deployment check.

## Workflow

### Step 1: Assess the current state

Run these three commands in parallel:

```bash
git status                    # untracked + modified files
git diff                      # staged + unstaged changes
git log --oneline -5          # recent commit message style
```

Also check if the branch tracks a remote and whether it needs pushing:
```bash
git branch -vv
```

### Step 2: Draft the commit

Analyze the changes and write a commit message that:
- Follows the repo's conventional commit style (look at `git log` output)
- Uses the correct prefix: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`
- Includes a scope in parentheses when changes are focused on one area, e.g. `feat(achievement):`
- Summarizes the "why" in the first line (under 72 chars)
- Lists key changes as bullet points in the body if there are multiple logical changes
- Ends with `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

Stage specific files by name — avoid `git add -A` or `git add .` to prevent accidentally committing sensitive files (.env, credentials) or large binaries.

Use HEREDOC format for the commit message:
```bash
git commit -m "$(cat <<'EOF'
type(scope): short description

- detail 1
- detail 2

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Step 3: Push and create PR

If there are multiple logical groups of changes, consider splitting into separate commits. Otherwise one commit is fine.

Push the branch:
```bash
git push -u origin <branch-name>
```

Create the PR using `gh`:
```bash
gh pr create --title "<short title>" --body "$(cat <<'EOF'
## Summary
<bullet points describing the key changes>

## Test plan
<checklist of testing items, mark completed ones with [x]>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

PR title should be under 70 characters. Use the body for details.

### Step 4 (Optional): Pre-deployment check

After creating the PR, spawn a subagent (sonnet model) to investigate whether there are deployment prerequisites the user should be aware of. This is a quick sanity check, not a full review.

The subagent should look for:
- **New environment variables** — scan changed files for `process.env.NEW_VAR` references not in `.env.example`
- **New migrations** — check if there are migration files in the diff that need to be run on production
- **New dependencies** — check if `package.json` changed (new packages to install)
- **Config changes** — check if `config/default.json` or similar config files changed
- **Cron jobs** — check if crontab config changed (new scheduled tasks)
- **Breaking API changes** — check if route definitions or API response shapes changed

Report findings concisely. If nothing noteworthy is found, say so briefly. This check should take under 30 seconds.

Example subagent prompt:
```
Review the git diff for branch <branch> against main to identify deployment prerequisites.

Check for:
1. New process.env references not in .env.example
2. New migration files that need `yarn migrate` on production
3. New dependencies in package.json
4. Changes to config files (config/default.json, crontab.config.js)
5. New or modified API routes
6. Any breaking changes

Be concise — list only actionable items. If nothing noteworthy, say "No special deployment steps needed."
```

## Important Notes

- Never commit files that likely contain secrets (.env, credentials.json)
- Always create NEW commits rather than amending, unless explicitly asked
- If a pre-commit hook fails, fix the issue and create a NEW commit (don't amend)
- Never force-push without explicit user permission
- The Co-Authored-By line is required on every commit
