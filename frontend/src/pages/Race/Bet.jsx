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
  CardActionArea,
  CardContent,
  Stack,
  Divider,
  Tab,
  Tabs,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DiamondIcon from "@mui/icons-material/Diamond";
import TimerIcon from "@mui/icons-material/Timer";
import HistoryIcon from "@mui/icons-material/History";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import CancelIcon from "@mui/icons-material/Cancel";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import FlagIcon from "@mui/icons-material/Flag";
import { useNavigate } from "react-router-dom";
import VisibilityIcon from "@mui/icons-material/Visibility";
import useLiff from "../../context/useLiff";
import useAlertDialog from "../../hooks/useAlertDialog";
import AlertLogin from "../../components/AlertLogin";
import AlertDialog from "../../components/AlertDialog";
import LoadError from "../../components/LoadError";
import { bottomNavSpace } from "../../components/BottomNav";
import api from "../../services/api";
import { getCurrentRace, placeBet, getMyBets, getMyBetHistory } from "../../api/race";
import StatItem from "./StatItem";

const QUICK_AMOUNTS = [100, 500, 1000];
const DEFAULT_SELECTION = { amount: 100, raw: "" };
// 截止時間到了但伺服器還沒把狀態切成 running（開賽由排程觸發，會晚幾秒），
// 這段期間每隔幾秒重拉一次，直到狀態真的變了。
const CLOSE_RECHECK_MS = 8000;

// ─── countdown hook ───────────────────────────────────────────────────────────
// 回傳 { seconds, expired }。expired 由「現在時間 >= 截止時間」直接算出來，
// 不靠 state 殘留，所以換了一場比賽的截止時間也不會閃一下「已截止」。
function useCountdown(targetIso) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!targetIso) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  if (!targetIso) return { seconds: null, expired: false };
  const remainingMs = new Date(targetIso).getTime() - now;
  return { seconds: Math.max(0, Math.ceil(remainingMs / 1000)), expired: remainingMs <= 0 };
}

function formatCountdown(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// 單筆下注金額檢查：必須是正整數；餘額已知時不可超過餘額。
function amountError(amount, balance) {
  if (amount === "" || !(amount > 0)) return "請輸入下注金額";
  if (balance != null && amount > balance) {
    return `超過餘額（${balance.toLocaleString()} 女神石）`;
  }
  return "";
}

// 下注失敗的原因：伺服器會回中文訊息；網路中斷時沒有 response。
function betFailureReason(result) {
  if (result.status === "rejected") {
    return result.reason?.response?.data?.error ?? "網路異常，請稍後再試";
  }
  return result.value?.error ?? "下注失敗";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function BalanceChip({ balance, loading }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <DiamondIcon sx={{ fontSize: 16, color: "currency.main" }} aria-hidden="true" />
      {loading ? (
        <Skeleton variant="text" width={48} />
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {balance != null ? balance.toLocaleString() : "—"}
        </Typography>
      )}
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
        }}
      >
        女神石
      </Typography>
    </Box>
  );
}

function CountdownBanner({ seconds }) {
  const urgent = seconds > 0 && seconds < 60;

  return (
    <Alert
      icon={<TimerIcon fontSize="small" />}
      severity={urgent ? "error" : "warning"}
      sx={{ mb: 2, fontVariantNumeric: "tabular-nums" }}
    >
      下注截止：{formatCountdown(seconds)}
      {urgent && "（即將截止）"}
    </Alert>
  );
}

/**
 * 「選取角色」與「編輯金額」是兩件事：
 * - 上半部（CardActionArea）只負責選取 / 取消選取，有鍵盤與焦點。
 * - 金額編輯區在 CardActionArea 之外，打字、點快速金額都不可能連帶取消選取。
 * 取消選取時金額草稿由父層保留，重新選取會還原。
 */
