import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import RefreshIcon from "@mui/icons-material/Refresh";
import ShieldIcon from "@mui/icons-material/Shield";
import api from "../../services/api";
import useHintBar from "../../hooks/useHintBar";
import HintSnackBar from "../../components/HintSnackBar";

function decimalToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function formatInteger(value) {
  if (typeof value === "bigint") return value.toLocaleString("en-US");
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const negative = value.startsWith("-");
    const digits = value.slice(negative ? 1 : 0).replace(/^0+(?=\d)/, "");
    return `${negative ? "-" : ""}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US").format(value);
  }
  return value == null ? "—" : String(value);
}

function formatUtcDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("zh-TW", {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}

function safeHpPercent(round) {
  const maxHp = decimalToBigInt(round?.max_hp);
  const currentHp = decimalToBigInt(round?.current_hp);
  if (maxHp === null || currentHp === null || maxHp <= 0n) return null;

  const boundedHp = currentHp < 0n ? 0n : currentHp > maxHp ? maxHp : currentHp;
  return Number((boundedHp * 10000n) / maxHp) / 100;
}

function endpointErrorLabel(error) {
  return error.response?.data?.error || error.response?.data?.message || "連線失敗";
}

function SummaryStat({ label, value, tone = "text.primary" }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography
        variant="body1"
        color={tone}
        sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function LoadingBoard() {
  return (
    <Container maxWidth="lg" sx={{ py: 1 }} role="status" aria-live="polite">
      <Typography
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          p: 0,
          m: -1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        正在載入世界王資料，請稍候。
      </Typography>
      <Stack spacing={2} aria-hidden="true">
        <Skeleton variant="text" width={180} height={44} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Skeleton variant="rounded" height={360} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Skeleton variant="rounded" height={220} />
          </Grid>
        </Grid>
        <Skeleton variant="rounded" height={320} />
      </Stack>
    </Container>
  );
}

function PersonalStats({ current }) {
  const daily = current?.daily;

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 6 }}>
        <SummaryStat label="賽季累積傷害" value={formatInteger(current?.totalDamage)} />
      </Grid>
      <Grid size={{ xs: 6 }}>
        <SummaryStat
          label="今日剩餘額度"
          value={daily ? formatInteger(daily.remaining) : "—"}
          tone="primary.main"
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <SummaryStat
          label="今日已消耗 / 額度"
          value={daily ? `${formatInteger(daily.used)} / ${formatInteger(daily.limit)}` : "—"}
        />
      </Grid>
    </Grid>
  );
}

function PersonalProgressCard({ current }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
            個人討伐進度
          </Typography>
          <PersonalStats current={current} />
        </Stack>
      </CardContent>
    </Card>
  );
}

function BattleCard({ status, current }) {
  const { season, round, boss, ended } = status;
  const hpPercent = safeHpPercent(round);

  return (
    <Card variant="outlined" sx={{ height: "100%", overflow: "hidden" }}>
      <Box
        sx={{
          bgcolor: ended ? "warning.main" : "primary.main",
          color: ended ? "warning.contrastText" : "primary.contrastText",
          px: { xs: 2, sm: 2.5 },
          py: 1.75,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
          <Box>
            <Typography variant="overline" sx={{ lineHeight: 1, opacity: 0.82 }}>
              世界王討伐
            </Typography>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              {season.name || "未命名賽季"}
            </Typography>
          </Box>
          <Chip
            label={ended ? "結算處理中" : "進行中"}
            size="small"
            sx={{
              bgcolor: "rgba(255,255,255,0.2)",
              color: "inherit",
              fontWeight: 700,
            }}
          />
        </Stack>
      </Box>

      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2.25}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar
              variant="rounded"
              src={boss.image || undefined}
              alt={boss.name || "世界王"}
              sx={{ width: 52, height: 52, bgcolor: "secondary.main" }}
            >
              <ShieldIcon />
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="h6" component="h3" sx={{ fontWeight: 800 }} noWrap>
                {boss.name || "未知世界王"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                第 {formatInteger(round.round_no)} 輪
              </Typography>
            </Box>
          </Stack>

          {boss.description && (
            <Typography variant="body2" color="text.secondary">
              {boss.description}
            </Typography>
          )}

          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1}>
              <Typography variant="body2" color="text.secondary">
                世界王 HP
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", textAlign: "right" }}
              >
                {formatInteger(round.current_hp)} / {formatInteger(round.max_hp)}
              </Typography>
            </Stack>
            {hpPercent === null ? (
              <Typography variant="caption" color="error.main" display="block" sx={{ mt: 0.75 }}>
                無法計算目前 HP 比例
              </Typography>
            ) : (
              <>
                <LinearProgress
                  variant="determinate"
                  value={hpPercent}
                  aria-label={`世界王 HP ${hpPercent}%`}
                  sx={{ height: 10, borderRadius: 5, mt: 0.75 }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  display="block"
                  textAlign="right"
                  sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
                >
                  {hpPercent}%
                </Typography>
              </>
            )}
          </Box>

          <Divider />

          <PersonalStats current={current} />

          <Typography variant="caption" color="text.secondary">
            活動結束（UTC）：{formatUtcDate(season.end_time)}
          </Typography>
        </Stack>
      </CardContent>
    </Card>
  );
}

function NoActiveSeason() {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderStyle: "dashed" }}>
      <CardContent sx={{ py: { xs: 5, sm: 7 }, textAlign: "center" }}>
        <ShieldIcon sx={{ fontSize: 48, color: "text.disabled", mb: 1 }} />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          目前沒有進行中的世界王
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          下一季開放後，這裡會顯示討伐戰況與個人額度。
        </Typography>
      </CardContent>
    </Card>
  );
}

function UnavailableStatus() {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderStyle: "dashed" }}>
      <CardContent sx={{ py: { xs: 5, sm: 7 }, textAlign: "center" }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          戰況暫時無法更新
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          請重新整理以取得目前世界王狀態。
        </Typography>
      </CardContent>
    </Card>
  );
}

function LatestRewardCard({ reward }) {
  const titleName = reward.titleName || "無稱號";

  return (
    <Card variant="outlined" sx={{ height: "100%", borderColor: "warning.light" }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Avatar sx={{ bgcolor: "warning.main", color: "warning.contrastText" }}>
              <EmojiEventsIcon />
            </Avatar>
            <Box minWidth={0}>
              <Typography variant="overline" color="warning.dark" sx={{ lineHeight: 1 }}>
                最新結算紀錄
              </Typography>
              <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }} noWrap>
                {reward.seasonName || "世界王賽季"}
              </Typography>
            </Box>
          </Stack>

          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              <SummaryStat label="排名" value={`第 ${formatInteger(reward.ranking)} 名`} />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <SummaryStat
                label="女神石"
                value={formatInteger(reward.stoneAmount ?? 0)}
                tone="warning.dark"
              />
            </Grid>
            <Grid size={{ xs: 4 }}>
              <SummaryStat label="稱號" value={titleName} />
            </Grid>
          </Grid>

          <Divider />

          <SummaryStat label="賽季總傷害" value={formatInteger(reward.totalDamage)} />
          <Box sx={{ bgcolor: "action.hover", borderRadius: 1.5, p: 1.25 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              結算編號
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}
            >
              #{reward.rewardId ?? "—"}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              入帳時間（UTC）
            </Typography>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
            >
              {formatUtcDate(reward.paidAt)}
            </Typography>
            {reward.settledAt && (
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
                sx={{ mt: 0.75 }}
              >
                賽季結算（UTC）：{formatUtcDate(reward.settledAt)}
              </Typography>
            )}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

function NoRewardCard() {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ py: { xs: 4, sm: 5 }, textAlign: "center" }}>
        <MilitaryTechIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          尚無結算紀錄
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          完成世界王賽季後，個人獎勵會保留在這裡。
        </Typography>
      </CardContent>
    </Card>
  );
}

function UnavailableRewardCard() {
  return (
    <Card variant="outlined" sx={{ height: "100%", borderStyle: "dashed" }}>
      <CardContent sx={{ py: { xs: 4, sm: 5 }, textAlign: "center" }}>
        <MilitaryTechIcon sx={{ fontSize: 40, color: "text.disabled", mb: 1 }} />
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          個人結算紀錄暫時無法確認
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          請重新整理後再試；已入帳的獎勵不會因載入失敗而失效。
        </Typography>
      </CardContent>
    </Card>
  );
}

function rankMedal(ranking) {
  if (ranking === 1) return "🥇";
  if (ranking === 2) return "🥈";
  if (ranking === 3) return "🥉";
  return String(ranking ?? "—");
}

function Leaderboard({ rows, unavailable }) {
  const hasRows = rows !== undefined && rows.length > 0;

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack
          direction="row"
          gap={1}
          sx={{ justifyContent: "space-between", alignItems: "baseline", mb: 1 }}
        >
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 800 }}>
              賽季傷害排行榜
            </Typography>
            <Typography variant="body2" color="text.secondary">
              顯示前 50 名貢獻者
            </Typography>
          </Box>
          <EmojiEventsIcon color="warning" aria-hidden="true" />
        </Stack>

        {unavailable && (
          <Alert severity="warning" variant="outlined" sx={{ mb: hasRows ? 1.5 : 0 }}>
            排行榜暫時無法更新{hasRows ? "，以下顯示上次成功載入的資料。" : "，請重新整理後再試。"}
          </Alert>
        )}
        {hasRows ? (
          <List disablePadding aria-label="世界王傷害排行榜">
            {rows.map((row, index) => {
              const ranking = row.ranking;
              return (
                <ListItem
                  key={`${row.user_id || "unknown"}-${index}`}
                  disableGutters
                  divider={index < rows.length - 1}
                >
                  <ListItemAvatar sx={{ minWidth: 44 }}>
                    <Avatar
                      sx={{
                        width: 36,
                        height: 36,
                        fontSize: ranking <= 3 ? "1.2rem" : "0.875rem",
                        fontWeight: 800,
                        bgcolor: ranking <= 3 ? "transparent" : "action.selected",
                        color: "text.primary",
                      }}
                      aria-label={`第 ${formatInteger(ranking)} 名`}
                    >
                      {rankMedal(ranking)}
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={row.user_id || "未知玩家"}
                    secondary="累積傷害"
                    primaryTypographyProps={{
                      noWrap: true,
                      sx: { maxWidth: { xs: "calc(100vw - 190px)", sm: "min(50vw, 360px)" } },
                    }}
                  />
                  <Typography
                    variant="body2"
                    sx={{
                      flex: "0 0 auto",
                      maxWidth: { xs: "42%", sm: "48%" },
                      pl: 1,
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                      overflowWrap: "anywhere",
                      textAlign: "right",
                    }}
                  >
                    {formatInteger(row.total_damage)}
                  </Typography>
                </ListItem>
              );
            })}
          </List>
        ) : !unavailable ? (
          <Box sx={{ py: 5, textAlign: "center" }}>
            <Typography color="text.secondary">目前尚無可顯示的討伐紀錄。</Typography>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Worldboss() {
  const [data, setData] = useState({ status: undefined, leaderboard: undefined, me: undefined });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const requestIdRef = useRef(0);
  const loadedOnceRef = useRef(false);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchBoard = useCallback(
    async ({ announce = false } = {}) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const isFirstLoad = !loadedOnceRef.current;
      if (isFirstLoad) setLoading(true);
      else setRefreshing(true);

      const results = await Promise.allSettled([
        api.get("/api/world-boss/status"),
        api.get("/api/world-boss/leaderboard?limit=50"),
        api.get("/api/world-boss/me"),
      ]);

      if (requestId !== requestIdRef.current) return;

      const [statusResult, leaderboardResult, meResult] = results;
      const endpointResults = [
        { key: "status", label: "戰況", result: statusResult },
        { key: "leaderboard", label: "排行榜", result: leaderboardResult },
        { key: "me", label: "個人資料", result: meResult },
      ];
      const nextErrors = Object.fromEntries(
        endpointResults
          .filter(({ result }) => result.status === "rejected")
          .map(({ key, result }) => [key, endpointErrorLabel(result.reason)])
      );
      const successfulEndpoints = endpointResults
        .filter(({ result }) => result.status === "fulfilled")
        .map(({ label }) => label);

      setData(previous => ({
        ...previous,
        ...(statusResult.status === "fulfilled" ? { status: statusResult.value.data ?? null } : {}),
        ...(leaderboardResult.status === "fulfilled"
          ? {
              leaderboard: Array.isArray(leaderboardResult.value.data)
                ? leaderboardResult.value.data
                : [],
            }
          : {}),
        ...(meResult.status === "fulfilled" ? { me: meResult.value.data ?? null } : {}),
      }));
      setErrors(nextErrors);
      loadedOnceRef.current = true;
      setLoading(false);
      setRefreshing(false);

      if (announce) {
        const failedEndpoints = Object.keys(nextErrors);
        showHint(
          failedEndpoints.length
            ? `部分資料無法更新：${failedEndpoints.join("、")}`
            : `已更新${successfulEndpoints.join("、")}`,
          failedEndpoints.length ? "warning" : "success"
        );
      }
    },
    [showHint]
  );

  useEffect(() => {
    document.title = "世界王戰況";
    fetchBoard();
  }, [fetchBoard]);

  if (loading) return <LoadingBoard />;

  const hasBattle = Boolean(data.status?.season && data.status?.round && data.status?.boss);
  const latestReward = data.me?.latestReward;
  const errorEntries = Object.entries(errors);

  return (
    <Container maxWidth="lg" sx={{ py: 1 }}>
      <Stack spacing={2.5}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ justifyContent: "space-between", alignItems: { xs: "stretch", sm: "center" } }}
        >
          <Box>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 800 }}>
              世界王戰況
            </Typography>
            <Typography variant="body2" color="text.secondary">
              全服共鬥 · 即時討伐與個人結算紀錄
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={() => fetchBoard({ announce: true })}
            disabled={refreshing}
            aria-label="重新整理世界王戰況、排行榜與個人資料"
            sx={{ alignSelf: { xs: "flex-start", sm: "auto" }, fontWeight: 700 }}
          >
            重新整理
          </Button>
        </Stack>

        {errorEntries.length > 0 && (
          <Alert severity="warning" variant="outlined" aria-live="polite">
            部分資料無法更新：
            {errorEntries.map(([name, message]) => `${name}（${message}）`).join("、")}
            。現有資料可能不是最新狀態。
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            {hasBattle ? (
              <BattleCard status={data.status} current={data.me?.current} />
            ) : errors.status ? (
              <UnavailableStatus />
            ) : (
              <NoActiveSeason />
            )}
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            {data.me === undefined ? (
              <UnavailableRewardCard />
            ) : latestReward != null ? (
              <LatestRewardCard reward={latestReward} />
            ) : (
              <NoRewardCard />
            )}
          </Grid>
        </Grid>

        {data.me?.current != null && !hasBattle && (
          <PersonalProgressCard current={data.me.current} />
        )}

        <Leaderboard rows={data.leaderboard} unavailable={Boolean(errors.leaderboard)} />
      </Stack>
      <HintSnackBar {...hintState} onClose={closeHint} />
    </Container>
  );
}
