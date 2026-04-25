import { useState } from "react";
import { Grid, Card, CardActionArea, CardContent, Typography, Box, Alert } from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import AlertDialog from "../../components/AlertDialog";
import { startTrial } from "../../services/prestige";
import { getStarConfig } from "./starColors";
import { renderRestriction, renderReward } from "./trialMeta";

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
  const restrictionText = dialogTrial ? renderRestriction(dialogTrial.restrictionMeta) : "";
  const rewardText = dialogTrial ? renderReward(dialogTrial.rewardMeta) : "";
  const description = dialogTrial
    ? [
        restrictionText ? `期間限制：${restrictionText}` : null,
        `通過條件：60 天內累積 ${dialogTrial.requiredExp?.toLocaleString()} XP`,
        rewardText ? `通過獎勵：${rewardText}` : null,
        "",
        "若 60 天內未達成視為失敗，可再次挑戰。",
      ]
        .filter(line => line !== null)
        .join("\n")
    : "";

  return (
    <>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 2 }}>
        選擇一項試煉開始挑戰
      </Typography>

      <Grid container spacing={2}>
        {availableTrials.map(trial => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={trial.id}>
            <TrialCard trial={trial} onClick={() => handleCardClick(trial)} />
          </Grid>
        ))}
      </Grid>

      <AlertDialog
        open={Boolean(dialogTrial)}
        title={dialogTrial ? `挑戰 ★${dialogTrial.star} ${dialogTrial.displayName}？` : ""}
        description={description}
        submitText={
          dialogTrial ? `確認挑戰 ★${dialogTrial.star} ${dialogTrial.displayName}` : "確認"
        }
        cancelText="取消"
        onSubmit={handleConfirm}
        onCancel={handleCancel}
        onClose={handleCancel}
        disabled={confirming}
      />
    </>
  );
}
