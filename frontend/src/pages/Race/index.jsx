import { useState, useEffect, useCallback, useRef } from "react";
import {
  Container,
  Typography,
  Alert,
  Box,
  LinearProgress,
  Chip,
  Card,
  CardContent,
  TextField,
  Button,
  Stack,
  Divider,
  Skeleton,
} from "@mui/material";
import { getCurrentRace } from "../../api/race";

const POLL_INTERVAL = 10000;

const STATUS_LABELS = {
  betting: "下注中",
  running: "比賽中",
  finished: "已結束",
};

const STATUS_COLORS = {
  betting: "warning",
  running: "success",
  finished: "default",
};

export default function Race() {
  const [raceData, setRaceData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const hasDataRef = useRef(false);

  const fetchRace = useCallback(async () => {
    try {
      const data = await getCurrentRace();
      setRaceData(data);
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

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Skeleton variant="text" width="40%" height={40} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 2, borderRadius: 2 }} />
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        賽馬競技場
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        每 10 秒自動更新
      </Typography>

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
          <RaceTrack runners={raceData.runners} />
          {raceData.odds?.length > 0 && (
            <OddsDisplay odds={raceData.odds} runners={raceData.runners} />
          )}
          {raceData.events?.length > 0 && <EventLog events={raceData.events} />}
        </>
      )}
    </Container>
  );
}

function NoRace() {
  return (
    <Card variant="outlined" sx={{ textAlign: "center", py: 6 }}>
      <CardContent>
        <Typography variant="h6" color="text.secondary">
          目前沒有進行中的比賽
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          下一場比賽將在整點自動開賽
        </Typography>
      </CardContent>
    </Card>
  );
}

function RaceHeader({ race }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
      <Chip label={STATUS_LABELS[race.status]} color={STATUS_COLORS[race.status]} size="small" />
      {race.status === "betting" && (
        <Typography variant="body2" color="text.secondary">
          截止: {new Date(race.betting_end_at).toLocaleTimeString("zh-TW")}
        </Typography>
      )}
      {race.status === "running" && (
        <Typography variant="body2" color="text.secondary">
          第 {race.round} 回合
        </Typography>
      )}
      {race.status === "finished" && (
        <Typography variant="body2" color="text.secondary">
          共 {race.round} 回合 | {new Date(race.finished_at).toLocaleString("zh-TW")}
        </Typography>
      )}
    </Box>
  );
}

function RaceTrack({ runners }) {
  const trackLength = 10;

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
          賽道
        </Typography>
        <Stack spacing={1.5}>
          {runners.map(runner => {
            const progress = (runner.position / trackLength) * 100;
            const statusLabel =
              runner.status === "stunned" ? " (暈眩)" : runner.status === "slowed" ? " (減速)" : "";

            return (
              <Box key={runner.id}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {runner.lane}. {runner.character_name}
                    {runner.position >= trackLength && " \uD83C\uDFC6"}
                    {statusLabel && (
                      <Typography component="span" variant="caption" color="error.main">
                        {statusLabel}
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {runner.position}/{trackLength} | 體力 {runner.stamina}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 12,
                    borderRadius: 1,
                    bgcolor: "grey.200",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 1,
                      bgcolor: runner.position >= trackLength ? "success.main" : "primary.main",
                    },
                  }}
                />
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}

function OddsDisplay({ odds, runners }) {
  const getRunnerName = runnerId => {
    const runner = runners.find(r => r.id === runnerId);
    return runner ? runner.character_name : `#${runnerId}`;
  };

  return (
    <Card variant="outlined" sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          目前賠率
        </Typography>
        <Stack spacing={0.5}>
          {odds.map(o => (
            <Box key={o.runnerId} sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2">{getRunnerName(o.runnerId)}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {o.odds}x
              </Typography>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function EventLog({ events }) {
  const recentEvents = events.slice(-10).reverse();

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          事件紀錄
        </Typography>
        <Stack spacing={0.5} divider={<Divider />}>
          {recentEvents.map(event => (
            <Box key={event.id} sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2">{event.description}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
                R{event.round}
              </Typography>
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
