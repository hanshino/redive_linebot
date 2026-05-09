function fmtMult(n) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return `×${Number(n).toFixed(2)}`;
}

export function chipsFromEvent(ev) {
  const chips = [];
  const m = ev.modifiers || {};

  if (m.honeymoon || (ev.honeymoon_mult != null && ev.honeymoon_mult > 1)) {
    chips.push({ kind: "honeymoon", label: "🌱 蜜月", value: fmtMult(ev.honeymoon_mult) });
  }
  if (m.active_trial_star) {
    chips.push({
      kind: "trial",
      label: `⚔ ★${m.active_trial_star}`,
      value: fmtMult(ev.trial_mult),
    });
  }
  if (Array.isArray(m.blessings) && m.blessings.includes(1)) {
    const v = ev.blessing1_mult > 1 ? fmtMult(ev.blessing1_mult) : null;
    chips.push({ kind: "blessing", label: "🗣 暖流", value: v });
  }
  if (ev.group_bonus != null && ev.group_bonus > 1) {
    chips.push({ kind: "group", label: "群組", value: fmtMult(ev.group_bonus) });
  }
  if (ev.diminish_factor != null && ev.diminish_factor < 1) {
    const tier = ev.diminish_factor === 0.3 ? "dim2" : "dim3";
    chips.push({ kind: tier, label: "已遞減", value: fmtMult(ev.diminish_factor) });
  }
  if (m.permanent_xp_multiplier && m.permanent_xp_multiplier > 0) {
    chips.push({ kind: "perm", label: "永久", value: fmtMult(1 + m.permanent_xp_multiplier) });
  }
  return chips;
}
