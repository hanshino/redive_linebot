import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Alert,
  Box,
  LinearProgress,
  Chip,
  Card,
  CardContent,
  Stack,
  Divider,
  Skeleton,
  Grid,
  Avatar,
  Paper,
  Button,
  ButtonBase,
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import BoltIcon from "@mui/icons-material/Bolt";
import TimerIcon from "@mui/icons-material/Timer";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FlagIcon from "@mui/icons-material/Flag";
import LoadError from "../../components/LoadError";
import { getCurrentRace, getRaceHistory } from "../../api/race";

const POLL_INTERVAL = 10000;
const DEFAULT_TRACK_LENGTH = 50;

const STATUS_META = {
  betting: { label: "下注中", color: "warning", Icon: TimerIcon },
  running: { label: "比賽中", color: "success", Icon: PlayArrowIcon },
  finished: { label: "已結束", color: "default", Icon: CheckCircleIcon },
};

// 前三名徽章文字；底色走 theme.palette.medal（金銀銅，深淺模式各自調過）
const RANK_LABELS = { 1: "1st", 2: "2nd", 3: "3rd" };

const STATUS_CHIP_COLORS = {
  stunned: "error",
  slowed: "warning",
};

const STATUS_CHIP_LABELS = {
  stunned: "暈眩",
  slowed: "減速",
};

// ─── data fetch (unchanged) ───────────────────────────────────────────────────

export default function Race() {
  const navigate = useNavigate();
  const [raceData, setRaceData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  // error：一筆資料都沒載入成功；stale：之前載入過，但這次輪詢失敗（畫面是舊資料）
  const [error, setError] = useState(false);
  const [stale, setStale] = useState(false);
  const timerRef = useRef(null);
  const hasDataRef = useRef(false);

  const fetchRace = useCallback(async () => {
    try {
      const [data, historyRes] = await Promise.all([
        getCurrentRace(),
        getRaceHistory(5).catch(() => ({ history: [] })),
      ]);
      setRaceData(data);
      setHistory(historyRes.history ?? []);
      hasDataRef.current = true;
      setError(false);
      setStale(false);
    } catch (err) {
      console.error("Failed to fetch race", err);
      if (hasDataRef.current) setStale(true);
      else setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRace();
    timerRef.current = setInterval(fetchRace, POLL_INTERVAL);

    const handleVisibility = () => {
      if (document.hidden) {
        clearInterval(timerRef.current);
      } else {
        fetchRace();
        timerRef.current = setInterval(fetchRace, POLL_INTERVAL);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchRace]);

  const retry = () => {
    setError(false);
    setLoading(true);
    fetchRace();
  };

  // ─── loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Skeleton variant="text" width="30%" height={44} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width="20%" height={24} sx={{ mb: 3 }} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Skeleton variant="rounded" height={340} sx={{ borderRadius: 3 }} />
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Skeleton variant="rounded" height={160} sx={{ borderRadius: 3, mb: 2 }} />
            <Skeleton variant="rounded" height={160} sx={{ borderRadius: 3 }} />
          </Grid>
        </Grid>
      </Container>
    );
  }

  // ─── render ───────────────────────────────────────────────────────────────

  // sort runners by position descending (leader first) and attach odds
  const oddsMap = Object.fromEntries((raceData?.odds ?? []).map(o => [o.runnerId, o]));
  const sortedRunners = [...(raceData?.runners ?? [])]
    .sort((a, b) => b.position - a.position)
    .map((r, idx) => ({ ...r, rank: idx + 1, oddsEntry: oddsMap[r.id] ?? null }));

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* page title + bet link */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            蘭德索爾盃
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            每 10 秒自動更新
          </Typography>
        </Box>
        <Button
          variant={raceData?.race?.status === "betting" ? "contained" : "outlined"}
          color={raceData?.race?.status === "betting" ? "warning" : "primary"}
          onClick={() => navigate("/race/bet")}
          sx={{ fontWeight: 700, minWidth: 100, minHeight: 44, borderRadius: 2 }}
        >
          {raceData?.race?.status === "betting" ? "前往下注" : "下注 / 紀錄"}
        </Button>
      </Box>
      {stale && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          更新失敗，畫面顯示的是上次載入的內容。
        </Alert>
      )}
      {error ? (
        <LoadError message="無法載入比賽資料，請檢查網路後再試一次。" onRetry={retry} />
      ) : !raceData?.race ? (
        <NoRace />
      ) : (
        <>
          <RaceHeader race={raceData.race} />

          {/* responsive two-column layout */}
          <Grid container spacing={2} sx={{ mt: 0 }}>
            {/* left: race track */}
            <Grid size={{ xs: 12, md: 7 }}>
              <RaceTrack
                runners={sortedRunners}
                trackLength={raceData.trackLength ?? DEFAULT_TRACK_LENGTH}
              />
            </Grid>

            {/* right: event log + history */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={2}>
                {raceData.events?.length > 0 && <EventLog events={raceData.events} />}
                {history.length > 0 && (
                  <RaceHistory history={history} onRaceClick={id => navigate(`/race/${id}`)} />
                )}
              </Stack>
            </Grid>
          </Grid>
        </>
      )}
      {/* history only when no active race */}
      {!error && !raceData?.race && history.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <RaceHistory history={history} onRaceClick={id => navigate(`/race/${id}`)} />
        </Box>
      )}
    </Container>
  );
}

