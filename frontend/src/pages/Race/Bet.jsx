import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Container,
  Typography,
  Avatar,
  Chip,
  Button,
  TextField,
  Snackbar,
  Alert,
  CircularProgress,
  Skeleton,
  Card,
  CardContent,
  Stack,
  Divider,
  Tab,
  Tabs,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DiamondIcon from "@mui/icons-material/Diamond";
import TimerIcon from "@mui/icons-material/Timer";
import HistoryIcon from "@mui/icons-material/History";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import CancelIcon from "@mui/icons-material/Cancel";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { useNavigate } from "react-router-dom";
import VisibilityIcon from "@mui/icons-material/Visibility";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import api from "../../services/api";
import { getCurrentRace, placeBet, getMyBets, getMyBetHistory } from "../../api/race";
import StatItem from "./StatItem";

const QUICK_AMOUNTS = [100, 500, 1000];

// ─── countdown hook ───────────────────────────────────────────────────────────
function useCountdown(targetIso) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      const diff = Math.max(0, Math.floor((new Date(targetIso) - Date.now()) / 1000));
      setSeconds(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return seconds;
}

function formatCountdown(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function BalanceChip({ balance, loading }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <DiamondIcon sx={{ fontSize: 16, color: "secondary.main" }} />
      {loading ? (
        <Skeleton variant="text" width={48} />
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {balance != null ? balance.toLocaleString() : "—"}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary">
        女神石
      </Typography>
    </Box>
  );
}

function CountdownBanner({ bettingEndAt }) {
  const seconds = useCountdown(bettingEndAt);
  const urgent = seconds > 0 && seconds < 60;

  return (
    <Alert
      icon={<TimerIcon fontSize="small" />}
      severity={urgent ? "error" : "warning"}
      sx={{ mb: 2, fontVariantNumeric: "tabular-nums" }}
    >
      下注截止：{formatCountdown(seconds)}
    </Alert>
  );
}

function RunnerCard({ runner, existingBet, selected, onToggle, betAmount, onAmountChange }) {
  const alreadyBet = Boolean(existingBet);
  const [customValue, setCustomValue] = useState("");

  const handleQuick = (e, amount) => {
    e.stopPropagation();
    setCustomValue("");
    onAmountChange(amount);
  };

  const handleCustom = e => {
    e.stopPropagation();
    const raw = e.target.value;
    setCustomValue(raw);
    const val = parseInt(raw, 10);
    onAmountChange(isNaN(val) ? "" : val);
  };

  return (
    <Card
      variant="outlined"
      onClick={() => onToggle()}
      sx={{
        mb: 1.5,
        cursor: "pointer",
        borderColor: selected ? "primary.main" : alreadyBet ? "success.main" : "divider",
        borderWidth: selected ? 2 : 1,
        transition: "border-color 200ms ease, box-shadow 200ms ease",
        boxShadow: selected ? theme => `0 0 0 3px ${theme.palette.primary.main}22` : "none",
      }}
    >
      <CardContent sx={{ p: "12px !important" }}>
        {/* main row */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            src={runner.avatar_url}
            alt={runner.character_name}
            sx={{
              width: 44,
              height: 44,
              border: 2,
              borderColor: selected ? "primary.main" : "divider",
              transition: "border-color 200ms ease",
              flexShrink: 0,
            }}
          />

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {runner.character_name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              賠率 {runner.odds ?? "—"}x
            </Typography>
          </Box>

          {alreadyBet && (
            <Chip
              icon={<CheckCircleIcon />}
              label={`已注 ${existingBet.amount}`}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontWeight: 700, flexShrink: 0 }}
            />
          )}
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: 2,
              borderColor: selected ? "primary.main" : "divider",
              bgcolor: selected ? "primary.main" : "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 200ms ease",
              flexShrink: 0,
            }}
          >
            {selected && (
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: "primary.contrastText",
                }}
              />
            )}
          </Box>
        </Box>

        {/* expanded bet input when selected */}
        {selected && (
          <Box onClick={e => e.stopPropagation()} sx={{ mt: 1.5 }}>
            <Divider sx={{ mb: 1.5 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
              選擇下注金額
            </Typography>

            {/* quick buttons */}
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
              {QUICK_AMOUNTS.map(amt => (
                <Button
                  key={amt}
                  variant={betAmount === amt && !customValue ? "contained" : "outlined"}
                  color="primary"
                  size="small"
                  onClick={e => handleQuick(e, amt)}
                  sx={{ flex: 1, minHeight: 44, fontWeight: 700, fontSize: "0.78rem" }}
                >
                  {amt.toLocaleString()}
                </Button>
              ))}
            </Stack>

            {/* custom input */}
            <TextField
              variant="outlined"
              size="small"
              placeholder="自訂金額"
              type="number"
              value={customValue}
              onChange={handleCustom}
              slotProps={{ htmlInput: { min: 1 } }}
              sx={{ width: "100%" }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// ─── bet history with settlement details ──────────────────────────────────────

function BetHistory({ isLoggedIn }) {
  const [data, setData] = useState({ bets: [], settlements: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn) return;
    getMyBetHistory(20)
      .then(setData)
      .catch(() => setData({ bets: [], settlements: {} }))
      .finally(() => setLoading(false));
  }, [isLoggedIn]);

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ mt: 2 }}>
        {[1, 2, 3].map(i => (
          <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2 }} />
        ))}
      </Stack>
    );
  }

  if (data.bets.length === 0) {
    return (
      <Card variant="outlined" sx={{ textAlign: "center", py: 6, mt: 2 }}>
        <CardContent>
          <HistoryIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1.5 }} />
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
            還沒有下注紀錄
          </Typography>
          <Typography variant="body2" color="text.secondary">
            在下注期間選擇角色押注，結果將顯示在這裡
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const grouped = data.bets.reduce((acc, bet) => {
    if (!acc[bet.race_id]) acc[bet.race_id] = [];
    acc[bet.race_id].push(bet);
    return acc;
  }, {});

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      {Object.entries(grouped).map(([raceId, bets]) => {
        const settlement = data.settlements[raceId];
        const firstBet = bets[0];
        const isFinished = firstBet.race_status === "finished";

        return (
          <Card key={raceId} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: "16px !important" }}>
              {/* Race header */}
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <Chip
                  label={isFinished ? "已結束" : "進行中"}
                  size="small"
                  color={isFinished ? "default" : "success"}
                  sx={{ fontWeight: 700, fontSize: "0.7rem" }}
                />
                {isFinished && firstBet.finished_at && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date(firstBet.finished_at).toLocaleString("zh-TW", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {firstBet.race_round && <> &middot; {firstBet.race_round} 回合</>}
                  </Typography>
                )}
              </Box>

              {/* Bets list */}
              <Stack spacing={1} divider={<Divider />}>
                {bets.map(bet => {
                  const isWin = bet.payout > 0;
                  const isLose = bet.payout === 0;
                  const isPending = bet.payout == null;

                  return (
                    <Box key={bet.id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                      <Avatar
                        src={bet.avatar_url}
                        alt={bet.character_name}
                        sx={{ width: 36, height: 36, flexShrink: 0 }}
                      />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 600,
                            color: isWin ? "success.main" : "text.primary",
                          }}
                        >
                          {isWin ? <EmojiEventsIcon sx={{ fontSize: 16, color: "warning.main", mr: 0.5, verticalAlign: "text-bottom" }} />
                            : isLose ? <CancelIcon sx={{ fontSize: 16, color: "error.main", mr: 0.5, verticalAlign: "text-bottom" }} />
                            : <HourglassEmptyIcon sx={{ fontSize: 16, color: "text.disabled", mr: 0.5, verticalAlign: "text-bottom" }} />}
                          {bet.character_name}
                          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                            {bet.lane}號道
                          </Typography>
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          押 {bet.amount.toLocaleString()} 石
                          {isWin && (
                            <Typography component="span" variant="caption" sx={{ color: "success.main", fontWeight: 700 }}>
                              {" "}→ +{bet.payout.toLocaleString()} 石
                            </Typography>
                          )}
                          {isLose && <> → 未中獎</>}
                          {isPending && <> (待開獎)</>}
                        </Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>

              {/* Settlement summary — only for finished races */}
              {isFinished && settlement && (
                <Box
                  sx={{
                    mt: 1.5,
                    p: 1.5,
                    bgcolor: theme =>
                      theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "grey.50",
                    borderRadius: 1.5,
                  }}
                >
                  <Stack direction="row" spacing={2} flexWrap="wrap">
                    <StatItem label="總注額" value={`${settlement.totalPool.toLocaleString()} 石`} />
                    <StatItem label="系統抽成" value={`${(settlement.feeRate * 100).toFixed(0)}%`} />
                    <StatItem label="中獎總注額" value={`${settlement.winnerPool.toLocaleString()} 石`} />
                    {settlement.multiplier && (
                      <StatItem label="中獎倍數" value={`${settlement.multiplier}x`} highlight />
                    )}
                  </Stack>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })}
    </Stack>
  );
}


function EmptyState({ message, sub }) {
  return (
    <Card variant="outlined" sx={{ textAlign: "center", py: 6 }}>
      <CardContent>
        <Typography variant="h2" sx={{ mb: 1.5, fontSize: "2.5rem" }}>
          🏇
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {message}
        </Typography>
        {sub && (
          <Typography variant="body2" color="text.secondary">
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Skeleton variant="text" width="40%" height={40} />
      <Skeleton variant="rectangular" height={44} sx={{ mt: 2, mb: 2, borderRadius: 2 }} />
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1.5, borderRadius: 2 }} />
      ))}
    </Container>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Bet() {
  const navigate = useNavigate();
  const { loggedIn: isLoggedIn } = useLiff();

  const [raceData, setRaceData] = useState(null);
  const [myBets, setMyBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "info" });

  // selections: { [runnerId]: amount }
  const [selections, setSelections] = useState({});

  const [godStoneData, setGodStoneData] = useState(null);
  const [balLoading, setBalLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [raceRes, betsRes, balRes] = await Promise.all([
        getCurrentRace(),
        getMyBets().catch(() => ({ bets: [] })),
        api
          .get("/api/inventory/total-god-stone")
          .then(r => r.data)
          .catch(() => null),
      ]);
      if (!isMounted.current) return;
      setRaceData(raceRes);
      setMyBets(betsRes.bets ?? []);
      setGodStoneData(balRes);
    } catch (err) {
      console.error("Failed to load race data", err);
      if (isMounted.current) {
        setSnack({ open: true, message: "無法載入比賽資料", severity: "error" });
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setBalLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchAll();
  }, [isLoggedIn, fetchAll]);

  // ── derived ────────────────────────────────────────────────────────────────

  const race = raceData?.race ?? null;
  const runners = raceData?.runners ?? [];

  // merge odds into runners
  const runnersWithOdds = runners.map(r => {
    const oddsEntry = (raceData?.odds ?? []).find(o => o.runnerId === r.id);
    return { ...r, odds: oddsEntry?.odds ?? null };
  });

  // map of runnerId -> aggregated existing bet
  const betMap = myBets.reduce((acc, b) => {
    if (acc[b.runner_id]) {
      acc[b.runner_id] = { ...acc[b.runner_id], amount: acc[b.runner_id].amount + b.amount };
    } else {
      acc[b.runner_id] = { ...b };
    }
    return acc;
  }, {});

  const isBettingOpen = race?.status === "betting";

  const selectedEntries = Object.entries(selections).filter(([, amt]) => amt > 0);
  const totalBet = selectedEntries.reduce((s, [, amt]) => s + Number(amt), 0);

  // ── handlers ───────────────────────────────────────────────────────────────

  const handleToggle = runnerId => {
    setSelections(prev => {
      if (runnerId in prev) {
        const next = { ...prev };
        delete next[runnerId];
        return next;
      }
      return { ...prev, [runnerId]: 100 };
    });
  };

  const handleAmountChange = (runnerId, amount) => {
    setSelections(prev => ({ ...prev, [runnerId]: amount }));
  };

  const handleSubmit = async () => {
    if (selectedEntries.length === 0 || submitting) return;

    const balance = godStoneData?.total ?? 0;
    if (totalBet > balance) {
      setSnack({ open: true, message: "女神石不足！", severity: "error" });
      return;
    }

    setSubmitting(true);
    try {
      const results = await Promise.allSettled(
        selectedEntries.map(([runnerId, amount]) =>
          placeBet(race.id, Number(runnerId), Number(amount))
        )
      );

      const failures = results.filter(r => r.status === "rejected" || r.value?.error);
      const successes = results.filter(r => r.status === "fulfilled" && !r.value?.error);

      if (successes.length > 0) {
        setSnack({
          open: true,
          message: `成功下注 ${successes.length} 筆！`,
          severity: "success",
        });
        setSelections({});
        await fetchAll();
      }

      if (failures.length > 0) {
        const firstError =
          failures[0].reason?.response?.data?.error ?? failures[0].value?.error ?? "下注失敗";
        setSnack({ open: true, message: firstError, severity: "error" });
      }
    } catch (err) {
      setSnack({
        open: true,
        message: err?.response?.data?.error ?? "下注失敗，請稍後再試",
        severity: "error",
      });
    } finally {
      if (isMounted.current) setSubmitting(false);
    }
  };

  // ── render guards ──────────────────────────────────────────────────────────

  if (!isLoggedIn) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <AlertLogin />
      </Container>
    );
  }

  if (loading) return <PageSkeleton />;

  const balance = godStoneData?.total ?? 0;
  const canSubmit = selectedEntries.length > 0 && totalBet > 0 && !submitting && isBettingOpen;

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <Container maxWidth="sm" sx={{ py: 3, flex: 1, pb: isBettingOpen ? "100px" : 3 }}>
        {/* header row */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              蘭德索爾盃
            </Typography>
            <Button
              startIcon={<VisibilityIcon sx={{ fontSize: 16 }} />}
              size="small"
              onClick={() => navigate("/race")}
              sx={{ fontWeight: 600, minHeight: 32 }}
            >
              賽況
            </Button>
          </Box>
          <BalanceChip balance={balance} loading={balLoading} />
        </Box>

        {/* tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ mb: 2, minHeight: 40, "& .MuiTab-root": { minHeight: 40, fontWeight: 700 } }}
        >
          <Tab icon={<MonetizationOnIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="下注" />
          <Tab icon={<HistoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="我的紀錄" />
        </Tabs>

        {/* Tab 0: Betting (existing content) */}
        {activeTab === 0 && (
          <>
            {/* countdown */}
            {isBettingOpen && race?.betting_end_at && (
              <CountdownBanner bettingEndAt={race.betting_end_at} />
            )}

            {/* status banner for non-betting states */}
            {!isBettingOpen && race && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {race.status === "running" && "比賽進行中，下注已截止"}
                {race.status === "finished" && "比賽已結束"}
              </Alert>
            )}

            {/* runner list */}
            {!race ? (
              <EmptyState message="目前沒有進行中的比賽" sub="下一場比賽將在整點自動開賽" />
            ) : runnersWithOdds.length === 0 ? (
              <EmptyState message="尚無參賽者資訊" />
            ) : (
              runnersWithOdds.map(runner => (
                <RunnerCard
                  key={runner.id}
                  runner={runner}
                  existingBet={betMap[runner.id] ?? null}
                  selected={runner.id in selections}
                  onToggle={() => isBettingOpen && handleToggle(runner.id)}
                  betAmount={selections[runner.id] ?? 0}
                  onAmountChange={amt => handleAmountChange(runner.id, amt)}
                />
              ))
            )}
          </>
        )}

        {/* Tab 1: Bet History */}
        {activeTab === 1 && <BetHistory isLoggedIn={isLoggedIn} />}
      </Container>

      {/* sticky bottom bar */}
      {isBettingOpen && activeTab === 0 && (
        <Box
          sx={{
            position: "fixed",
            bottom: 0,
            left: { xs: 0, md: "260px" },
            right: 0,
            px: 2,
            py: 1.5,
            bgcolor: "background.paper",
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            zIndex: 10,
            boxShadow: theme =>
              theme.palette.mode === "dark"
                ? "0 -4px 20px rgba(0,0,0,0.4)"
                : "0 -4px 20px rgba(0,0,0,0.08)",
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {selectedEntries.length > 0 ? (
              <>
                <Typography variant="caption" color="text.secondary">
                  已選 {selectedEntries.length} 位角色
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: "secondary.main" }}>
                  合計 {totalBet.toLocaleString()} 女神石
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                點選角色開始下注
              </Typography>
            )}
          </Box>

          <Button
            variant="contained"
            color="primary"
            disabled={!canSubmit}
            onClick={handleSubmit}
            sx={{
              minWidth: 120,
              minHeight: 44,
              fontWeight: 700,
              fontSize: "0.9rem",
              borderRadius: 2,
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : "確認下注"}
          </Button>
        </Box>
      )}

      {/* snackbar feedback */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          elevation={6}
          variant="filled"
          severity={snack.severity}
          onClose={() => setSnack(s => ({ ...s, open: false }))}
          sx={{ borderRadius: 2, fontWeight: 600 }}
        >
          {snack.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
