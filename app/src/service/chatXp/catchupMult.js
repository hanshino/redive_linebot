// Silent catch-up multiplier.
//
// Rubber-bands accounts that are BEHIND the expected lifetime-XP-for-their-age
// back up toward the target pace. Applied AFTER diminish (alongside trial /
// permanent multipliers) so it isn't swallowed by the 3% tail the way honeymoon
// is. On-track players and whales resolve to exactly 1.0 — they are never
// boosted, so the committed core's pace is untouched.
//
// ponytail: silent, log-only balance knob — no broadcast, no UI. It compensates
// the math for behind-but-present climbers; it does NOT (and cannot) move the
// real bottleneck, which is attendance. Tune entirely via config.
//
// mult = clamp(targetRate * ageDays / max(lifetime, floor), 1.0, maxBoost)

function computeCatchupMult(status, cfg, nowMs) {
  if (!cfg || cfg.enabled === false) return 1.0;

  // created_at may be absent on a stale cached state — treat unknown age as
  // on-track (no boost) rather than guessing.
  const createdAt = status.created_at ? new Date(status.created_at).getTime() : NaN;
  if (!Number.isFinite(createdAt)) return 1.0;

  const ageDays = (nowMs - createdAt) / 86400000;
  if (ageDays < cfg.graceDays) return 1.0; // newcomers ride the honeymoon instead

  const lifetime = (status.prestige_count || 0) * cfg.lvMaxExp + (status.current_exp || 0);
  const expected = cfg.targetRate * ageDays;
  const ratio = expected / Math.max(lifetime, cfg.floor);

  if (!Number.isFinite(ratio) || ratio <= 1) return 1.0; // on-track or ahead
  return Math.min(cfg.maxBoost, ratio);
}

module.exports = { computeCatchupMult };