// ─── NoRace ───────────────────────────────────────────────────────────────────

function NoRace() {
  return (
    <Card
      variant="outlined"
      sx={{
        textAlign: "center",
        py: 8,
        borderStyle: "dashed",
        borderColor: "divider",
      }}
    >
      <CardContent>
        <FlagIcon sx={{ fontSize: 48, color: "text.disabled", mb: 2 }} />
        <Typography
          variant="h6"
          sx={{
            color: "text.secondary",
            fontWeight: 600,
          }}
        >
          目前沒有進行中的比賽
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mt: 0.5,
          }}
        >
          下一場比賽將在整點自動開賽
        </Typography>
      </CardContent>
    </Card>
  );
}

// ─── RaceHeader ───────────────────────────────────────────────────────────────

function RaceHeader({ race }) {
  const meta = STATUS_META[race.status] ?? STATUS_META.finished;
  const { Icon } = meta;

  return (
    <Card variant="outlined" sx={{ mb: 2, px: 2, py: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Chip
          icon={<Icon sx={{ fontSize: "1rem !important" }} />}
          label={meta.label}
          color={meta.color}
          size="small"
          sx={{ fontWeight: 700, borderRadius: 1.5 }}
        />

        {race.status === "betting" && race.betting_end_at && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            下注截止：
            {new Date(race.betting_end_at).toLocaleString("zh-TW", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Typography>
        )}
        {race.status === "running" && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            第 <strong>{race.round}</strong> 回合
          </Typography>
        )}
        {race.status === "finished" && (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
            }}
          >
            共 {race.round} 回合
            {race.finished_at && (
              <> &middot; {new Date(race.finished_at).toLocaleString("zh-TW")}</>
            )}
          </Typography>
        )}
      </Box>
    </Card>
  );
}

// ─── RaceTrack ────────────────────────────────────────────────────────────────

function RaceTrack({ runners, trackLength = DEFAULT_TRACK_LENGTH }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: "20px !important" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          賽道
        </Typography>
        <Stack spacing={2}>
          {runners.map(runner => (
            <RunnerRow key={runner.id} runner={runner} trackLength={trackLength} />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function RunnerRow({ runner, trackLength }) {
  const progress = Math.min((runner.position / trackLength) * 100, 100);
  const isWinner = runner.position >= trackLength;
  const rankLabel = RANK_LABELS[runner.rank];

  // progress bar color
  let barColor;
  if (isWinner) {
    barColor = "secondary.light"; // gold for winner
  } else if (runner.rank === 1) {
    barColor = "success.main";
  } else if (runner.rank <= 3) {
    barColor = "primary.main";
  } else {
    barColor = "text.disabled";
  }

  return (
    <Box>
      {/* runner info row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          mb: 0.75,
          minHeight: 44,
        }}
      >
        {/* rank badge */}
        <Box
          role="img"
          aria-label={`第 ${runner.rank} 名`}
          sx={theme => {
            const medal = rankLabel ? theme.palette.medal[runner.rank - 1] : null;
            return {
              width: 30,
              height: 30,
              borderRadius: "50%",
              bgcolor: medal ?? "action.selected",
              color: medal ? theme.palette.getContrastText(medal) : "text.secondary",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: "0.75rem",
              fontWeight: 700,
            };
          }}
        >
          {rankLabel ?? runner.rank}
        </Box>

        {/* avatar */}
        <Avatar
          src={runner.avatar_url}
          alt={runner.character_name}
          sx={{
            width: 42,
            height: 42,
            flexShrink: 0,
            border: 2,
            borderColor: isWinner
              ? "secondary.light"
              : runner.rank === 1
                ? "success.main"
                : "divider",
            transition: "border-color 200ms ease",
          }}
        />

        {/* name + status effects */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: isWinner || runner.rank === 1 ? 700 : 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: isWinner ? "warning.main" : "text.primary",
              }}
            >
              {runner.character_name}
            </Typography>
            {isWinner && (
              <EmojiEventsIcon
                role="img"
                sx={{ fontSize: 16, color: "secondary.light", flexShrink: 0 }}
                aria-label="冠軍"
              />
            )}
            {runner.status && STATUS_CHIP_LABELS[runner.status] && (
              <Chip
                label={STATUS_CHIP_LABELS[runner.status]}
                color={STATUS_CHIP_COLORS[runner.status]}
                size="small"
                sx={{ height: 20, fontSize: "0.75rem", fontWeight: 700, flexShrink: 0 }}
              />
            )}
          </Box>

          {/* stamina */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.25 }}>
            <BoltIcon sx={{ fontSize: 12, color: "text.disabled" }} />
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
              }}
            >
              {runner.stamina}
            </Typography>
          </Box>
        </Box>

        {/* odds — right-aligned, golden */}
        {runner.oddsEntry && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 700,
              color: "warning.main",
              flexShrink: 0,
              minWidth: 36,
              textAlign: "right",
            }}
          >
            {runner.oddsEntry.odds}x
          </Typography>
        )}
      </Box>
      {/* progress bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        aria-label={`${runner.character_name} 進度 ${runner.position}/${trackLength}`}
        sx={{
          height: 10,
          borderRadius: 5,
          bgcolor: "surface.inset",
          "& .MuiLinearProgress-bar": {
            borderRadius: 5,
            bgcolor: barColor,
            transition: "transform 600ms ease",
          },
        }}
      />
      {/* position label */}
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          mt: 0.25,
          display: "block",
        }}
      >
        {runner.position} / {trackLength}
      </Typography>
    </Box>
  );
}

