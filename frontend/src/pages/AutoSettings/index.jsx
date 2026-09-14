import { useEffect, useState, useCallback } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HistoryIcon from "@mui/icons-material/History";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import SportsMmaIcon from "@mui/icons-material/SportsMma";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AlertLogin from "../../components/AlertLogin";
import useLiff from "../../context/useLiff";
import {
  getPreference,
  setPreference,
  getMatchPreference,
  setMatchPreference,
  getMatchBetPreference,
  setMatchBetPreference,
} from "../../services/autoPreference";

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
    label: "消耗抽（彩率上升）",
    description: "提升限定角色中獎機率。",
  },
  {
    value: "ensure",
    label: "保證抽",
    description: "最後一抽保證為三星。",
  },
  {
    value: "europe",
    label: "歐洲抽（只彩池）",
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
        <Stack
          direction="row"
          spacing={2}
          sx={{
            alignItems: "center",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: "center",
              }}
            >
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
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 0.5,
              }}
            >
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
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
              }}
            >
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
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {opt.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                          }}
                        >
                          {perPull === 0
                            ? "免費"
                            : `每次 ${formatStones(perPull)} 石 × ${quotaTotal} 次 ≈ ${formatStones(estimate)} 石`}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "text.secondary",
                          display: "block",
                        }}
                      >
                        {opt.description}
                      </Typography>
                      {europeUnavailable && (
                        <Typography
                          variant="caption"
                          sx={{ color: "warning.main", mt: 0.25, display: "block" }}
                        >
                          目前無歐洲活動，選擇後會自動視為普通抽。
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

// ── 月卡自動猜拳 ────────────────────────────────────────────────────────────
// 兩個偏好走各自的端點，彼此不連動：只開配對就是免費參與，下注要另外同意。

const MAX_BET_CAP = 4294967295;

// 開啟下注一律要求正整數（沿用核可的規格）。伺服器允許 0，但 0 不是能開啟的值。
function validateCap(raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return "請填寫下注上限。";
  if (!/^\d+$/.test(v)) return "只能填寫數字，不可有小數點或符號。";
  const n = Number(v);
  if (n <= 0) return "下注上限必須大於 0。";
  if (n > MAX_BET_CAP) return `下注上限不可超過 ${MAX_BET_CAP.toLocaleString("en-US")}。`;
  return "";
}

// 伺服器的 0 是合法值，用 nullish 判斷；truthy 會把 0 當成沒填、reload 後默默清空欄位。
function capToDraft(cap) {
  return cap === null || cap === undefined ? "" : String(cap);
}

function putErrorMessage(err) {
  const code = err?.response?.data?.error;
  if (code === "subscription_required") {
    return { severity: "warning", message: "需要有效的月卡或季卡才能開啟" };
  }
  if (code === "invalid_cap") {
    return { severity: "warning", message: "下注上限格式不正確，尚未儲存" };
  }
  return { severity: "error", message: "更新失敗，請稍後再試" };
}

function MatchSwitchRow({ title, checked, disabled, onToggle, stateLabel }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", minHeight: 48 }}>
      <Switch checked={checked} disabled={disabled} onChange={e => onToggle(e.target.checked)} />
      <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }}>
        {title}
      </Typography>
      <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
        {stateLabel}
      </Typography>
    </Stack>
  );
}

function MatchRules() {
  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{ borderRadius: 3, "&:before": { display: "none" } }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          規則說明
        </Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
              資格
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              持有有效月卡或季卡即可參加，不分取得管道；訂閱到期就停止參加。不中斷續期會保留原本的開關。
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
              配對
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              每天台灣時間 21:00
              全站配對一次，每人最多一場，不佔用手動猜拳場數。雙方出拳由系統隨機決定。前一天輪空的人隔天優先配對。
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
              下注
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              只有雙方都同意才會下注，金額取雙方上限與雙方段位上限的最小值。任一方女神石不足，整場改為不下注。
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, display: "block" }}>
              結果
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary" }}>
              不下注的場次不更新 ELO、連勝與懸賞。結果只在這裡看得到，不會發送群組通知。
            </Typography>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}

