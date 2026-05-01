// Cumulative XP required to reach Lv.100 under the current curve
// (round(13 * level^2) at level 100). Single source of truth used by
// both StatusCard's progress bar and LevelClimbView's remaining-XP copy.
export const APPROX_MAX_EXP = 130_000;

// Trial selection unlocks at this level (aligns with Lv.50 CTA milestone).
export const TRIAL_UNLOCK_LEVEL = 50;

// Trials run for 60 days. Per-minute polling was overkill — 5 min keeps the
// page responsive on focus while avoiding API hammering on long idles.
export const POLL_INTERVAL_MS = 5 * 60_000;

// Stage label per star tier, displayed in the 5-step Stepper.
export const TRIAL_STEP_LABELS = ["啟程", "刻苦", "律動", "孤鳴", "覺悟"];

// Pulse animation for time-urgent UI. Caller still gates with reduced-motion.
export const PULSE_ANIMATION_SX = {
  "@keyframes prestigePulse": {
    "0%, 100%": { opacity: 1 },
    "50%": { opacity: 0.4 },
  },
  animation: "prestigePulse 2s ease-in-out infinite",
};

// Awakened gradient — kept identical between StatusBadge chip and AwakenedView banner.
export const AWAKENED_GRADIENT = "linear-gradient(135deg, #6c5ce7 0%, #d63384 100%)";
export const AWAKENED_FALLBACK = "#6c5ce7";
