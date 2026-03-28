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
} from "@mui/material";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import BoltIcon from "@mui/icons-material/Bolt";
import TimerIcon from "@mui/icons-material/Timer";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FlagIcon from "@mui/icons-material/Flag";
import { getCurrentRace, getRaceHistory } from "../../api/race";

const POLL_INTERVAL = 10000;
const DEFAULT_TRACK_LENGTH = 50;

const STATUS_META = {
  betting: { label: "下注中", color: "warning", Icon: TimerIcon },
  running: { label: "比賽中", color: "success", Icon: PlayArrowIcon },
  finished: { label: "已結束", color: "default", Icon: CheckCircleIcon },
};

// rank → style
const RANK_STYLES = {
  1: { bg: "#F59E0B", text: "#fff", label: "1st" },
  2: { bg: "#64748B", text: "#fff", label: "2nd" },
  3: { bg: "#92400E", text: "#fff", label: "3rd" },
};

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
  const [error, setError] = useState(null);
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
      setError(null);
    } catch (err) {
      console.error("Failed to fetch race", err);
      if (!hasDataRef.current) setError("無法載入比賽資料");
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
  const oddsMap = Object.fromEntries(
    (raceData?.odds ?? []).map(o => [o.runnerId, o])
  );
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
          <Typography variant="body2" color="text.secondary">
            每 10 秒自動更新
          </Typography>
        </Box>
        <Button
          variant={raceData?.race?.status === "betting" ? "contained" : "outlined"}
          color={raceData?.race?.status === "betting" ? "warning" : "primary"}
          size="small"
          onClick={() => navigate("/race/bet")}
          sx={{ fontWeight: 700, minWidth: 100, borderRadius: 2 }}
        >
          {raceData?.race?.status === "betting" ? "前往下注" : "下注 / 紀錄"}
        </Button>
      </Box>

      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {!raceData?.race ? (
        <NoRace />
      ) : (
        <>
          <RaceHeader race={raceData.race} />

          {/* responsive two-column layout */}
          <Grid container spacing={2} sx={{ mt: 0 }}>
            {/* left: race track */}
            <Grid size={{ xs: 12, md: 7 }}>
              <RaceTrack runners={sortedRunners} status={raceData.race.status} trackLength={raceData.trackLength ?? DEFAULT_TRACK_LENGTH} />
            </Grid>

            {/* right: event log + history */}
            <Grid size={{ xs: 12, md: 5 }}>
              <Stack spacing={2}>
                {raceData.events?.length > 0 && (
                  <EventLog events={raceData.events} />
                )}
                {history.length > 0 && <RaceHistory history={history} onRaceClick={id => navigate(`/race/${id}`)} />}
              </Stack>
            </Grid>
          </Grid>
        </>
      )}

      {/* history only when no active race */}
      {!raceData?.race && history.length > 0 && (
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
        <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 600 }}>
          目前沒有進行中的比賽
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
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
    <Card
      variant="outlined"
      sx={{ mb: 2, px: 2, py: 1.5 }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Chip
          icon={<Icon sx={{ fontSize: "1rem !important" }} />}
          label={meta.label}
          color={meta.color}
          size="small"
          sx={{ fontWeight: 700, borderRadius: 1.5 }}
        />

        {race.status === "betting" && race.betting_end_at && (
          <Typography variant="body2" color="text.secondary">
            下注截止：{new Date(race.betting_end_at).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </Typography>
        )}
        {race.status === "running" && (
          <Typography variant="body2" color="text.secondary">
            第 <strong>{race.round}</strong> 回合
          </Typography>
        )}
        {race.status === "finished" && (
          <Typography variant="body2" color="text.secondary">
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

function RaceTrack({ runners, status, trackLength = DEFAULT_TRACK_LENGTH }) {
  return (
    <Card variant="outlined" sx={{ height: "100%" }}>
      <CardContent sx={{ p: "20px !important" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          賽道
        </Typography>
        <Stack spacing={2}>
          {runners.map(runner => (
            <RunnerRow
              key={runner.id}
              runner={runner}
              raceFinished={status === "finished"}
              trackLength={trackLength}
            />
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function RunnerRow({ runner, raceFinished, trackLength }) {
  const progress = Math.min((runner.position / trackLength) * 100, 100);
  const isWinner = runner.position >= trackLength;
  const rankStyle = RANK_STYLES[runner.rank];

  // progress bar color
  let barColor;
  if (isWinner) {
    barColor = "#F59E0B"; // gold for winner
  } else if (runner.rank === 1) {
    barColor = "success.main";
  } else if (runner.rank <= 3) {
    barColor = "primary.main";
  } else {
    barColor = "grey.400";
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
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: rankStyle ? rankStyle.bg : "grey.300",
            color: rankStyle ? rankStyle.text : "text.secondary",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            fontSize: "0.65rem",
            fontWeight: 700,
          }}
          aria-label={`第 ${runner.rank} 名`}
        >
          {runner.rank <= 3 ? rankStyle.label : runner.rank}
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
            borderColor: isWinner ? "#F59E0B" : runner.rank === 1 ? "success.main" : "divider",
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
                sx={{ fontSize: 16, color: "#F59E0B", flexShrink: 0 }}
                aria-label="冠軍"
              />
            )}
            {runner.status && STATUS_CHIP_LABELS[runner.status] && (
              <Chip
                label={STATUS_CHIP_LABELS[runner.status]}
                color={STATUS_CHIP_COLORS[runner.status]}
                size="small"
                sx={{ height: 18, fontSize: "0.6rem", fontWeight: 700, flexShrink: 0 }}
              />
            )}
          </Box>

          {/* stamina */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 0.25 }}>
            <BoltIcon sx={{ fontSize: 12, color: "text.disabled" }} />
            <Typography variant="caption" color="text.secondary">
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
          bgcolor: theme =>
            theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "grey.200",
          "& .MuiLinearProgress-bar": {
            borderRadius: 5,
            bgcolor: barColor,
            transition: "transform 600ms ease",
          },
        }}
      />

      {/* position label */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.25, display: "block" }}>
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
            <Box
              key={event.id}
              sx={{ display: "flex", alignItems: "flex-start", gap: 1, py: 0.5 }}
            >
              {/* round badge */}
              <Paper
                elevation={0}
                sx={{
                  minWidth: 28,
                  height: 20,
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
                  sx={{ fontSize: "0.6rem", fontWeight: 700, color: "primary.contrastText" }}
                >
                  R{event.round}
                </Typography>
              </Paper>

              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
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

const HISTORY_BORDER = ["#F59E0B", "#94A3B8", "#92400E", "divider", "divider"];

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
            const borderColor = HISTORY_BORDER[i] ?? "divider";

            return (
              <Box
                key={r.id}
                onClick={() => onRaceClick && onRaceClick(r.id)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  py: 1.25,
                  cursor: "pointer",
                  borderRadius: 1,
                  transition: "background-color 150ms ease",
                  "&:hover": { bgcolor: "action.hover" },
                  "&:active": { bgcolor: "action.selected" },
                }}
              >
                {/* position number */}
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ width: 18, flexShrink: 0, textAlign: "center", fontWeight: 600 }}
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
                    borderColor,
                    transition: "border-color 200ms ease",
                  }}
                />

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    {i === 0 && (
                      <EmojiEventsIcon sx={{ fontSize: 14, color: "#F59E0B" }} />
                    )}
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
                  <Typography variant="caption" color="text.secondary">
                    {finishedAt}
                    {r.round && <> &middot; {r.round} 回合</>}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
