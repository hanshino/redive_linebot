import { useState, useEffect } from "react";
import { Box, Typography, LinearProgress, Alert, Button, Grid, useMediaQuery } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BlockIcon from "@mui/icons-material/Block";
import AlertDialog from "../../components/AlertDialog";
import { forfeitTrial } from "../../services/prestige";
import { getStarConfig } from "./starColors";
import { renderRestriction, renderReward } from "./trialMeta";
import { PULSE_ANIMATION_SX } from "./constants";

// ─── Countdown helpers ────────────────────────────────────────────────────────

/**
 * Returns { text, color, expired, urgent } given remainingMs.
 */
function buildCountdown(remainingMs) {
  if (remainingMs <= 0) {
    return { text: null, color: null, expired: true, urgent: false };
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalHours >= 24) {
    const days = totalDays;
    const hours = totalHours - days * 24;
    return {
      text: `剩餘 ${days} 天 ${hours} 時`,
      color: "text.primary",
      expired: false,
      urgent: false,
    };
  }

  if (totalMinutes >= 60) {
    const hours = totalHours;
    const mins = totalMinutes - hours * 60;
    return {
      text: `剩餘 ${hours} 小時 ${mins} 分`,
      color: "warning.main",
      expired: false,
      urgent: false,
    };
  }

  return {
    text: `剩餘 ${totalMinutes} 分鐘`,
    color: "error.main",
    expired: false,
    urgent: true,
  };
}

// ─── TrialProgressView ────────────────────────────────────────────────────────