function AutoMatchSection() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState(null);
  const [bet, setBet] = useState(null);
  const [snack, setSnack] = useState(null);

  const [matchAckOpen, setMatchAckOpen] = useState(false);
  const [betAckOpen, setBetAckOpen] = useState(false);
  const [capDraft, setCapDraft] = useState("");
  const [capError, setCapError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [m, b] = await Promise.all([getMatchPreference(), getMatchBetPreference()]);
      setMatch(m);
      setBet(b);
      setCapDraft(capToDraft(b.cap));
      setCapError("");
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const runPut = useCallback(async (fn, payload, okMessage, apply) => {
    setSaving(true);
    try {
      const updated = await fn(payload);
      apply(updated);
      setSnack({ severity: "success", message: okMessage });
      return true;
    } catch (err) {
      // 非樂觀更新：失敗時畫面維持伺服器上一次回傳的值，不需要回滾。
      setSnack(putErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  const handleMatchToggle = next => {
    if (next) {
      setMatchAckOpen(true);
      return;
    }
    runPut(setMatchPreference, { enabled: false }, "已關閉參與每日自動配對", setMatch);
  };

  const confirmMatchAck = async () => {
    const ok = await runPut(
      setMatchPreference,
      { enabled: true, acknowledged: true },
      "已開啟參與每日自動配對",
      setMatch
    );
    if (ok) setMatchAckOpen(false);
  };

  const applyBet = updated => {
    setBet(updated);
    setCapDraft(capToDraft(updated.cap));
    setCapError("");
  };

  const handleBetToggle = next => {
    if (next) {
      setCapDraft(capToDraft(bet?.cap));
      setCapError("");
      setBetAckOpen(true);
      return;
    }
    // 關閉不送 cap，保留原本設定的數字。
    runPut(setMatchBetPreference, { enabled: false }, "已關閉自動配對下注", applyBet);
  };

  const confirmBetAck = async () => {
    const msg = validateCap(capDraft);
    if (msg) {
      setCapError(msg);
      return;
    }
    const ok = await runPut(
      setMatchBetPreference,
      { enabled: true, acknowledged: true, cap: Number(capDraft.trim()) },
      "已同意下注並設定上限",
      applyBet
    );
    if (ok) setBetAckOpen(false);
  };

  // cap 改動仍是「在開啟狀態下重新確認」，所以照樣帶 acknowledged: true。
  const saveCap = async () => {
    const msg = validateCap(capDraft);
    if (msg) {
      setCapError(msg);
      return;
    }
    await runPut(
      setMatchBetPreference,
      { enabled: true, acknowledged: true, cap: Number(capDraft.trim()) },
      "已更新下注上限",
      applyBet
    );
  };

  if (loading) {
    return <Skeleton variant="rounded" height={280} animation="wave" />;
  }

  if (loadError || !match || !bet) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={reload}>
            重試
          </Button>
        }
      >
        讀取月卡自動猜拳設定失敗
      </Alert>
    );
  }

  const eligible = Boolean(match.eligible);
  const capDirty = capToDraft(bet.cap) !== capDraft.trim();

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        spacing={1.5}
        sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 1 }}
      >
        <SportsMmaIcon color="primary" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            月卡自動猜拳
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            每天台灣時間 21:00 全站配對一次，布丁自動替你出拳。
          </Typography>
        </Box>
        <Button
          component={RouterLink}
          to="/auto/match"
          size="small"
          variant="outlined"
          sx={{ whiteSpace: "nowrap" }}
        >
          今日結果
        </Button>
      </Stack>

      {!eligible && (
        <Alert severity="warning" icon={<LockOutlinedIcon fontSize="inherit" />}>
          目前沒有有效的月卡或季卡，無法開啟這兩個開關；已開啟的項目仍可隨時關閉。
        </Alert>
      )}

      <Card>
        <CardContent>
          <MatchSwitchRow
            title="參與每日自動配對"
            checked={match.enabled}
            disabled={saving || (!eligible && !match.enabled)}
            onToggle={handleMatchToggle}
            stateLabel={match.enabled ? (match.effective ? "已開啟" : "已開啟（暫停中）") : "關閉"}
          />
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            開啟後會被排入每天 21:00
            的配對，每天最多一場，不佔用手動猜拳的場數。雙方出拳都由系統隨機決定。
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
            這和「猜拳自動出手（被挑戰時）」是兩個獨立功能，互不影響。
          </Typography>
          {match.enabled && !match.effective && (
            <Typography variant="caption" sx={{ color: "warning.main", display: "block", mt: 1 }}>
              訂閱目前無效，這個開關暫時不會生效。
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <MatchSwitchRow
            title="同意自動配對下注"
            checked={bet.enabled}
            disabled={saving || (!eligible && !bet.enabled)}
            onToggle={handleBetToggle}
            stateLabel={bet.enabled ? (bet.effective ? "已開啟" : "已開啟（暫停中）") : "關閉"}
          />
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 1 }}>
            獨立開關，不是上面那個的附屬選項。免費參與配對不需要開啟這一項。
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1 }}>
            只有雙方都同意才會下注，金額取雙方上限與雙方段位上限的最小值；任一方女神石不足時整場不下注。不會顯示對手的餘額或上限。
          </Typography>

          {bet.enabled && (
            <Box sx={{ mt: 2 }}>
              <Divider sx={{ mb: 2 }} />
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems="flex-start">
                <TextField
                  label="下注上限（女神石）"
                  size="small"
                  fullWidth
                  value={capDraft}
                  disabled={saving}
                  onChange={e => {
                    setCapDraft(e.target.value);
                    setCapError("");
                  }}
                  error={Boolean(capError)}
                  helperText={capError || "正整數，單位為女神石。"}
                  slotProps={{ htmlInput: { inputMode: "numeric" } }}
                />
                <Button
                  variant="contained"
                  onClick={saveCap}
                  disabled={saving || !capDirty || !eligible}
                  sx={{ whiteSpace: "nowrap", mt: { sm: 0.25 } }}
                >
                  儲存上限
                </Button>
              </Stack>
            </Box>
          )}
        </CardContent>
      </Card>

      <MatchRules />

      <Dialog open={matchAckOpen} onClose={() => !saving && setMatchAckOpen(false)}>
        <DialogTitle>開啟前請確認</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            開啟「參與每日自動配對」後，配對成功的對手會看到你的暱稱與頭像。
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1.5 }}>
            不會顯示你的
            UID、聯絡方式，也不會顯示你所屬的群組。結果只在這個頁面查看，不會發送群組通知。
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMatchAckOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={confirmMatchAck}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            我同意
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={betAckOpen}
        onClose={() => !saving && setBetAckOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>同意下注並設定上限</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            只有雙方都同意下注才會下注。實際金額取雙方上限與雙方段位上限的最小值。
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 1.5 }}>
            任一方女神石不足時整場不下注，不會改押剩餘餘額。不會顯示對手的餘額或上限。
          </Typography>
          <TextField
            autoFocus
            label="下注上限（女神石）"
            size="small"
            fullWidth
            sx={{ mt: 2.5 }}
            value={capDraft}
            disabled={saving}
            onChange={e => {
              setCapDraft(e.target.value);
              setCapError("");
            }}
            error={Boolean(capError)}
            helperText={capError || "正整數，單位為女神石。"}
            slotProps={{ htmlInput: { inputMode: "numeric" } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBetAckOpen(false)} disabled={saving}>
            取消
          </Button>
          <Button
            variant="contained"
            onClick={confirmBetAck}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
          >
            我同意並開啟
          </Button>
        </DialogActions>
      </Dialog>

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
    } catch {
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
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: "center",
          }}
        >
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
      <Divider />
      <AutoMatchSection />
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
