/**
 * Shared formatters for trial restriction and reward metadata.
 * Used by TrialSelectView and TrialProgressView.
 */

export function renderRestriction(meta) {
  if (!meta) return "";
  switch (meta.type) {
    case "xp_multiplier":
      return `期間 XP ×${meta.value}`;
    case "cooldown_shift_multiplier":
      return `冷卻曲線右移 ×${meta.value}`;
    case "group_bonus_disabled":
      return "群組加成失效";
    case "none":
      return "無";
    default:
      return "";
  }
}

export function renderReward(meta) {
  if (!meta) return "";
  switch (meta.type) {
    case "permanent_xp_multiplier":
      return `永久 XP +${Math.round(meta.value * 100)}%`;
    case "cooldown_tier_override":
      return "永久冷卻區段提升";
    case "group_bonus_double":
      return "永久群組加成翻倍";
    case "trigger_achievement":
      return "解鎖啟程成就";
    default:
      return "";
  }
}