// ─── EventLog ─────────────────────────────────────────────────────────────────

function EventLog({ events }) {
  const recentEvents = events.slice(-8).reverse();

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: "16px !important" }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
          事件紀錄
        </Typography>
        <Stack
          spacing={0}
          sx={{ maxHeight: 260, overflowY: "auto", pr: 0.5 }}
          divider={<Divider sx={{ my: 0.5 }} />}
        >
          {recentEvents.map(event => (
            <Box key={event.id} sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 0.5 }}>
              {/* round badge */}
              <Paper
                elevation={0}
                sx={{
                  minWidth: 32,
                  height: 22,
                  px: 0.5,
                  borderRadius: 1,
                  bgcolor: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  mt: 0.2,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700, lineHeight: 1, color: "primary.contrastText" }}
                >
                  R{event.round}
                </Typography>
              </Paper>

              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  lineHeight: 1.5,
                }}
              >
                {event.description}
              </Typography>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

// ─── RaceHistory ─────────────────────────────────────────────────────────────

// 前三場的冠軍頭像框用金銀銅，其餘用一般分隔線色
const historyBorder = (theme, i) => theme.palette.medal[i] ?? theme.palette.divider;

function RaceHistory({ history, onRaceClick }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: "16px !important" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.5 }}>
          <EmojiEventsIcon sx={{ fontSize: 18, color: "warning.main" }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            歷史戰績
          </Typography>
        </Box>

        <Stack spacing={0} divider={<Divider />}>
          {history.map((r, i) => {
            const finishedAt = new Date(r.finished_at).toLocaleString("zh-TW", {
              month: "numeric",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <ButtonBase
                key={r.id}
                onClick={() => onRaceClick && onRaceClick(r.id)}
                aria-label={`查看 ${r.winner_name} 奪冠的賽事，${finishedAt}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  gap: 1.5,
                  py: 1.25,
                  minHeight: 44,
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 1,
                  transition: "background-color 150ms ease",
                  "&:hover": { bgcolor: "action.hover" },
                  "&:active": { bgcolor: "action.selected" },
                }}
              >
                {/* position number */}
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.disabled",
                    width: 18,
                    flexShrink: 0,
                    textAlign: "center",
                    fontWeight: 600,
                  }}
                >
                  {i + 1}
                </Typography>
                {/* winner avatar with colored border */}
                <Avatar
                  src={r.winner_avatar}
                  alt={r.winner_name}
                  sx={{
                    width: 38,
                    height: 38,
                    flexShrink: 0,
                    border: 2.5,
                    borderColor: theme => historyBorder(theme, i),
                    transition: "border-color 200ms ease",
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {i === 0 && <EmojiEventsIcon sx={{ fontSize: 14, color: "secondary.light" }} />}
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: i === 0 ? 700 : 500,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.winner_name}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                    }}
                  >
                    {finishedAt}
                    {r.round && <> &middot; {r.round} 回合</>}
                  </Typography>
                </Box>
              </ButtonBase>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
