import { Box, Card, Typography, Skeleton, Stack, Chip } from "@mui/material";

const MEDAL_COLORS = {
  1: "#FFD700",
  2: "#C0C0C0",
  3: "#CD7F32",
};

const TIER_COLORS = {
  beginner: "default",
  challenger: "info",
  fighter: "success",
  master: "warning",
  legend: "error",
};

export default function RankingList({ rankings, loading }) {
  if (loading) {
    return (
      <Stack spacing={1}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="rounded" height={64} />
        ))}
      </Stack>
    );
  }

  if (!rankings || rankings.length === 0) {
    return (
      <Card sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          尚無排名資料
        </Typography>
      </Card>
    );
  }

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        ELO 排行榜
      </Typography>
      <Stack spacing={1}>
        {rankings.map(player => {
          const isTop3 = player.rank <= 3;
          const medalColor = MEDAL_COLORS[player.rank];

          return (
            <Card
              key={player.rank}
              sx={{
                p: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                borderLeft: isTop3 ? 4 : 0,
                borderColor: medalColor || "transparent",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  width: 36,
                  textAlign: "center",
                  fontWeight: 700,
                  color: medalColor || "text.secondary",
                }}
              >
                {player.rank}
              </Typography>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {player.displayName}
                  </Typography>
                  <Chip
                    label={player.rankLabel}
                    size="small"
                    color={TIER_COLORS[player.rankTier] || "default"}
                    variant="outlined"
                    sx={{ fontSize: "0.75rem", height: 22 }}
                  />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {player.winCount}勝 {player.loseCount}負 {player.drawCount}平{" / "}
                  勝率 {player.winRate}%{player.streak > 0 && ` / ${player.streak} 連勝`}
                </Typography>
              </Box>

              <Typography
                variant="body2"
                sx={{ fontWeight: 700, color: "primary.main", whiteSpace: "nowrap" }}
              >
                {player.elo}
              </Typography>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}
