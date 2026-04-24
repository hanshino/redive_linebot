import { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_INTERVAL = 60_000;
const TRIAL_STEP_LABELS = ["啟程", "刻苦", "律動", "孤鳴", "覺悟"];
// Approximate total XP required to reach Lv.100 (display-only estimate)
const APPROX_MAX_EXP = 95_200;

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
        label="✨ 覺醒者"
        size="small"
        sx={{
          fontWeight: 700,
          color: "#fff",
          background: reducedMotion ? "#6c5ce7" : "linear-gradient(90deg, #6c5ce7, #d63384)",
        }}
      />
    );
  }

  if (activeTrial) {
    const { color } = getStarConfig(activeTrial.star);
    return (
      <Chip
        label={`⚔️ ★${activeTrial.star} 試煉中`}
        size="small"
        sx={{ fontWeight: 700, color: color }}
        variant="outlined"
        color="default"
      />
    );
  }

  if (prestigeCount === 0) {
    return <Chip label="🌱 蜜月中" size="small" color="success" sx={{ fontWeight: 700 }} />;
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
    <Card variant="outlined" sx={{ mb: 3, borderRadius: 2 }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
          {profile?.pictureUrl && (
            <Avatar
              src={profile.pictureUrl}
              alt={profile.displayName}
              sx={{ width: 52, height: 52 }}
            />
          )}
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

function PrestigeStepper({ status }) {
  const { passedTrials = [], activeTrial } = status;

  // Which stars are passed?
  const passedStars = new Set(passedTrials.map(t => t.star));

  const activeStepIndex = activeTrial ? activeTrial.star - 1 : -1;

  // MUI Stepper: activeStep drives "completed" icons for steps before active.
  // We want fine-grained control, so we use the completed prop on StepLabel.
  return (
    <Stepper alternativeLabel activeStep={activeStepIndex} sx={{ mb: 3 }}>
      {TRIAL_STEP_LABELS.map((label, idx) => {
        const star = idx + 1;
        const isPassed = passedStars.has(star);
        const isActive = activeTrial?.star === star;

        return (
          <Step key={label} completed={isPassed}>
            <StepLabel
              StepIconProps={{
                completed: isPassed,
                active: isActive && !isPassed,
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
 * Six cases (priority evaluated top to bottom):
 *   A. awakened (prestigeCount >= 5)         → AwakenedView
 *   B. Lv=100, hasUnconsumedPassedTrial       → BlessingSelectView
 *   C. Lv=100, activeTrial present            → TrialProgressView
 *   D. Lv=100, idle                           → TrialSelectView
 *   E. Lv<100, activeTrial present            → LevelClimbView + TrialProgressView (compact)
 *   F. Lv<100, idle                           → LevelClimbView
 */
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

  // Case F: still climbing
  return <LevelClimbView {...sharedProps} />;
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
        timerRef.current = setTimeout(tick, BASE_INTERVAL);
      }
    } catch {
      backoffRef.current += 1;
      if (backoffRef.current >= 3) setConnError(true);
      // Retry with backoff only when a prior activeTrial was known and we haven't exhausted retries
      const prev = statusRef.current;
      if (prev?.activeTrial && backoffRef.current < 3) {
        const delay = BASE_INTERVAL * Math.pow(2, Math.min(backoffRef.current, 2));
        timerRef.current = setTimeout(tick, delay);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMutationError = useCallback(
    message => {
      showHint(message ?? "操作失敗，請稍後再試", "error");
    },
    [showHint]
  );

  useEffect(() => {
    tick(); // fires once; self-schedules if activeTrial present

    const onFocus = () => tick();
    const onVis = () => {
      if (document.hidden) {
        clearTimeout(timerRef.current);
      } else {
        tick();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [tick]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      {/* Page header */}
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        轉生之路
      </Typography>
      <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
        探索五道試煉，成為覺醒者
      </Typography>

      {/* Connection error banner (dismissible, keeps prior UI below) */}
      {connError && (
        <Alert
          severity="warning"
          onClose={() => setConnError(false)}
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" onClick={tick}>
              重試
            </Button>
          }
        >
          連線不穩，點此重試
        </Alert>
      )}

      {/* Auth guard */}
      {!loggedIn && <AlertLogin />}

      {/* Loading skeleton (only when we have no data yet) */}
      {loading && !status && (
        <Skeleton variant="rectangular" height={240} sx={{ borderRadius: 2, mb: 3 }} />
      )}

      {/* Main content — shown as soon as we have at least one successful fetch */}
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
    </Container>
  );
}
