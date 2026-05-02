import { useState, useEffect, useCallback, useRef } from "react";
import { Container, Typography, Divider, Alert, Chip, Stack } from "@mui/material";
import BattleFeed from "./BattleFeed";
import RankingList from "./RankingList";
import { getRankings, getRecentMatches } from "../../services/janken";

const MATCH_POLL_INTERVAL = 30000;
const RANKING_POLL_INTERVAL = 60000;

export default function Janken() {
  const [rankings, setRankings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [seasonId, setSeasonId] = useState(null);
  const [error, setError] = useState(null);
  const matchTimerRef = useRef(null);
  const rankingTimerRef = useRef(null);

  const fetchRankings = useCallback(async () => {
    try {
      const data = await getRankings();
      setRankings(data.items || []);
      setSeasonId(data.seasonId ?? null);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch rankings", err);
      if (!rankings.length) setError("無法載入排行榜資料");
    } finally {
      setLoadingRankings(false);
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await getRecentMatches();
      setMatches(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch matches", err);
      if (!matches.length) setError("無法載入對戰紀錄");
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    matchTimerRef.current = setInterval(fetchMatches, MATCH_POLL_INTERVAL);
    rankingTimerRef.current = setInterval(fetchRankings, RANKING_POLL_INTERVAL);
  }, [fetchMatches, fetchRankings]);

  const stopPolling = useCallback(() => {
    clearInterval(matchTimerRef.current);
    clearInterval(rankingTimerRef.current);
  }, []);

  useEffect(() => {
    fetchRankings();
    fetchMatches();
    startPolling();

    // Pause polling when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchRankings();
        fetchMatches();
        startPolling();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchRankings, fetchMatches, startPolling, stopPolling]);

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          猜拳競技場
        </Typography>
        {seasonId != null && (
          <Chip label={`第 ${seasonId} 賽季`} size="small" color="primary" variant="outlined" />
        )}
      </Stack>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: 3,
        }}
      >
        即時對戰排行
      </Typography>
      {error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <BattleFeed matches={matches} loading={loadingMatches} />
      <Divider sx={{ my: 3 }} />
      <RankingList rankings={rankings} loading={loadingRankings} />
    </Container>
  );
}