export default function TrialProgressView({ status, onRefresh, onMutationError, compact = false }) {
  const activeTrial = status.activeTrial;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Client-side clock tick (every minute) for live countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!activeTrial) return null;

  const { star, displayName, requiredExp, progress, expiresAt, restrictionMeta, rewardMeta } =
    activeTrial;
  // starColor is a theme token string (e.g. "warning.main") — relies on MUI
  // sx resolving theme tokens inside nested selectors. Don't pass it to a raw
  // CSS property outside `sx` without `theme.palette.<x>.main` lookup.
  const { color: starColor, tierLabel } = getStarConfig(star);

  const xpPercent = Math.min((progress / requiredExp) * 100, 100);
  const remainingMs = new Date(expiresAt).getTime() - now;
  const countdown = buildCountdown(remainingMs);

  const restrictionText = renderRestriction(restrictionMeta);
  const rewardText = renderReward(rewardMeta);

  const handleForfeit = async () => {
    setSubmitting(true);
    try {
      await forfeitTrial();
      onRefresh();
      setDialogOpen(false);
    } catch (err) {
      onMutationError(err?.response?.data?.message ?? "無法放棄試煉");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Compact mode (used in Case E: Lv<100 side-card) ──────────────────────
  if (compact) {
    return (
      <Box
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 2,
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
        }}
      >
        {/* Header */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" sx={{ color: starColor, fontWeight: 700 }}>
            {"★".repeat(star) + "☆".repeat(5 - star)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tierLabel}
          </Typography>
          <Typography variant="caption" fontWeight={700} sx={{ ml: 0.5 }}>
            {displayName}
          </Typography>
        </Box>

        {/* Progress bar */}
        <Box>
          <LinearProgress
            variant="determinate"
            value={xpPercent}
            sx={{
              height: 6,
              borderRadius: 3,
              "& .MuiLinearProgress-bar": {
                borderRadius: 3,
                backgroundColor: starColor,
              },
            }}
          />
          <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              {progress.toLocaleString()} / {requiredExp.toLocaleString()} XP
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {Math.round(xpPercent)}%
            </Typography>
          </Box>
        </Box>

        {/* Countdown */}
        {countdown.expired ? (
          <Alert severity="error" sx={{ py: 0.5, fontSize: 13 }}>
            已失效 — 請放棄並重新挑戰
          </Alert>
        ) : (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: countdown.color,
              ...(countdown.urgent && !reducedMotion ? PULSE_ANIMATION_SX : {}),
            }}
          >
            <AccessTimeIcon sx={{ fontSize: 14 }} />
            <Typography
              variant="caption"
              sx={{ fontWeight: countdown.urgent ? 700 : 400, color: "inherit" }}
            >
              {countdown.text}
            </Typography>
          </Box>
        )}

        {/* Forfeit button */}
        <Button
          variant="outlined"
          color="error"
          size="small"
          sx={{ minHeight: 44, minWidth: 44 }}
          onClick={() => setDialogOpen(true)}
        >
          放棄試煉
        </Button>

        <AlertDialog
          open={dialogOpen}
          title={`放棄試煉 ★${star} ${displayName}？`}
          description={`當前已累積 ${progress.toLocaleString()} XP 保留在等級，但試煉進度歸零。\n\n可在未來重新挑戰該試煉。`}
          submitText={`確認放棄 ★${star}`}
          cancelText="取消"
          onSubmit={handleForfeit}
          onCancel={() => setDialogOpen(false)}
          onClose={() => setDialogOpen(false)}
          disabled={submitting}
        />
      </Box>
    );
  }

  // ── Full mode (Case C: Lv=100 with active trial) ──────────────────────────
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* Header: trial name (primary) on top; star + tier underneath as supporting meta */}
      <Box>
        <Typography variant="h6" component="div" fontWeight={700}>
          {displayName}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25 }}>
          <Typography variant="body2" sx={{ color: starColor, fontWeight: 700 }}>
            {"★".repeat(star) + "☆".repeat(5 - star)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {tierLabel}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={{ xs: 2, md: 3 }}>
        {/* Live progress + countdown */}
        <Grid size={{ xs: 12, md: restrictionText || rewardText ? 6 : 12 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box>
              <LinearProgress
                variant="determinate"
                value={xpPercent}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  "& .MuiLinearProgress-bar": {
                    borderRadius: 5,
                    backgroundColor: starColor,
                  },
                }}
              />
              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.75 }}>
                <Typography variant="body2" color="text.secondary">
                  {progress.toLocaleString()} / {requiredExp.toLocaleString()} XP
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={600}>
                  {Math.round(xpPercent)}%
                </Typography>
              </Box>
            </Box>

            {countdown.expired ? (
              <Alert severity="error">已失效 — 請放棄並重新挑戰</Alert>
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  color: countdown.color,
                  ...(countdown.urgent && !reducedMotion ? PULSE_ANIMATION_SX : {}),
                }}
              >
                <AccessTimeIcon sx={{ fontSize: 16 }} />
                <Typography
                  variant="body2"
                  sx={{ fontWeight: countdown.urgent ? 700 : 400, color: "inherit" }}
                >
                  {countdown.text}
                </Typography>
              </Box>
            )}
          </Box>
        </Grid>

        {/* Static metadata: restriction + reward */}
        {(restrictionText || rewardText) && (
          <Grid size={{ xs: 12, md: 6 }}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
              {restrictionText && (
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <BlockIcon sx={{ fontSize: 14, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      期間限制
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {restrictionText}
                  </Typography>
                </Box>
              )}

              {rewardText && (
                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <EmojiEventsIcon sx={{ fontSize: 14, color: "warning.main" }} />
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                      通過獎勵
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {rewardText}
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
        )}
      </Grid>

      <Box sx={{ mt: 1 }}>
        <Button
          variant="outlined"
          color="error"
          sx={{ minHeight: 44 }}
          onClick={() => setDialogOpen(true)}
        >
          放棄試煉
        </Button>
      </Box>

      <AlertDialog
        open={dialogOpen}
        title={`放棄試煉 ★${star} ${displayName}？`}
        description={`當前已累積 ${progress.toLocaleString()} XP 保留在等級，但試煉進度歸零。\n\n可在未來重新挑戰該試煉。`}
        submitText={`確認放棄 ★${star}`}
        cancelText="取消"
        onSubmit={handleForfeit}
        onCancel={() => setDialogOpen(false)}
        onClose={() => setDialogOpen(false)}
        disabled={submitting}
      />
    </Box>
  );
}
