import { useEffect, useState, useCallback } from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
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

function SettingsSkeleton() {
  return (
    <Stack spacing={2}>
      <Skeleton variant="rounded" height={96} animation="wave" />
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
    auto_janken_fate: 0,
    entitlements: { auto_daily_gacha: false, auto_janken_fate: false },
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

  if (!isLoggedIn) return <AlertLogin />;

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
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              訂閱者自動行為
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              開啟後，布丁會自動替你執行這些行為。隨時可以關閉。
            </Typography>
          </Box>
        </Stack>
      </Paper>

      {loading ? (
        <SettingsSkeleton />
      ) : (
        <Stack spacing={2}>
          {FLAGS.map(flag => {
            const dependencyUnmet = flag.dependsOn && state[flag.dependsOn] !== 1;
            return (
              <ToggleRow
                key={flag.key}
                flag={flag}
                value={state[flag.key]}
                entitled={state.entitlements?.[flag.key]}
                disabled={saving || dependencyUnmet}
                onChange={handleToggle}
              />
            );
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
