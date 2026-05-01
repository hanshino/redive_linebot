import { useState, useEffect, useCallback, useRef } from "react";
import {
  Typography,
  Alert,
  Box,
  Card,
  CardContent,
  Avatar,
  LinearProgress,
  Chip,
  Skeleton,
  Stepper,
  Step,
  StepLabel,
  Button,
  useMediaQuery,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ShieldIcon from "@mui/icons-material/Shield";
import SpaIcon from "@mui/icons-material/Spa";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import { getPrestigeStatus } from "../../services/prestige";
import { getStarConfig } from "./starColors";
import LevelClimbView from "./LevelClimbView";
import TrialSelectView from "./TrialSelectView";
import TrialProgressView from "./TrialProgressView";
import BlessingSelectView from "./BlessingSelectView";
import AwakenedView from "./AwakenedView";
import {
  APPROX_MAX_EXP,
  TRIAL_UNLOCK_LEVEL,
  TRIAL_STEP_LABELS,
  POLL_INTERVAL_MS,
  AWAKENED_GRADIENT,
  AWAKENED_FALLBACK,
} from "./constants";

// ─── StarBadge chip ───────────────────────────────────────────────────────────

/**
 * Renders the single mutually-exclusive status Chip.
 * Priority: awakened > activeTrial > honeymoon > nothing.
 */
function StatusBadge({ status, reducedMotion }) {
  const { prestigeCount, awakened, activeTrial } = status;

  if (awakened || prestigeCount >= 5) {
    return (
      <Chip
        icon={<AutoAwesomeIcon />}
        label="覺醒者"
        size="small"
        sx={{
          fontWeight: 700,
          color: "#fff",
          background: reducedMotion ? AWAKENED_FALLBACK : AWAKENED_GRADIENT,
          "& .MuiChip-icon": { color: "#fff" },
        }}
      />
    );
  }

  if (activeTrial) {
    const { color } = getStarConfig(activeTrial.star);
    return (
      <Chip
        icon={<ShieldIcon />}
        label={`★${activeTrial.star} 試煉中`}
        size="small"
        sx={{ fontWeight: 700, color, "& .MuiChip-icon": { color } }}
        variant="outlined"
        color="default"
      />
    );
  }

  if (prestigeCount === 0) {
    return (
      <Chip
        icon={<SpaIcon />}
        label="蜜月中"
        size="small"
        color="success"
        sx={{ fontWeight: 700 }}
      />
    );
  }

  return null;
}

// ─── StatusCard ───────────────────────────────────────────────────────────────

function StatusCard({ status, profile, reducedMotion }) {
  const { prestigeCount, awakened, currentLevel, currentExp, activeTrial } = status;

  // Star display: ★★★☆☆ style, capped at 5
  const filledStars = Math.min(prestigeCount, 5);
  const emptyStars = 5 - filledStars;
  const starDisplay = "★".repeat(filledStars) + "☆".repeat(emptyStars);
  const prestigeLabel = awakened || prestigeCount >= 5 ? "覺醒者" : `第 ${prestigeCount} 次轉生`;

  // XP progress bar: cap at 100% once Lv >= 100
  const xpPercent = currentLevel >= 100 ? 100 : Math.min((currentExp / APPROX_MAX_EXP) * 100, 100);

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          <Avatar
            src={profile?.pictureUrl}
            alt={profile?.displayName ?? ""}
            sx={{ width: 52, height: 52, fontWeight: 700 }}
          >
            {profile?.displayName?.[0] ?? "?"}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle1" fontWeight={700} noWrap>
              {profile?.displayName ?? "—"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {starDisplay}&nbsp;{prestigeLabel}
            </Typography>
          </Box>
          <StatusBadge status={status} reducedMotion={reducedMotion} />
        </Box>

        <Box sx={{ mb: 0.5, display: "flex", justifyContent: "space-between" }}>
          <Typography variant="body2" fontWeight={600}>
            Lv.{currentLevel} / 100
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {currentExp.toLocaleString()} XP
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={xpPercent}
          sx={{
            height: 8,
            borderRadius: 4,
            "& .MuiLinearProgress-bar": { borderRadius: 4 },
          }}
        />

        {/* Show trial info inline when active */}
        {activeTrial && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            試煉中：{activeTrial.displayName}（★{activeTrial.star}）
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ─── 5-Step Stepper ───────────────────────────────────────────────────────────

/**
 * Highlights `activeTrial.star` when one is in progress; otherwise hints
 * the lowest non-passed star as "next up" — but only when the user can
 * actually act on it (Lv≥50 and no pending pass blocking trial selection).
 */
function computeStepperActiveIndex({
  activeTrial,
  currentLevel,
  passedStars,
  hasUnconsumedPassedTrial,
}) {
  if (activeTrial) return activeTrial.star - 1;
  if (currentLevel < TRIAL_UNLOCK_LEVEL) return -1;
  if (hasUnconsumedPassedTrial) return -1;
  for (let star = 1; star <= 5; star++) {
    if (!passedStars.has(star)) return star - 1;
  }
  return -1;
}

function PrestigeStepper({ status }) {
  const {
    passedTrials = [],
    activeTrial,
    currentLevel = 0,
    hasUnconsumedPassedTrial = false,
  } = status;

  const passedStars = new Set(passedTrials.map(t => t.star));
  const activeStepIndex = computeStepperActiveIndex({
    activeTrial,
    currentLevel,
    passedStars,
    hasUnconsumedPassedTrial,
  });

  return (
    <Stepper alternativeLabel activeStep={activeStepIndex}>
      {TRIAL_STEP_LABELS.map((label, idx) => {
        const star = idx + 1;
        const isPassed = passedStars.has(star);
        const isActive = idx === activeStepIndex && !isPassed;

        return (
          <Step key={label} completed={isPassed}>
            <StepLabel
              StepIconProps={{
                completed: isPassed,
                active: isActive,
              }}
            >
              <Typography variant="caption">{label}</Typography>
            </StepLabel>
          </Step>
        );
      })}
    </Stepper>
  );
}

// ─── ActionCard dispatcher ────────────────────────────────────────────────────

/**
 * Renders the appropriate subview based on server-side status.
 *
 * Eight cases (priority evaluated top to bottom):
 *   A.   awakened (prestigeCount >= 5)               → AwakenedView
 *   B.   Lv=100, hasUnconsumedPassedTrial             → BlessingSelectView
 *   C.   Lv=100, activeTrial present                  → TrialProgressView
 *   D.   Lv=100, idle                                 → TrialSelectView
 *   E.   Lv<100, activeTrial present                  → LevelClimbView + TrialProgressView (compact)
 *   F.   Lv<100, idle, hasUnconsumedPassedTrial       → LevelClimbView + PendingPrestigeBanner
 *   G1.  Lv<50,  idle, no pending pass                → LevelClimbView + TrialLockedBanner
 *   G2.  Lv 50–99, idle, no pending pass              → LevelClimbView + TrialSelectView
 *
 * One-trial-per-prestige-cycle: once a trial is passed, the player must
 * prestige (consume the pass at Lv.100) before starting another. The Lv.50
 * level gate applies on every cycle (including the first), keeping trial
 * selection aligned with the Lv.50 CTA milestone broadcast.
 */

function TrialLockedBanner({ status }) {
  const remaining = Math.max(TRIAL_UNLOCK_LEVEL - (status.currentLevel || 0), 0);
  return (
    <Alert icon={<ShieldIcon />} severity="info">
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        再升 {remaining} 級即可挑試煉
      </Typography>
      <Typography variant="body2" color="text.secondary">
        達到 Lv.{TRIAL_UNLOCK_LEVEL} 解鎖試煉選擇 — 試煉期間 XP 同時計入等級與試煉條件，60 天為期。
      </Typography>
    </Alert>
  );
}
function PendingPrestigeBanner({ status }) {
  const { passedTrials = [], unconsumedTrialIds = [] } = status;
  const pending = passedTrials.find(t => unconsumedTrialIds.includes(t.id));
  const cfg = pending ? getStarConfig(pending.star) : null;
  const label = pending ? `★${pending.star} ${pending.displayName}` : "上一道試煉";

  return (
    <Alert
      icon={<ShieldIcon />}
      severity="info"
      sx={{
        borderColor: cfg?.border || undefined,
        "& .MuiAlert-icon": cfg ? { color: cfg.text } : undefined,
      }}
    >
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 0.5 }}>
        {label} 已通過，等待轉生
      </Typography>
      <Typography variant="body2" color="text.secondary">
        累積到 Lv.100 即可完成轉生並挑選祝福，下一道試煉會在轉生後解鎖。
      </Typography>
    </Alert>
  );
}

function ActionCard({ status, onRefresh, onMutationError }) {
  const { awakened, prestigeCount, currentLevel, activeTrial, hasUnconsumedPassedTrial } = status;

  const isAwakened = awakened || prestigeCount >= 5;
  const isMaxLevel = currentLevel >= 100;

  const sharedProps = { status, onRefresh, onMutationError };

  if (isAwakened) {
    // Case A
    return <AwakenedView {...sharedProps} />;
  }

  if (isMaxLevel && hasUnconsumedPassedTrial) {
    // Case B
    return <BlessingSelectView {...sharedProps} />;
  }

  if (isMaxLevel && activeTrial) {
    // Case C
    return <TrialProgressView {...sharedProps} />;
  }

  if (isMaxLevel) {
    // Case D
    return <TrialSelectView {...sharedProps} />;
  }

  if (!isMaxLevel && activeTrial) {
    // Case E: climbing + trial in progress
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <LevelClimbView {...sharedProps} />
        <TrialProgressView {...sharedProps} compact />
      </Box>
    );
  }

  if (!isMaxLevel && hasUnconsumedPassedTrial) {
    // Case F: climbing + waiting for prestige (next trial locked)
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <LevelClimbView {...sharedProps} />
        <PendingPrestigeBanner status={status} />
      </Box>
    );
  }

  if (currentLevel < TRIAL_UNLOCK_LEVEL) {
    // Case G1: climbing + trial selection locked until Lv.50
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <LevelClimbView {...sharedProps} />
        <TrialLockedBanner status={status} />
      </Box>
    );
  }

  // Case G2: climbing + trial selection (XP double-counts during trials)
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <LevelClimbView {...sharedProps} />
      <TrialSelectView {...sharedProps} />
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Prestige() {
  const { loggedIn, profile } = useLiff();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connError, setConnError] = useState(false);
  const backoffRef = useRef(0);
  const timerRef = useRef(null);
  const statusRef = useRef(null);
  const tickRef = useRef(null);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  // Keep statusRef in sync so tick() can read latest status without stale closure
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    document.title = "轉生之路";
  }, []);

  const tick = useCallback(async () => {
    clearTimeout(timerRef.current);
    try {
      const s = await getPrestigeStatus();
      setStatus(s);
      setConnError(false);
      backoffRef.current = 0;
      if (s.activeTrial) {
        timerRef.current = setTimeout(() => tickRef.current?.(), POLL_INTERVAL_MS);
      }
    } catch {
      backoffRef.current += 1;
      if (backoffRef.current >= 3) setConnError(true);
      // Retry with backoff only when a prior activeTrial was known and we haven't exhausted retries
      const prev = statusRef.current;
      if (prev?.activeTrial && backoffRef.current < 3) {
        const delay = POLL_INTERVAL_MS * Math.pow(2, Math.min(backoffRef.current, 2));
        timerRef.current = setTimeout(() => tickRef.current?.(), delay);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const handleMutationError = useCallback(
    message => {
      showHint(message ?? "操作失敗，請稍後再試", "error");
    },
    [showHint]
  );

  useEffect(() => {
    tick(); // fires once; self-schedules if activeTrial present

    // visibilitychange covers both tab-switch and minimize; on modern browsers
    // it fires alongside `focus`, so listening to focus too would double-poll.
    const onVis = () => {
      if (document.hidden) {
        clearTimeout(timerRef.current);
      } else {
        tick();
      }
    };

    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tick]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        maxWidth: { md: 1100 },
        mx: "auto",
        width: "100%",
      }}
    >
      <Box>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          轉生之路
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          探索五道試煉，成為覺醒者
        </Typography>
      </Box>

      {connError && (
        <Alert
          severity="warning"
          onClose={() => setConnError(false)}
          action={
            <Button color="inherit" size="small" onClick={tick}>
              重試
            </Button>
          }
        >
          連線不穩，點此重試
        </Alert>
      )}

      {!loggedIn && <AlertLogin />}

      {loading && !status && (
        <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 2 }} />
      )}

      {status && (
        <>
          <StatusCard status={status} profile={profile} reducedMotion={reducedMotion} />
          <PrestigeStepper status={status} />
          <ActionCard status={status} onRefresh={tick} onMutationError={handleMutationError} />
        </>
      )}

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
