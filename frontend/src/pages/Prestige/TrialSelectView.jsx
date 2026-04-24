import { useState } from "react";
import {
  Grid,
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Box,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { startTrial } from "../../services/prestige";
import { getStarConfig } from "./starColors";

// ─── Copy helpers ─────────────────────────────────────────────────────────────

function renderRestriction(meta) {
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

function renderReward(meta) {
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

// ─── TrialCard ────────────────────────────────────────────────────────────────

function TrialCard({ trial, onClick }) {
  const { color, tierLabel } = getStarConfig(trial.star);
  const starDisplay = "★".repeat(trial.star) + "☆".repeat(5 - trial.star);
  const rewardText = renderReward(trial.rewardMeta);
  const restrictionText = renderRestriction(trial.restrictionMeta);

  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 2 }}>
      <CardActionArea onClick={onClick} sx={{ height: "100%", alignItems: "flex-start" }}>
        <CardContent
          sx={{ display: "flex", flexDirection: "column", gap: 0.5, pb: "12px !important" }}
        >
          {/* Star row */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="caption" sx={{ color, fontWeight: 700, letterSpacing: 1 }}>
              {starDisplay}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {tierLabel}
            </Typography>
          </Box>

          {/* Trial name */}
          <Typography variant="subtitle2" fontWeight={700}>
            {trial.displayName}
          </Typography>

          {/* Description */}
          {restrictionText && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
              {restrictionText}
            </Typography>
          )}

          {/* Pass condition */}
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
            通過：{trial.requiredExp?.toLocaleString()} XP / 60 天
          </Typography>

          {/* Reward */}
          {rewardText && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
              <EmojiEventsIcon sx={{ fontSize: 14, color: "warning.main" }} />
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                永久：{rewardText}
              </Typography>
            </Box>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ─── TrialSelectView ──────────────────────────────────────────────────────────

export default function TrialSelectView({ status, onRefresh, onMutationError }) {
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const availableTrials = status.availableTrials ?? [];

  const handleCardClick = trial => {
    setSelectedTrial(trial);
  };

  const handleCancel = () => {
    setSelectedTrial(null);
  };

  const handleConfirm = async () => {
    if (!selectedTrial) return;
    setConfirming(true);
    try {
      await startTrial(selectedTrial.id);
      setSelectedTrial(null);
      onRefresh();
    } catch (err) {
      onMutationError(err?.response?.data?.message ?? "無法啟動試煉");
    } finally {
      setConfirming(false);
    }
  };

  if (availableTrials.length === 0) {
    return (
      <Alert severity="success" sx={{ borderRadius: 2 }}>
        所有試煉皆已通過
      </Alert>
    );
  }

  const dialogTrial = selectedTrial;
  const dialogTitle = dialogTrial ? `挑戰 ★${dialogTrial.star} ${dialogTrial.displayName}？` : "";
  const restrictionText = dialogTrial ? renderRestriction(dialogTrial.restrictionMeta) : "";
  const rewardText = dialogTrial ? renderReward(dialogTrial.rewardMeta) : "";

  return (
    <>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
        選擇一項試煉開始挑戰
      </Typography>

      <Grid container spacing={2}>
        {availableTrials.map(trial => (
          <Grid size={{ xs: 12, sm: 6, md: 3 }} key={trial.id}>
            <TrialCard trial={trial} onClick={() => handleCardClick(trial)} />
          </Grid>
        ))}
      </Grid>

      {dialogTrial && (
        <Dialog open={Boolean(selectedTrial)} onClose={handleCancel} maxWidth="xs" fullWidth>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogContent
            sx={{ display: "flex", flexDirection: "column", gap: 0.75, pt: "8px !important" }}
          >
            {restrictionText && (
              <Typography variant="body2">期間限制：{restrictionText}</Typography>
            )}
            <Typography variant="body2">
              通過條件：60 天內累積 {dialogTrial.requiredExp?.toLocaleString()} XP
            </Typography>
            {rewardText && <Typography variant="body2">通過獎勵：{rewardText}</Typography>}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              若 60 天內未達成視為失敗，可再次挑戰。
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCancel}>取消</Button>
            <Button onClick={handleConfirm} variant="contained" disabled={confirming} autoFocus>
              確認挑戰 ★{dialogTrial.star} {dialogTrial.displayName}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
