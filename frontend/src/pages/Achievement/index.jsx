import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Tab,
  Box,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  Skeleton,
  Avatar,
} from "@mui/material";
import { useSearchParams } from "react-router-dom";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import { getUserAchievements, getAchievementStats } from "../../services/achievement";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ForumIcon from "@mui/icons-material/Forum";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import GroupsIcon from "@mui/icons-material/Groups";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import CollectionsIcon from "@mui/icons-material/Collections";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import GavelIcon from "@mui/icons-material/Gavel";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import PeopleIcon from "@mui/icons-material/People";
import ShieldIcon from "@mui/icons-material/Shield";
import SecurityIcon from "@mui/icons-material/Security";
import BoltIcon from "@mui/icons-material/Bolt";
import TerminalIcon from "@mui/icons-material/Terminal";
import ExtensionIcon from "@mui/icons-material/Extension";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import ShareIcon from "@mui/icons-material/Share";
import CelebrationIcon from "@mui/icons-material/Celebration";
import LockIcon from "@mui/icons-material/Lock";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import DiamondIcon from "@mui/icons-material/Diamond";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";

const RARITY_CONFIG = {
  0: { label: "普通", color: "#757575", bg: "#f5f5f5" },
  1: { label: "稀有", color: "#6c5ce7", bg: "#ede7f6" },
  2: { label: "史詩", color: "#b8860b", bg: "#fff8e1" },
  3: { label: "傳說", color: "#d63384", bg: "#fce4ec" },
};

const ACHIEVEMENT_ICONS = {
  chat_100: ChatBubbleOutlineIcon,
  chat_1000: ForumIcon,
  chat_5000: ForumIcon,
  chat_night_owl: DarkModeIcon,
  chat_multi_group: GroupsIcon,
  gacha_first: CatchingPokemonIcon,
  gacha_100: CatchingPokemonIcon,
  gacha_500: CatchingPokemonIcon,
  gacha_collector_50: CollectionsIcon,
  gacha_lucky: AutoAwesomeIcon,
  janken_first_win: GavelIcon,
  janken_win_50: GavelIcon,
  janken_streak_5: WhatshotIcon,
  janken_streak_10: WhatshotIcon,
  janken_challenged_10: PeopleIcon,
  boss_first_kill: ShieldIcon,
  boss_level_10: SecurityIcon,
  boss_level_50: SecurityIcon,
  boss_top_damage: BoltIcon,
  social_first_command: TerminalIcon,
  social_all_features: ExtensionIcon,
  social_veteran_30d: EmojiEventsIcon,
  social_invite_group: ShareIcon,
  social_easter_egg: CelebrationIcon,
  subscribe_first: CardGiftcardIcon,
  subscribe_3: CardGiftcardIcon,
  subscribe_6: DiamondIcon,
  subscribe_12: AccountBalanceIcon,
  legacy_pioneer: AccountBalanceIcon,
};

const CATEGORY_ICONS = {
  chat: ChatBubbleOutlineIcon,
  gacha: CatchingPokemonIcon,
  janken: GavelIcon,
  world_boss: ShieldIcon,
  social: PeopleIcon,
  subscribe: CardGiftcardIcon,
};

const CARD_HEIGHT = 180;

const GRID_COLUMNS = {
  xs: "repeat(2, 1fr)",
  sm: "repeat(3, 1fr)",
  md: "repeat(4, 1fr)",
};

