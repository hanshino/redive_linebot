import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Box,
  Card,
  CardContent,
  Stack,
  Divider,
  Chip,
  Avatar,
  LinearProgress,
  Skeleton,
  Alert,
  Button,
  Paper,
  Grid,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
import BoltIcon from "@mui/icons-material/Bolt";
import { getRaceById } from "../../api/race";

const RANK_STYLES = {
  1: { bg: "#F59E0B", text: "#fff" },
  2: { bg: "#64748B", text: "#fff" },
  3: { bg: "#92400E", text: "#fff" },
};

export default function RaceDetail() {
  const { raceId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRaceById(raceId)
      .then(setData)
      .catch(() => setError("無法載入賽事資料"))
      .finally(() => setLoading(false));
  }, [raceId]);

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Skeleton variant="text" width="60%" height={40} />
        <Skeleton variant="rounded" height={200} sx={{ mt: 2, borderRadius: 2 }} />
        <Skeleton variant="rounded" height={150} sx={{ mt: 2, borderRadius: 2 }} />
      </Container>
    );
  }

  if (error || !data?.race) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Alert severity="error">{error || "找不到此賽事"}</Alert>
        <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/race")}>
            返回賽事
          </Button>
          <Button startIcon={<MonetizationOnIcon />} variant="outlined" onClick={() => navigate("/race/bet")}>
            下注 / 紀錄
          </Button>
        </Box>
      </Container>
    );
  }

  const { race, runners = [], events = [], settlement, betStats, trackLength = 50 } = data;
  const sortedRunners = [...runners].sort((a, b) => b.position - a.position);
  const winner = sortedRunners.find(r => r.id === race.winner_runner_id);
  const isFinished = race.status === "finished";

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Navigation + Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2.5 }}>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              蘭德索爾盃
            </Typography>
            <Chip
              label={isFinished ? "已結束" : race.status === "running" ? "比賽中" : "下注中"}
              size="small"
              color={isFinished ? "default" : "success"}
              sx={{ fontWeight: 700 }}
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            共 {race.round} 回合
            {race.finished_at && (
              <> &middot; {new Date(race.finished_at).toLocaleString("zh-TW")}</>
            )}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/race")}
            size="small"
            sx={{ fontWeight: 600 }}
          >
            賽況
          </Button>
          <Button
            startIcon={<MonetizationOnIcon />}
            variant="outlined"
            onClick={() => navigate("/race/bet")}
            size="small"
            sx={{ fontWeight: 600 }}
          >
            下注 / 紀錄
          </Button>
        </Box>
      </Box>

      {/* Winner highlight — full width */}
      {isFinished && winner && (
        <Card
          sx={{
            mb: 2,
            background: theme => `linear-gradient(135deg, ${theme.palette.warning.main}22, ${theme.palette.warning.main}08)`,
            borderColor: "warning.main",
            borderWidth: 1,
            borderStyle: "solid",
          }}
        >
          <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: "16px !important" }}>
            <EmojiEventsIcon sx={{ fontSize: 36, color: "warning.main" }} />
            <Avatar
              src={winner.avatar_url}
              alt={winner.character_name}
              sx={{ width: 52, height: 52, border: 2, borderColor: "warning.main" }}
            />
            <Box>
              <Typography variant="caption" color="text.secondary">
                冠軍
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {winner.character_name}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Responsive two-column layout */}
      <Grid container spacing={2}>
        {/* Left column: settlement + standings */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Stack spacing={2}>
            {/* Settlement summary */}
            {settlement && (
              <Card variant="outlined">
                <CardContent sx={{ p: "20px !important" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 2 }}>
                    結算資訊
                  </Typography>

                  {/* Primary stats: pool + payout in larger style */}
                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2, textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">總注額</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                          {settlement.totalPool.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">女神石</Typography>
                      </Box>
                    </Grid>
                    <Grid size={{ xs: 6 }}>
                      <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2, textAlign: "center" }}>
                        <Typography variant="caption" color="text.secondary">實發獎金</Typography>
                        <Typography variant="h6" sx={{ fontWeight: 700, color: "success.main" }}>
                          {settlement.prizePool.toLocaleString()}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">女神石</Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  {/* Secondary stats row */}
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 4 }}>
                      <StatItem label="系統抽成" value={`${(settlement.feeRate * 100).toFixed(0)}%`} />
                    </Grid>
                    {settlement.multiplier && (
                      <Grid size={{ xs: 4 }}>
                        <StatItem label="中獎倍數" value={`${settlement.multiplier}x`} highlight />
                      </Grid>
                    )}
                    {betStats && (
                      <>
                        <Grid size={{ xs: 4 }}>
                          <StatItem label="參與人數" value={`${betStats.totalBettors} 人`} />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <StatItem label="總注數" value={`${betStats.totalBets} 筆`} />
                        </Grid>
                        <Grid size={{ xs: 4 }}>
                          <StatItem label="中獎注數" value={`${betStats.winnerBets} 筆`} />
                        </Grid>
                      </>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            )}

            {/* Race Track - Final standings */}
            <Card variant="outlined">
              <CardContent sx={{ p: "16px !important" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  最終排名
                </Typography>
                <Stack spacing={1.5}>
                  {sortedRunners.map((runner, idx) => {
                    const rank = idx + 1;
                    const progress = Math.min((runner.position / trackLength) * 100, 100);
                    const isWinner = runner.id === race.winner_runner_id;
                    const rankStyle = RANK_STYLES[rank];

                    return (
                      <Box key={runner.id}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 0.5 }}>
                          <Box
                            sx={{
                              width: 26,
                              height: 26,
                              borderRadius: "50%",
                              bgcolor: rankStyle ? rankStyle.bg : "grey.400",
                              color: rankStyle ? rankStyle.text : "text.secondary",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {rank}
                          </Box>
                          <Avatar
                            src={runner.avatar_url}
                            alt={runner.character_name}
                            sx={{ width: 36, height: 36, border: 2, borderColor: isWinner ? "warning.main" : "divider" }}
                          />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: isWinner ? 700 : 500,
                                color: isWinner ? "warning.main" : "text.primary",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {runner.character_name}
                              {isWinner && (
                                <EmojiEventsIcon
                                  sx={{ fontSize: 14, color: "warning.main", ml: 0.5, verticalAlign: "text-bottom" }}
                                />
                              )}
                            </Typography>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <BoltIcon sx={{ fontSize: 12, color: "text.disabled" }} />
                              <Typography variant="caption" color="text.secondary">
                                {runner.stamina}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                {runner.position}/{trackLength}
                              </Typography>
                            </Box>
                          </Box>
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={progress}
                          sx={{
                            height: 6,
                            borderRadius: 3,
                            bgcolor: "grey.200",
                            "& .MuiLinearProgress-bar": {
                              borderRadius: 3,
                              bgcolor: isWinner ? "warning.main" : rank <= 3 ? "primary.main" : "grey.400",
                            },
                          }}
                        />
                      </Box>
                    );
                  })}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        {/* Right column: events */}
        <Grid size={{ xs: 12, md: 5 }}>
          {events.length > 0 && (
            <Card variant="outlined" sx={{ height: "100%" }}>
              <CardContent sx={{ p: "16px !important" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                  事件紀錄 ({events.length})
                </Typography>
                <Stack
                  spacing={0}
                  divider={<Divider sx={{ my: 0.5 }} />}
                  sx={{ maxHeight: 500, overflowY: "auto" }}
                >
                  {[...events].reverse().map(event => (
                    <Box
                      key={event.id}
                      sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.75 }}
                    >
                      <Paper
                        elevation={0}
                        sx={{
                          minWidth: 36,
                          height: 22,
                          borderRadius: 1,
                          bgcolor: "primary.main",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <Typography
                          sx={{ fontSize: "0.65rem", fontWeight: 700, color: "primary.contrastText" }}
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
          )}
        </Grid>
      </Grid>
    </Container>
  );
}

function StatItem({ label, value, highlight }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ fontWeight: 700, color: highlight ? "warning.main" : "text.primary" }}
      >
        {value}
      </Typography>
    </Box>
  );
}
