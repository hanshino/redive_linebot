import { Box, Card, Typography, Skeleton, Stack, Chip } from "@mui/material";

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
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          尚無排名資料
        </Typography>
      </Card>
    );
  }

  return (
    <Box>
      <Typography
        variant="subtitle2"
        sx={{
          color: "text.secondary",
          mb: 1,
        }}
      >
        段位排行榜
      </Typography>
      <Stack spacing={1}>
        {rankings.map(player => {
          const isTop3 = player.rank <= 3;
          // 金銀銅走 theme.palette.medal，只當外框色用；名次數字維持文字色，
          // 金色數字在淺色背景上對比不足
          const medalColor = theme => theme.palette.medal[player.rank - 1];

          return (
            <Card
              key={player.rank}
              sx={{
                p: 1.5,
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                borderWidth: isTop3 ? 2 : 1,
                borderColor: isTop3 ? medalColor : undefined,
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  width: 36,
                  textAlign: "center",
                  fontWeight: 700,
                  color: isTop3 ? "text.primary" : "text.secondary",
                }}
              >
                {player.rank}
              </Typography>
              {player.rankImage && (
                <Box
                  component="img"
                  src={player.rankImage}
                  alt={player.rankLabel}
                  sx={{ width: 28, height: 28, objectFit: "contain", flexShrink: 0 }}
                />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    alignItems: "center",
                  }}
                >
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
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                  }}
                >
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