export default function Achievement() {
  const [summary, setSummary] = useState(null);
  const [stats, setStats] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { loggedIn: isLoggedIn, profile } = useLiff();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get("userId") || profile?.userId || "";

  useEffect(() => {
    document.title = "成就";
  }, []);

  const fetchData = useCallback(async () => {
    if (!userId) {
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
      <Box sx={{ py: 1 }}>
        <Skeleton variant="text" width={120} height={48} sx={{ mx: "auto" }} />
        <Skeleton variant="rectangular" height={8} sx={{ borderRadius: 4, my: 1 }} />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: GRID_COLUMNS,
            gap: 2,
            mt: 3,
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={CARD_HEIGHT} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      </Box>
    );
  }
  if (!isLoggedIn && !userId) return <AlertLogin />;
  if (error)
    return (
      <Box sx={{ py: 2 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  if (!summary) return null;

  const filteredCategories =
    activeTab === "all" ? summary.categories : summary.categories.filter(c => c.key === activeTab);

  const statsMap = Object.fromEntries(stats.map(s => [s.achievement_id, s]));

  return (
    <Box sx={{ py: 1 }}>
      <Box sx={{ textAlign: "center", mb: 3 }}>
        {summary.profile && (
          <Avatar
            src={summary.profile.pictureUrl}
            alt={summary.profile.displayName}
            sx={{ width: 64, height: 64, mx: "auto", mb: 1 }}
          />
        )}
        {summary.profile?.displayName && (
          <Typography variant="subtitle1" fontWeight="bold">
            {summary.profile.displayName}
          </Typography>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
          探索並解鎖所有成就吧！
        </Typography>
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

      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 3 }}
      >
        <Tab label="全部" value="all" sx={{ minWidth: 48, px: 1.5 }} />
        {summary.categories.map(cat => {
          const CatIcon = CATEGORY_ICONS[cat.key];
          return (
            <Tab
              key={cat.key}
              icon={CatIcon ? <CatIcon sx={{ fontSize: 18 }} /> : undefined}
              iconPosition="start"
              label={cat.name}
              value={cat.key}
              sx={{ minHeight: 48, minWidth: 48, px: 1.5 }}
            />
          );
        })}
      </Tabs>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: GRID_COLUMNS,
          gap: 2,
        }}
      >
        {filteredCategories.flatMap(cat =>
          cat.achievements.map(achievement => (
            <AchievementCard
              key={achievement.id}
              achievement={achievement}
              stats={statsMap[achievement.id]}
            />
          ))
        )}
      </Box>
    </Box>
  );
}

function AchievementStatus({ achievement, isHidden, progress, rarity }) {
  if (achievement.isUnlocked) {
    return (
      <Chip
        label="已解鎖"
        size="small"
        sx={{ bgcolor: rarity.color, color: "#fff", fontWeight: "bold", fontSize: "0.7rem" }}
      />
    );
  }
  if (isHidden) {
    return (
      <Typography variant="caption" color="text.disabled">
        隱藏成就
      </Typography>
    );
  }
  return (
    <Box sx={{ width: "100%", px: 1 }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 4,
          borderRadius: 2,
          bgcolor: "#eee",
          "& .MuiLinearProgress-bar": { bgcolor: rarity.color },
        }}
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", textAlign: "center", mt: 0.5 }}
      >
        {achievement.currentValue}/{achievement.target_value}
      </Typography>
    </Box>
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

  const IconComponent = isHidden
    ? HelpOutlineIcon
    : ACHIEVEMENT_ICONS[achievement.key] || CATEGORY_ICONS[achievement.category_key] || LockIcon;

  const iconColor = achievement.isUnlocked ? rarity.color : "#bdbdbd";
  const iconBg = achievement.isUnlocked ? rarity.bg : "#f5f5f5";

  return (
    <Card
      sx={{
        height: CARD_HEIGHT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        border: achievement.isUnlocked ? `2px solid ${rarity.color}` : "1px solid #e0e0e0",
        boxShadow: achievement.isUnlocked ? `0 0 12px ${rarity.color}33` : "none",
        opacity: isHidden ? 0.6 : 1,
        borderRadius: 2,
        transition: "all 0.2s",
        "&:hover": {
          transform: achievement.isUnlocked ? "translateY(-2px)" : "none",
          boxShadow: achievement.isUnlocked ? `0 4px 16px ${rarity.color}44` : "none",
        },
      }}
    >
      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          py: 2,
          px: 1.5,
          "&:last-child": { pb: 2 },
        }}
      >
        <Avatar
          sx={{
            width: 48,
            height: 48,
            bgcolor: iconBg,
            mb: 1,
          }}
        >
          <IconComponent sx={{ fontSize: 26, color: iconColor }} />
        </Avatar>

        <Typography
          variant="body2"
          fontWeight="bold"
          noWrap
          sx={{ width: "100%", textAlign: "center", mb: 0.5 }}
        >
          {isHidden ? "???" : achievement.name}
        </Typography>

        <AchievementStatus
          achievement={achievement}
          isHidden={isHidden}
          progress={progress}
          rarity={rarity}
        />

        {unlockRate && !isHidden && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ mt: "auto", fontSize: "0.65rem" }}
          >
            {unlockRate} 已解鎖
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
