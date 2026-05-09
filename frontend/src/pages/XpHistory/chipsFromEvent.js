import { mult } from "./format";
import { TIER2_RATE } from "./diminishTier";

const BLESSING_WARM_CURRENT = 1;

const fmtMult = n => (Number.isFinite(Number(n)) ? mult(n) : null);

export function chipsFromEvent(ev) {
  const chips = [];
  const m = ev.modifiers || {};

  if (ev.honeymoon_mult > 1 || m.honeymoon) {
    chips.push({ kind: "honeymoon", label: "🌱 蜜月", value: fmtMult(ev.honeymoon_mult) });
  }
  if (m.active_trial_star) {
    chips.push({
      kind: "trial",
      label: `⚔ ★${m.active_trial_star}`,
      value: fmtMult(ev.trial_mult),
    });
  }
  if (Array.isArray(m.blessings) && m.blessings.includes(BLESSING_WARM_CURRENT)) {
    const v = ev.blessing1_mult > 1 ? fmtMult(ev.blessing1_mult) : null;
    chips.push({ kind: "blessing", label: "🗣 暖流", value: v });
  }
  if (ev.group_bonus > 1) {
    chips.push({ kind: "group", label: "群組", value: fmtMult(ev.group_bonus) });
  }
  if (ev.diminish_factor != null && ev.diminish_factor < 1) {
    const tier = ev.diminish_factor === TIER2_RATE ? "dim2" : "dim3";
    chips.push({ kind: tier, label: "已遞減", value: fmtMult(ev.diminish_factor) });
  }
  if (m.permanent_xp_multiplier > 0) {
    chips.push({ kind: "perm", label: "永久", value: fmtMult(1 + m.permanent_xp_multiplier) });
  }
  return chips;
}
