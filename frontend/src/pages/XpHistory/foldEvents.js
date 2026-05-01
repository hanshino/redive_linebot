// Mirrors spec §14 modifierHash.
export function modifierHash(ev) {
  const m = ev.modifiers || {};
  const tier =
    ev.diminish_factor == null
      ? "none"
      : ev.diminish_factor === 1
        ? 1
        : ev.diminish_factor === 0.3
          ? 2
          : 3;
  const blessings = Array.isArray(m.blessings) ? [...m.blessings].sort((a, b) => a - b) : [];
  return JSON.stringify({
    honeymoon: !!m.honeymoon,
    trial: m.active_trial_star ?? 0,
    blessings,
    perm: Number(m.permanent_xp_multiplier ?? 0).toFixed(2),
    tier,
  });
}

export function foldEvents(events) {
  const groups = new Map();
  for (const ev of events) {
    const minute = ev.ts.slice(0, 16);
    const key = `${minute}|${ev.group_id}|${modifierHash(ev)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  const folded = [];
  for (const [key, evs] of groups) {
    evs.sort((a, b) => b.ts.localeCompare(a.ts));
    folded.push({
      key,
      events: evs,
      ts: evs[0].ts,
      minute: evs[0].ts.slice(0, 16),
      group_id: evs[0].group_id,
      count: evs.length,
      raw_total: evs.reduce((s, e) => s + (Number(e.raw_exp) || 0), 0),
      eff_total: evs.reduce((s, e) => s + (Number(e.effective_exp) || 0), 0),
      degraded: evs[0].base_xp == null,
    });
  }
  folded.sort((a, b) => b.ts.localeCompare(a.ts));
  return folded;
}
