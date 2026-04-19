import { useEffect, useState, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Radio,
  RadioGroup,
  Skeleton,
  Snackbar,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import HistoryIcon from "@mui/icons-material/History";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import { getPreference, setPreference } from "../../services/autoPreference";

const FLAGS = [
  {
    key: "auto_daily_gacha",
    title: "每日自動抽卡",
    description: "每晚 23:50 自動幫你抽今日的公主池十連，結果會存進 LIFF 歷史頁。",
  },
  {
    key: "auto_janken_fate",
    title: "猜拳自動出手 (被挑戰時)",
    description: "被 @tag 猜拳時由系統代你出拳，避免長時間未回應。僅限標準對戰。",
  },
  {
    key: "auto_janken_fate_with_bet",
    title: "含賭注的猜拳也自動代打",
    description:
      "上面那個開關啟用後才生效。開啟後被下戰書含賭金時也自動出拳，系統會先替你把女神石押上（餘額不足時自動放棄代打）。",
    dependsOn: "auto_janken_fate",
  },
];

const MODE_OPTIONS = [
  {
    value: "normal",
    label: "普通抽",
    description: "不花費女神石，直接抽今日公主池。",
  },
  {
    value: "pickup",
    label: "機率調升（祈願）",
    description: "提升限定角色中獎機率。",
  },
  {
    value: "ensure",
    label: "保證抽",
    description: "最後一抽保證為三星。",
  },
  {
    value: "europe",
    label: "歐派抽（只彩池）",
    description: "整池僅保留三星角色。期間限定。",
  },
];

function formatStones(n) {
  return Number(n || 0).toLocaleString("en-US");
}

function ToggleRow({ flag, value, entitled, disabled, onChange }) {
  const locked = !entitled;
  return (
    <Card sx={{ opacity: locked ? 0.7 : 1 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={2}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {flag.title}
              </Typography>
              {locked && (
                <Chip
                  size="small"
                  icon={<LockOutlinedIcon sx={{ fontSize: 14 }} />}
                  label="需要月卡/季卡"
                  color="warning"
                  variant="outlined"
                />
              )}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {flag.description}
            </Typography>
          </Box>
          <Switch
            checked={value === 1}
            disabled={disabled || (locked && value !== 1)}
            onChange={e => onChange(flag.key, e.target.checked ? 1 : 0)}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

/**
 * Mode selector for the auto_daily_gacha feature. Renders cost estimates using
 * gacha_context from the backend so we never drift from config defaults.
 * Non-blocking: users can pick a mode they can't fully afford; the cron will
 * fall back to normal for rounds they can't cover.
 */
function GachaModeSelector({ mode, context, disabled, onChange }) {
  const costs = context?.costs || { normal: 0, pickup: 0, ensure: 0, europe: 0 };
  const quotaTotal = context?.daily_quota?.total || 0;
  const stoneBalance = context?.stone_balance || 0;
  const europeActive = Boolean(context?.europe_banner_active);

  const currentPerPull = costs[mode] || 0;
  const currentEstimate = currentPerPull * quotaTotal;
  const insufficient = currentEstimate > stoneBalance;

  return (
    <Card>
      <CardContent>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              抽卡模式
            </Typography>
            <Typography variant="body2" color="text.secondary">
              今日預估配額 {quotaTotal} 次；女神石餘額 {formatStones(stoneBalance)} 顆。
            </Typography>
          </Box>
          <Divider />
          <RadioGroup value={mode} onChange={e => onChange(e.target.value)} sx={{ gap: 0.5 }}>
            {MODE_OPTIONS.map(opt => {
              const perPull = costs[opt.value] || 0;
              const estimate = perPull * quotaTotal;
              const isEurope = opt.value === "europe";
              const europeUnavailable = isEurope && !europeActive;
              return (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  disabled={disabled}
                  control={<Radio size="small" />}
                  sx={{ alignItems: "flex-start", m: 0, py: 0.75 }}
                  label={
                    <Box sx={{ ml: 0.5 }}>
                      <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {opt.label}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {perPull === 0
                            ? "免費"
                            : `每次 ${formatStones(perPull)} 石 × ${quotaTotal} 次 ≈ ${formatStones(estimate)} 石`}
                        </Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary" display="block">
                        {opt.description}
                      </Typography>
                      {europeUnavailable && (
                        <Typography
                          variant="caption"
                          sx={{ color: "warning.main", mt: 0.25, display: "block" }}
                        >
                          目前無歐派活動，選擇後會自動視為普通抽。
                        </Typography>
                      )}
                    </Box>
                  }
                />
              );
            })}
          </RadioGroup>
          {insufficient && currentPerPull > 0 && (
            <Alert
              severity="warning"
              icon={<WarningAmberIcon fontSize="inherit" />}
              sx={{ py: 0.5 }}
            >
              目前女神石不足以完成全天 {quotaTotal} 次（需要 {formatStones(currentEstimate)} 顆）。
              執行時不足會自動降為普通抽。
            </Alert>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

function SettingsSkeleton() {
  return (
    <Stack spacing={2}>
      <Skeleton variant="rounded" height={96} animation="wave" />
      <Skeleton variant="rounded" height={180} animation="wave" />
      <Skeleton variant="rounded" height={96} animation="wave" />
    </Stack>
  );
}

export default function AutoSettings() {
  const { loggedIn: isLoggedIn } = useLiff();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [state, setState] = useState({
    auto_daily_gacha: 0,
    auto_daily_gacha_mode: "normal",
    auto_janken_fate: 0,
    auto_janken_fate_with_bet: 0,
    entitlements: {
      auto_daily_gacha: false,
      auto_janken_fate: false,
      auto_janken_fate_with_bet: false,
    },
    gacha_context: null,
  });
  const [snack, setSnack] = useState(null);

  useEffect(() => {
    document.title = "自動設定";
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPreference();
      setState(data);
    } catch (err) {
      setSnack({ severity: "error", message: "讀取偏好失敗，請稍後再試" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    reload();
  }, [isLoggedIn, reload]);

  const handleToggle = useCallback(
    async (key, nextValue) => {
      setSaving(true);
      const prev = state;
      setState(s => ({ ...s, [key]: nextValue }));
      try {
        const updated = await setPreference({ [key]: nextValue });
        setState(updated);
        setSnack({ severity: "success", message: "已更新" });
      } catch (err) {
        setState(prev);
        const code = err?.response?.data?.error;
        if (code === "entitlement_missing") {
          setSnack({
            severity: "warning",
            message: "此功能需要月卡/季卡訂閱",
          });
        } else {
          setSnack({ severity: "error", message: "更新失敗，請稍後再試" });
        }
      } finally {
        setSaving(false);
      }
    },
    [state]
  );

  const handleModeChange = useCallback(
    async nextMode => {
      setSaving(true);
      const prev = state;
      setState(s => ({ ...s, auto_daily_gacha_mode: nextMode }));
      try {
        const updated = await setPreference({ auto_daily_gacha_mode: nextMode });
        setState(updated);
        setSnack({ severity: "success", message: "已更新" });
      } catch {
        setState(prev);
        setSnack({ severity: "error", message: "更新失敗，請稍後再試" });
      } finally {
        setSaving(false);
      }
    },
    [state]
  );

  if (!isLoggedIn) return <AlertLogin />;

  const dailyGachaEntitled = Boolean(state.entitlements?.auto_daily_gacha);
  const showModeSelector =
    !loading && state.auto_daily_gacha === 1 && dailyGachaEntitled && state.gacha_context;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Paper
        sx={{
          p: 3,
          borderRadius: 3,
          background: theme =>
            `linear-gradient(135deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 100%)`,
          color: "#fff",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <AutoAwesomeIcon sx={{ fontSize: 32 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              訂閱者自動行為
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              開啟後，布丁會自動替你執行這些行為。隨時可以關閉。
            </Typography>
          </Box>
          <Tooltip title="重新整理餘額與配額">
            <span>
              <IconButton
                size="small"
                onClick={reload}
                disabled={loading || saving}
                sx={{ color: "#fff" }}
              >
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            component={RouterLink}
            to="/auto/history"
            size="small"
            variant="outlined"
            startIcon={<HistoryIcon />}
            sx={{
              color: "#fff",
              borderColor: "rgba(255,255,255,0.6)",
              whiteSpace: "nowrap",
              "&:hover": { borderColor: "#fff", bgcolor: "rgba(255,255,255,0.08)" },
            }}
          >
            查看紀錄
          </Button>
        </Stack>
      </Paper>

      {loading ? (
        <SettingsSkeleton />
      ) : (
        <Stack spacing={2}>
          {FLAGS.map(flag => {
            const dependencyUnmet = flag.dependsOn && state[flag.dependsOn] !== 1;
            const row = (
              <ToggleRow
                key={flag.key}
                flag={flag}
                value={state[flag.key]}
                entitled={state.entitlements?.[flag.key]}
                disabled={saving || dependencyUnmet}
                onChange={handleToggle}
              />
            );
            // Render the mode selector immediately beneath its parent toggle
            if (flag.key === "auto_daily_gacha") {
              return (
                <Box key={flag.key} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {row}
                  {showModeSelector && (
                    <GachaModeSelector
                      mode={state.auto_daily_gacha_mode || "normal"}
                      context={state.gacha_context}
                      disabled={saving}
                      onChange={handleModeChange}
                    />
                  )}
                </Box>
              );
            }
            return row;
          })}
        </Stack>
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {snack ? (
          <Alert onClose={() => setSnack(null)} severity={snack.severity} variant="filled">
            {snack.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