function RunnerCard({
  runner,
  existingBet,
  selected,
  disabled,
  amount,
  raw,
  error,
  onToggle,
  onQuick,
  onCustom,
}) {
  const alreadyBet = Boolean(existingBet);

  const summary = (
    <CardContent sx={{ p: "12px !important" }}>
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
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
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
          aria-hidden="true"
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
    </CardContent>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        borderColor: selected ? "primary.main" : alreadyBet ? "success.main" : "divider",
        borderWidth: selected ? 2 : 1,
        transition: "border-color 200ms ease, box-shadow 200ms ease",
        boxShadow: selected
          ? theme => `0 0 0 3px ${alpha(theme.palette.primary.main, 0.13)}`
          : "none",
      }}
    >
      {disabled ? (
        summary
      ) : (
        <CardActionArea
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`${selected ? "取消選取" : "選取"} ${runner.character_name}，賠率 ${runner.odds ?? "未知"} 倍`}
          sx={{ minHeight: 44 }}
        >
          {summary}
        </CardActionArea>
      )}

      {/* expanded bet input when selected */}
      {selected && (
        <CardContent sx={{ p: "12px !important", pt: "0 !important" }}>
          <Divider sx={{ mb: 1.5 }} />
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              mb: 1,
              display: "block",
            }}
          >
            選擇下注金額
          </Typography>

          {/* quick buttons */}
          <Stack
            direction="row"
            spacing={1}
            role="group"
            aria-label={`${runner.character_name} 的快速金額`}
            sx={{ mb: 1.5 }}
          >
            {QUICK_AMOUNTS.map(amt => (
              <Button
                key={amt}
                variant={amount === amt && !raw ? "contained" : "outlined"}
                color="primary"
                size="small"
                aria-pressed={amount === amt && !raw}
                onClick={() => onQuick(amt)}
                sx={{ flex: 1, minHeight: 44, fontWeight: 700 }}
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
            value={raw}
            onChange={e => onCustom(e.target.value)}
            error={Boolean(error)}
            helperText={error || " "}
            slotProps={{
              htmlInput: {
                inputMode: "numeric",
                "aria-label": `自訂 ${runner.character_name} 的下注金額`,
              },
            }}
            sx={{ width: "100%", "& .MuiOutlinedInput-root": { minHeight: 44 } }}
          />
        </CardContent>
      )}
    </Card>
  );
}

// ─── bet history with settlement details ──────────────────────────────────────

