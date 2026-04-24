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
  DialogContentText,
  DialogActions,
  Button,
  TextField,
} from "@mui/material";
import AlertDialog from "../../components/AlertDialog";
import { prestige } from "../../services/prestige";
import { getBlessingIcon } from "./blessingIcons";

// ─── BlessingCard ─────────────────────────────────────────────────────────────

function BlessingCard({ blessing, BlessingIcon, onClick }) {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderRadius: 2 }}>
      <CardActionArea onClick={onClick} sx={{ height: "100%", alignItems: "flex-start" }}>
        <CardContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 1,
            pb: "12px !important",
          }}
        >
          <Box
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 2,
              bgcolor: "action.hover",
              mt: 0.5,
            }}
          >
            <BlessingIcon sx={{ fontSize: 32, color: "primary.main" }} />
          </Box>

          <Typography variant="subtitle2" fontWeight={700}>
            {blessing.displayName}
          </Typography>

          {blessing.description && (
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13 }}>
              {blessing.description}
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

// ─── FinalBlessingDialog — 5th prestige requires typing the name ──────────────

function FinalBlessingDialog({ open, blessing, onClose, onConfirm, confirming }) {
  const [confirmText, setConfirmText] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const matched = !isComposing && confirmText === (blessing?.displayName ?? "");

  const handleClose = () => {
    setConfirmText("");
    setIsComposing(false);
    onClose();
  };

  const handleConfirm = () => {
    if (!matched) return;
    onConfirm();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>✨ 最終祝福：{blessing?.displayName}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          完成後將進入<strong>覺醒終態</strong>，<strong>不再開放轉生</strong>。 5
          個祝福將永久鎖定，成為你的完整 build。
        </DialogContentText>
        <Typography variant="body2" sx={{ mb: 1 }}>
          請輸入「{blessing?.displayName}」以確認：
        </Typography>
        <TextField
          fullWidth
          size="small"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={e => {
            setIsComposing(false);
            setConfirmText(e.target.value);
          }}
          placeholder={blessing?.displayName ?? ""}
          autoComplete="off"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>取消</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!matched || confirming}
          autoFocus
        >
          確認覺醒
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── BlessingSelectView ───────────────────────────────────────────────────────

export default function BlessingSelectView({ status, onRefresh, onMutationError }) {
  const [selectedBlessing, setSelectedBlessing] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const availableBlessings = status.availableBlessings ?? [];
  const prestigeCount = status.prestigeCount ?? 0;
  const nextPrestigeNumber = prestigeCount + 1;
  const isFinalPrestige = prestigeCount === 4; // about to become 5th (awakened)

  const handleCardClick = blessing => {
    setSelectedBlessing(blessing);
  };

  const handleCancel = () => {
    setSelectedBlessing(null);
  };

  const handleConfirm = async () => {
    if (!selectedBlessing) return;
    setConfirming(true);
    try {
      await prestige(selectedBlessing.id);
      setSelectedBlessing(null);
      onRefresh();
    } catch (err) {
      onMutationError(err?.response?.data?.message ?? "無法完成轉生");
    } finally {
      setConfirming(false);
    }
  };

  if (availableBlessings.length === 0) {
    return (
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        目前沒有可選擇的祝福
      </Alert>
    );
  }

  return (
    <>
      {/* Header prompt */}
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
        選擇一個祝福完成第 {nextPrestigeNumber} 次轉生
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {isFinalPrestige ? "此為最終祝福，選擇後將進入覺醒終態。" : "祝福將永久累加，不可重來。"}
      </Typography>

      <Grid container spacing={2}>
        {availableBlessings.map(blessing => (
          <Grid size={{ xs: 12, sm: 6, md: 4 }} key={blessing.id}>
            <BlessingCard
              blessing={blessing}
              BlessingIcon={getBlessingIcon(blessing.slug)}
              onClick={() => handleCardClick(blessing)}
            />
          </Grid>
        ))}
      </Grid>

      {/* Standard confirmation dialog (prestige 1–4) */}
      {!isFinalPrestige && selectedBlessing && (
        <AlertDialog
          open={Boolean(selectedBlessing)}
          onClose={handleCancel}
          onCancel={handleCancel}
          onSubmit={handleConfirm}
          title={`選擇祝福「${selectedBlessing.displayName}」？`}
          description={[
            `效果：${selectedBlessing.description ?? ""}（永久疊加）`,
            "",
            "此選擇不可重來，祝福將永久鎖定在你的覺醒 build 中。",
            "",
            `確認將完成第 ${nextPrestigeNumber} 次轉生，等級歸零從 Lv.1 重新開始。`,
          ].join("\n")}
          submitText={`選擇「${selectedBlessing.displayName}」並轉生`}
          cancelText="取消"
          disabled={confirming}
        />
      )}

      {/* Final awakening dialog with name-confirm TextField (prestige 5) */}
      {isFinalPrestige && (
        <FinalBlessingDialog
          open={Boolean(selectedBlessing)}
          blessing={selectedBlessing}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          confirming={confirming}
        />
      )}
    </>
  );
}
