import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import api from "../../services/api";
import useLiff from "../../context/useLiff";
import { weatherEffectLabels } from "./weatherLabels";

const CATEGORY = {
  debuff: { color: "warning", label: "減益" },
  buff: { color: "success", label: "增益" },
};
const ERROR_MSG = {
  INSUFFICIENT_STONE: "女神石不足，無法購買。",
  ALREADY_PROTECTED: "你今天已經購買防護了。",
  NO_PROTECTION: "今日天氣沒有可購買的防護。",
  DISABLED: "目前無法購買防護。",
};

export default function TodayWeather() {
  const { loggedIn } = useLiff();
  const [data, setData] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    api
      .get("/api/me/chat-weather/today")
      .then(res => setData(res.data))
      .catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (loggedIn) load();
  }, [loggedIn, load]);

  if (!data || !data.weather) return null;

  const { weather, protection, god_stone_balance } = data;
  const cat = CATEGORY[weather.category] || CATEGORY.buff;
  const isDebuff = weather.category === "debuff";
  const protectedActive = isDebuff && Boolean(protection);
  const effectLabels = weatherEffectLabels(weather.effects, { full: true });

  const purchase = () => {
    setBusy(true);
    setError("");
    api
      .post("/api/me/chat-weather/protection/purchase")
      .then(() => {
        setConfirmOpen(false);
        load();
      })
      .catch(err => setError(ERROR_MSG[err?.response?.data?.code] || "購買失敗，請稍後再試。"))
      .finally(() => setBusy(false));
  };

  return (
    <Card variant="outlined" sx={{ borderTop: 4, borderTopColor: `${cat.color}.main` }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box>
            <Typography variant="overline" color="text.secondary">
              今日天氣
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {weather.name}
            </Typography>
          </Box>
          <Chip size="small" color={cat.color} label={protectedActive ? "已防護" : cat.label} />
        </Stack>

        {weather.flavor_text && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {weather.flavor_text}
          </Typography>
        )}

        <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1.5 }}>
          {effectLabels.map(l => (
            <Chip
              key={l}
              size="small"
              variant="outlined"
              label={l}
              sx={protectedActive ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
            />
          ))}
          {protectedActive && (
            <Chip size="small" color="info" label={`已抵銷 · ${protection.protection_name}`} />
          )}
        </Stack>

        {isDebuff && !protectedActive && (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {weather.protection_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  防護今日減益 · {weather.protection_cost} 女神石
                </Typography>
              </Box>
              <Button
                variant="contained"
                size="small"
                onClick={() => {
                  setError("");
                  setConfirmOpen(true);
                }}
              >
                購買防護
              </Button>
            </Stack>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", textAlign: "right", mt: 1 }}
            >
              女神石餘額 {god_stone_balance}
            </Typography>
          </Box>
        )}

        {error && !confirmOpen && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)}>
        <DialogTitle>購買防護？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            花費 {weather.protection_cost} 女神石購買「{weather.protection_name}」，抵銷今日
            {weather.name}的減益（僅對購買後的發言生效）。
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="contained" onClick={purchase} disabled={busy}>
            確定購買
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
