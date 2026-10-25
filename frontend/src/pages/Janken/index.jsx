import { useState, useEffect, useCallback, useRef } from "react";
import { Container, Typography, Divider, Alert, Chip, Stack } from "@mui/material";
import BattleFeed from "./BattleFeed";
import RankingList from "./RankingList";
import LoadError from "../../components/LoadError";
import { getRankings, getRecentMatches } from "../../services/janken";

const MATCH_POLL_INTERVAL = 30000;
const RANKING_POLL_INTERVAL = 60000;

function formatClock(date) {
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export default function Janken() {
  const [rankings, setRankings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [seasonId, setSeasonId] = useState(null);
  // 兩個請求各自記錄成敗，一邊成功不會洗掉另一邊的錯誤
  const [rankingsFailed, setRankingsFailed] = useState(false);
  const [matchesFailed, setMatchesFailed] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const matchTimerRef = useRef(null);
  const rankingTimerRef = useRef(null);

  // 失敗時一律只記旗標、不動既有資料；要不要顯示錯誤、還是顯示「舊資料」由 render 時
  // 用當下的 state 判斷（不在 callback 裡讀 rankings / matches，避免拿到過期的閉包值）。
  const fetchRankings = useCallback(async () => {
    try {
      const data = await getRankings();
      setRankings(data.items || []);
      setSeasonId(data.seasonId ?? null);
      setRankingsFailed(false);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch rankings", err);
      setRankingsFailed(true);
    } finally {
      setLoadingRankings(false);
    }
  }, []);

  const fetchMatches = useCallback(async () => {
    try {
      const data = await getRecentMatches();
      setMatches(data);
      setMatchesFailed(false);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch matches", err);
      setMatchesFailed(true);
    } finally {
      setLoadingMatches(false);
    }
  }, []);

  const retryRankings = () => {
    setLoadingRankings(true);
    fetchRankings();
  };

  const retryMatches = () => {
    setLoadingMatches(true);
    fetchMatches();
  };

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

  // 沒有任何舊資料可顯示 → 整塊換成載入失敗；有舊資料 → 保留內容，只在上方提醒
  const matchesBlocked = matchesFailed && !loadingMatches && matches.length === 0;
  const rankingsBlocked = rankingsFailed && !loadingRankings && rankings.length === 0;
  const staleParts = [
    matchesFailed && !matchesBlocked ? "戰況" : null,
    rankingsFailed && !rankingsBlocked ? "排行榜" : null,
  ].filter(Boolean);

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
      {/* 資料是定時輪詢（戰況 30 秒、排行 60 秒），不是推播，所以標示最後更新時間而不是「即時」 */}
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          mb: 3,
        }}
      >
        對戰排行{lastUpdated ? ` · 更新於 ${formatClock(lastUpdated)}` : ""}
      </Typography>
      {staleParts.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {staleParts.join("與")}更新失敗，目前顯示的是上次載入的內容。
        </Alert>
      )}
      {matchesBlocked ? (
        <LoadError
          message="無法載入對戰紀錄，請檢查網路後再試一次。"
          onRetry={retryMatches}
          sx={{ pt: 0, pb: 3 }}
        />
      ) : (
        <BattleFeed matches={matches} loading={loadingMatches} />
      )}
      <Divider sx={{ my: 3 }} />
      {rankingsBlocked ? (
        <LoadError message="無法載入排行榜，請檢查網路後再試一次。" onRetry={retryRankings} />
      ) : (
        <RankingList rankings={rankings} loading={loadingRankings} />
      )}
    </Container>
  );
}
