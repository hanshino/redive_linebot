import { useState, useEffect, useCallback } from "react";
import {
  Container,
  Typography,
  Tabs,
  Tab,
  Box,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Grid,
  Skeleton,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import { getUserAchievements, getAchievementStats } from "../../services/achievement";

// Colors chosen for WCAG 4.5:1 contrast against white backgrounds
const RARITY_CONFIG = {
  0: { label: "普通", color: "#757575" },
  1: { label: "稀有", color: "#6c5ce7" },
  2: { label: "史詩", color: "#b8860b" },
  3: { label: "傳說", color: "#d63384" },
};

export default function Achievement() {
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId") || "";

  const fetchData = useCallback(async () => {
    if (!userId) {
      setError("請提供用戶 ID");
      setLoading(false);
      return;
    }
    try {
      const [summaryData, statsData] = await Promise.all([
        getUserAchievements(userId),
        getAchievementStats(),
      ]);
      setSummary(summaryData);
      setStats(statsData);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch achievements", err);
      setError("無法載入成就資料");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Skeleton variant="text" width={120} height={48} sx={{ mx: "auto" }} />
        <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 4, my: 1 }} />
        <Grid container spacing={2} sx={{ mt: 3 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    );
  }
  if (error)
    return (
      <Container sx={{ py: 4 }}>
        <Typography color="error">{error}</Typography>
      </Container>
    );
  if (!summary) return null;

  const filteredCategories =
    activeTab === "all" ? summary.categories : summary.categories.filter(c => c.key === activeTab);

  const statsMap = {};
  stats.forEach(s => {
    statsMap[s.achievement_id] = s;
  });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box sx={{ textAlign: "center", mb: 3 }}>
        <Typography variant="h4" fontWeight="bold">
          {summary.unlocked} / {summary.total}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={summary.percentage}
          sx={{
            height: 8,
            borderRadius: 4,
            mt: 1,
            mb: 0.5,
            "& .MuiLinearProgress-bar": {
              background: "linear-gradient(90deg, #6c5ce7, #a29bfe)",
              borderRadius: 4,
            },
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {summary.percentage}% 完成
        </Typography>
      </Box>

      {/* Category Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
      >
        <Tab label="全部" value="all" />
        {summary.categories.map(cat => (
          <Tab
            key={cat.key}
            label={`${cat.icon} ${cat.name} (${cat.unlocked}/${cat.total})`}
            value={cat.key}
          />
        ))}
      </Tabs>

      {/* Achievement Grid */}
      <Grid container spacing={2}>
        {filteredCategories.flatMap(cat =>
          cat.achievements.map(achievement => (
            <Grid item xs={12} sm={6} md={4} key={achievement.id}>
              <AchievementCard achievement={achievement} stats={statsMap[achievement.id]} />
            </Grid>
          ))
        )}
      </Grid>
    </Container>
  );
}

function AchievementCard({ achievement, stats }) {
  const rarity = RARITY_CONFIG[achievement.rarity] || RARITY_CONFIG[0];
  const isHidden = achievement.type === "hidden" && !achievement.isUnlocked;
  const progress =
    achievement.target_value > 0
      ? Math.min(Math.round((achievement.currentValue / achievement.target_value) * 100), 100)
      : 0;
  const unlockRate = stats ? `${stats.unlock_rate.toFixed(1)}%` : null;

  return (
    <Card
      sx={{
        height: "100%",
        border: `2px solid ${achievement.isUnlocked ? rarity.color : "#e0e0e0"}`,
        boxShadow: achievement.isUnlocked ? `0 0 12px ${rarity.color}44` : "none",
        opacity: isHidden ? 0.5 : 1,
        transition: "all 0.2s",
      }}
    >
      <CardContent sx={{ textAlign: "center", py: 2 }}>
        <Typography variant="h4" sx={{ mb: 1 }}>
          {isHidden ? "?" : achievement.icon}
        </Typography>
        <Typography variant="body2" fontWeight="bold" noWrap>
          {isHidden ? "???" : achievement.name}
        </Typography>

        {achievement.isUnlocked ? (
          <Chip
            label="已解鎖"
            size="small"
            sx={{ mt: 1, bgcolor: rarity.color, color: "#fff", fontWeight: "bold" }}
          />
        ) : isHidden ? (
          <Typography variant="caption" color="text.disabled" sx={{ mt: 1, display: "block" }}>
            隱藏成就
          </Typography>
        ) : (
          <Box sx={{ mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 4,
                borderRadius: 2,
                "& .MuiLinearProgress-bar": { bgcolor: rarity.color },
              }}
            />
            <Typography variant="caption" color="text.secondary">
              {achievement.currentValue}/{achievement.target_value}
            </Typography>
          </Box>
        )}

        {unlockRate && !isHidden && (
          <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.5 }}>
            {unlockRate} 玩家已解鎖
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