function BetHistory({ isLoggedIn }) {
  const [data, setData] = useState({ bets: [], settlements: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getMyBetHistory(20)
      .then(setData)
      // 失敗不能偽裝成「還沒有紀錄」，要讓玩家知道可以重試
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    load();
  }, [isLoggedIn, load]);

  if (loading) {
    return (
      <Stack spacing={1.5} sx={{ mt: 2 }} aria-busy="true">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2 }} />
        ))}
      </Stack>
    );
  }

  if (error) {
    return <LoadError message="無法載入下注紀錄，請檢查網路後再試一次。" onRetry={load} />;
  }

  if (data.bets.length === 0) {
    return (
      <Card variant="outlined" sx={{ textAlign: "center", py: 6, mt: 2 }}>
        <CardContent>
          <HistoryIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1.5 }} />
          <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
            還沒有下注紀錄
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
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
                  sx={{ fontWeight: 700 }}
                />
                {isFinished && firstBet.finished_at && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                    }}
                  >
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
                          {isWin ? (
                            <EmojiEventsIcon
                              sx={{
                                fontSize: 16,
                                color: "warning.main",
                                mr: 0.5,
                                verticalAlign: "text-bottom",
                              }}
                            />
                          ) : isLose ? (
                            <CancelIcon
                              sx={{
                                fontSize: 16,
                                color: "error.main",
                                mr: 0.5,
                                verticalAlign: "text-bottom",
                              }}
                            />
                          ) : (
                            <HourglassEmptyIcon
                              sx={{
                                fontSize: 16,
                                color: "text.disabled",
                                mr: 0.5,
                                verticalAlign: "text-bottom",
                              }}
                            />
                          )}
                          {bet.character_name}
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              ml: 0.5,
                            }}
                          >
                            {bet.lane}號道
                          </Typography>
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                          }}
                        >
                          押 {bet.amount.toLocaleString()} 石
                          {isWin && (
                            <Typography
                              component="span"
                              variant="caption"
                              sx={{ color: "success.main", fontWeight: 700 }}
                            >
                              {" "}
                              → +{bet.payout.toLocaleString()} 石
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
                    bgcolor: "surface.subtle",
                    borderRadius: 1.5,
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{
                      flexWrap: "wrap",
                    }}
                  >
                    <StatItem
                      label="總注額"
                      value={`${settlement.totalPool.toLocaleString()} 石`}
                    />
                    <StatItem
                      label="系統抽成"
                      value={`${(settlement.feeRate * 100).toFixed(0)}%`}
                    />
                    <StatItem
                      label="中獎總注額"
                      value={`${settlement.winnerPool.toLocaleString()} 石`}
                    />
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
        <FlagIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1.5 }} />
        <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.5 }}>
          {message}
        </Typography>
        {sub && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function PageSkeleton() {
  return (
    <Container maxWidth="sm" sx={{ py: 3 }} aria-busy="true">
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
  // loadError：第一次就載入失敗（沒有任何資料可顯示）；partialLoad：資料有，但已下注或餘額讀不到
  const [loadError, setLoadError] = useState(false);
  const [partialLoad, setPartialLoad] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [snack, setSnack] = useState({ open: false, message: "", severity: "info" });
  const [dialog, { handleOpen: openDialog, handleClose: closeDialog, setBusy }] = useAlertDialog();

  // selections: { [runnerId]: { amount: number | "", raw: string } }，存在即代表已選取
  const [selections, setSelections] = useState({});
  // 取消選取時把金額草稿收起來，重新選取再還原，避免「點一下就丟掉輸入」
  const draftsRef = useRef({});

  const [godStoneData, setGodStoneData] = useState(null);
  const [balLoading, setBalLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  const isMounted = useRef(true);
  const hasDataRef = useRef(false);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      let partial = false;
      const [raceRes, betsRes, balRes] = await Promise.all([
        getCurrentRace(),
        getMyBets().catch(() => {
          partial = true;
          return null;
        }),
        api
          .get("/api/inventory/total-god-stone")
          .then(r => r.data)
          .catch(() => {
            partial = true;
            return null;
          }),
      ]);
      if (!isMounted.current) return;
      setRaceData(raceRes);
      // 已下注或餘額讀不到時保留上一次的值，不要用空陣列 / 0 冒充
      if (betsRes) setMyBets(betsRes.bets ?? []);
      if (balRes) setGodStoneData(balRes);
      setPartialLoad(partial);
      setLoadError(false);
      hasDataRef.current = true;
    } catch (err) {
      console.error("Failed to load race data", err);
      if (!isMounted.current) return;
      if (hasDataRef.current) {
        setSnack({
          open: true,
          message: "無法更新比賽資料，畫面顯示的是上次的內容",
          severity: "warning",
        });
      } else {
        setLoadError(true);
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

  const retryLoad = () => {
    setLoadError(false);
    setLoading(true);
    setBalLoading(true);
    fetchAll();
  };

  // ── derived ────────────────────────────────────────────────────────────────

  const race = raceData?.race ?? null;
  const runners = raceData?.runners ?? [];

  // 截止倒數：時間到就鎖住下注，不等下一次重新整理
  const { seconds, expired } = useCountdown(
    race?.status === "betting" ? (race.betting_end_at ?? null) : null
  );

  // 時間到：立刻重拉比賽狀態；伺服器切到 running 之前每隔幾秒再確認一次。
  // 狀態變成 running 後 useCountdown 的目標變 null，expired 回到 false，計時器就會被清掉。
  useEffect(() => {
    if (!expired) return;
    fetchAll();
    const id = setInterval(fetchAll, CLOSE_RECHECK_MS);
    return () => clearInterval(id);
  }, [expired, fetchAll]);

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

  const isBettingOpen = race?.status === "betting" && !expired;

  // 餘額讀不到時是 null：不能當成 0 去擋人，也不能顯示「下注後餘額」
  const balance = Number.isFinite(godStoneData?.total) ? godStoneData.total : null;

  // 截止後不再計入已選項目（畫面上的選取也一併停用）
  const activeSelections = isBettingOpen ? selections : {};
  const selectedEntries = Object.entries(activeSelections);
  const totalBet = selectedEntries.reduce((s, [, sel]) => s + (Number(sel.amount) || 0), 0);
  const amountErrors = Object.fromEntries(
    selectedEntries.map(([id, sel]) => [id, amountError(sel.amount, balance)])
  );
  const hasAmountError = Object.values(amountErrors).some(Boolean);
  const overBalance = balance != null && totalBet > balance;
  const canSubmit =
    selectedEntries.length > 0 &&
    totalBet > 0 &&
    !hasAmountError &&
    !overBalance &&
    !submitting &&
    isBettingOpen;

  // 截止時若確認框還開著就收掉，避免玩家按下確認後才被伺服器退回
  useEffect(() => {
    if (!isBettingOpen && dialog.open) closeDialog();
  }, [isBettingOpen, dialog.open, closeDialog]);

  // ── handlers ───────────────────────────────────────────────────────────────

  const handleToggle = runnerId => {
    if (!isBettingOpen) return;
    if (runnerId in selections) {
      draftsRef.current[runnerId] = selections[runnerId];
      setSelections(prev => {
        const next = { ...prev };
        delete next[runnerId];
        return next;
      });
    } else {
      setSelections(prev => ({
        ...prev,
        [runnerId]: draftsRef.current[runnerId] ?? DEFAULT_SELECTION,
      }));
    }
  };

  const handleQuick = (runnerId, amt) => {
    setSelections(prev => ({ ...prev, [runnerId]: { amount: amt, raw: "" } }));
  };

  const handleCustom = (runnerId, input) => {
    const digits = input.replace(/\D/g, "").slice(0, 9);
    setSelections(prev => ({
      ...prev,
      [runnerId]: { amount: digits === "" ? "" : parseInt(digits, 10), raw: digits },
    }));
  };

  const submitBets = async entries => {
    setSubmitting(true);
    setBusy(true);
    try {
      const results = await Promise.allSettled(
        entries.map(({ runnerId, amount }) => placeBet(race.id, Number(runnerId), amount))
      );

      const outcomes = entries.map((entry, i) => {
        const result = results[i];
        const ok = result.status === "fulfilled" && !result.value?.error;
        return { ...entry, ok, reason: ok ? "" : betFailureReason(result) };
      });
      const succeeded = outcomes.filter(o => o.ok);
      const failed = outcomes.filter(o => !o.ok);

      // 成功的從選取中移除；失敗的保留（含金額），讓玩家可以直接再試
      if (succeeded.length > 0) {
        succeeded.forEach(o => delete draftsRef.current[o.runnerId]);
        const doneIds = new Set(succeeded.map(o => String(o.runnerId)));
        setSelections(prev =>
          Object.fromEntries(Object.entries(prev).filter(([id]) => !doneIds.has(id)))
        );
      }

      // 一律只彈一則訊息：成功與失敗合併，失敗不會蓋掉成功
      const failReasons = failed.map(o => `${o.name}（${o.reason}）`).join("、");
      if (failed.length === 0) {
        const stake = succeeded.reduce((s, o) => s + o.amount, 0);
        setSnack({
          open: true,
          message: `成功下注 ${succeeded.length} 筆，共 ${stake.toLocaleString()} 女神石`,
          severity: "success",
        });
      } else if (succeeded.length === 0) {
        setSnack({
          open: true,
          message: `${failed.length} 筆下注失敗：${failReasons}`,
          severity: "error",
        });
      } else {
        setSnack({
          open: true,
          message: `${succeeded.length} 筆成功、${failed.length} 筆失敗：${failReasons}`,
          severity: "warning",
        });
      }

      closeDialog();
      // 不論成功與否都同步一次餘額與已下注狀態
      await fetchAll();
    } finally {
      if (isMounted.current) {
        setSubmitting(false);
        closeDialog();
      }
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;

    const entries = selectedEntries.map(([runnerId, sel]) => ({
      runnerId,
      amount: Number(sel.amount),
      name: runners.find(r => String(r.id) === runnerId)?.character_name ?? `角色 ${runnerId}`,
    }));
    const lines = entries.map(e => `・${e.name}：${e.amount.toLocaleString()} 女神石`);
    const summary = [
      `共 ${entries.length} 位角色，合計 ${totalBet.toLocaleString()} 女神石`,
      ...(balance != null ? [`下注後餘額：${(balance - totalBet).toLocaleString()} 女神石`] : []),
    ];

    openDialog({
      title: "確認下注",
      description: `${lines.join("\n")}\n\n${summary.join("\n")}\n送出後無法取消。`,
      submitText: "確認下注",
      destructive: true,
      onSubmit: () => submitBets(entries),
    });
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

  if (loadError) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <LoadError message="無法載入比賽資料，請檢查網路後再試一次。" onRetry={retryLoad} />
      </Container>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        bgcolor: "background.default",
      }}
    >
      <Container maxWidth="sm" sx={{ py: 3, flex: 1, pb: isBettingOpen ? "120px" : 3 }}>
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
              sx={{ fontWeight: 600, minHeight: 44 }}
            >
              賽況
            </Button>
          </Box>
          <BalanceChip balance={balance} loading={balLoading} />
        </Box>

        {partialLoad && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={fetchAll} sx={{ minHeight: 36 }}>
                重試
              </Button>
            }
          >
            已下注或女神石餘額暫時讀不到，下注金額請自行確認。
          </Alert>
        )}

        {/* tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ mb: 2, minHeight: 44, "& .MuiTab-root": { minHeight: 44, fontWeight: 700 } }}
        >
          <Tab
            icon={<MonetizationOnIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
            label="下注"
          />
          <Tab icon={<HistoryIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="我的紀錄" />
        </Tabs>

        {/* Tab 0: Betting (existing content) */}
        {activeTab === 0 && (
          <>
            {/* countdown */}
            {isBettingOpen && race?.betting_end_at && <CountdownBanner seconds={seconds} />}

            {/* status banner for non-betting states */}
            {!isBettingOpen && race && (
              <Alert severity="info" sx={{ mb: 2 }}>
                {race.status === "betting" && "下注時間已到，正在確認比賽狀態…"}
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
              runnersWithOdds.map(runner => {
                const sel = activeSelections[runner.id];
                return (
                  <RunnerCard
                    key={runner.id}
                    runner={runner}
                    existingBet={betMap[runner.id] ?? null}
                    selected={Boolean(sel)}
                    disabled={!isBettingOpen || submitting}
                    amount={sel?.amount ?? 0}
                    raw={sel?.raw ?? ""}
                    error={sel ? amountErrors[runner.id] : ""}
                    onToggle={() => handleToggle(runner.id)}
                    onQuick={amt => handleQuick(runner.id, amt)}
                    onCustom={input => handleCustom(runner.id, input)}
                  />
                );
              })
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
            // 手機有固定的底部導覽（BottomNav），下注列要浮在它上方，不然確認鈕會被蓋住點不到
            bottom: { xs: bottomNavSpace, sm: 0 },
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
              `0 -4px 20px ${alpha(theme.palette.common.black, theme.palette.mode === "dark" ? 0.4 : 0.08)}`,
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {selectedEntries.length > 0 ? (
              <>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                  }}
                >
                  已選 {selectedEntries.length} 位角色
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: "currency.main" }}>
                  合計 {totalBet.toLocaleString()} 女神石
                </Typography>
                {overBalance && (
                  <Typography variant="caption" sx={{ color: "error.main", display: "block" }}>
                    合計超過餘額 {balance.toLocaleString()} 女神石，請減少金額
                  </Typography>
                )}
              </>
            ) : (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                }}
              >
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
              borderRadius: 2,
            }}
          >
            {submitting ? <CircularProgress size={20} color="inherit" /> : "確認下注"}
          </Button>
        </Box>
      )}
      <AlertDialog
        open={dialog.open}
        onClose={closeDialog}
        onSubmit={dialog.onSubmit}
        title={dialog.title}
        description={dialog.description}
        submitText={dialog.submitText}
        cancelText={dialog.cancelText}
        destructive={dialog.destructive}
        busy={dialog.busy}
      />
      {/* snackbar feedback */}
      <Snackbar
        open={snack.open}
        autoHideDuration={snack.severity === "success" ? 4000 : 8000}
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
