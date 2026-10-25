import { useState, useEffect, useCallback } from "react";
import {
  Typography,
  Tabs,
  Tab,
  Box,
  Card,
  CardActionArea,
  CardContent,
  LinearProgress,
  Chip,
  Skeleton,
  Avatar,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useSearchParams } from "react-router-dom";
import useLiff from "../../context/useLiff";
import AlertLogin from "../../components/AlertLogin";
import LoadError from "../../components/LoadError";
import { getUserAchievements, getAchievementStats } from "../../services/achievement";

import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlined";
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
import TerminalIcon from "@mui/icons-material/Terminal";
import ExtensionIcon from "@mui/icons-material/Extension";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import ShareIcon from "@mui/icons-material/Share";
import CelebrationIcon from "@mui/icons-material/Celebration";
import LockIcon from "@mui/icons-material/Lock";
import HelpOutlineIcon from "@mui/icons-material/HelpOutlined";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import DiamondIcon from "@mui/icons-material/Diamond";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import NotesRoundedIcon from "@mui/icons-material/NotesRounded";
import { getRarity, CATEGORY_ICONS } from "./constants";
import AchievementDetailSheet from "./AchievementDetailSheet";

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

// 卡片高度固定，同一列才會等高。名稱最多 2 行：
// 內距 32 + 頭像 48 + 間距 8 + 名稱 2 行 40 + 狀態 ~26 + 解鎖率 ~20 ≈ 178。
const CARD_HEIGHT = 188;

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
  // Holds the tapped achievement so the sheet can animate out with content
  // still mounted; cleared only when it fully closes.
  const [selected, setSelected] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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

  const retry = () => {
    setLoading(true);
    setError(null);
    fetchData();
  };

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
  if (error) return <LoadError message={`${error}，請檢查網路後再試一次。`} onRetry={retry} />;
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
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: "bold",
            }}
          >
            {summary.profile.displayName}
          </Typography>
        )}
        <Typography
          variant="h4"
          sx={{
            fontWeight: "bold",
            mt: 2,
          }}
        >
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
              background: theme =>
                `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
              borderRadius: 4,
            },
          }}
        />
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
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
              onOpen={(item, icon) => {
                setSelected({ item, icon });
                setSheetOpen(true);
              }}
            />
          ))
        )}
      </Box>
      <AchievementDetailSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        achievement={selected?.item}
        icon={selected?.icon}
        stats={selected ? statsMap[selected.item.id] : undefined}
      />
    </Box>
  );
}

function AchievementStatus({ achievement, isHidden, progress, rarity }) {
  if (achievement.isUnlocked) {
    return (
      <Chip
        label="已解鎖"
        size="small"
        sx={theme => ({
          bgcolor: rarity.main,
          color: theme.palette.getContrastText(rarity.main),
          fontWeight: "bold",
          fontSize: "0.75rem",
        })}
      />
    );
  }
  if (isHidden) {
    return (
      <Typography
        variant="caption"
        sx={{
          color: "text.disabled",
        }}
      >
        隱藏成就
      </Typography>
    );
  }
  return (
    <Box sx={{ width: "100%", px: 1 }}>
      <LinearProgress
        variant="determinate"
        value={progress}
        aria-label={`${achievement.name} 進度`}
        sx={{
          height: 4,
          borderRadius: 2,
          bgcolor: "surface.inset",
          "& .MuiLinearProgress-bar": { bgcolor: rarity.main },
        }}
      />
      <Typography
        variant="caption"
        sx={{
          color: "text.secondary",
          display: "block",
          textAlign: "center",
          mt: 0.5,
        }}
      >
        {achievement.currentValue}/{achievement.target_value}
      </Typography>
    </Box>
  );
}

function AchievementCard({ achievement, stats, onOpen }) {
  const theme = useTheme();
  const rarity = getRarity(theme, achievement.rarity);
  const isHidden = achievement.type === "hidden" && !achievement.isUnlocked;
  const progress =
    achievement.target_value > 0
      ? Math.min(Math.round((achievement.currentValue / achievement.target_value) * 100), 100)
      : 0;
  const unlockRate = stats ? `${stats.unlock_rate.toFixed(1)}%` : null;

  const IconComponent = isHidden
    ? HelpOutlineIcon
    : ACHIEVEMENT_ICONS[achievement.key] || CATEGORY_ICONS[achievement.category_key] || LockIcon;

  const iconColor = achievement.isUnlocked ? rarity.main : theme.palette.text.disabled;
  const iconBg = achievement.isUnlocked ? rarity.bg : theme.palette.surface.inset;
  // Only unlocked achievements carry `description`, so only they get the
  // corner note marker. Its absence on locked cards is the same information
  // gap the sheet spells out, told once more at a glance.
  const hasCondition = Boolean(achievement.description);

  return (
    <Card
      sx={{
        height: CARD_HEIGHT,
        border: achievement.isUnlocked
          ? `2px solid ${rarity.main}`
          : `1px solid ${theme.palette.divider}`,
        boxShadow: achievement.isUnlocked ? `0 0 12px ${alpha(rarity.main, 0.2)}` : "none",
        opacity: isHidden ? 0.6 : 1,
        borderRadius: 2,
        transition: "all 0.2s",
        "&:hover": {
          transform: achievement.isUnlocked ? "translateY(-2px)" : "none",
          boxShadow: achievement.isUnlocked ? `0 4px 16px ${alpha(rarity.main, 0.27)}` : "none",
        },
      }}
    >
      <CardActionArea
        onClick={() => onOpen(achievement, IconComponent)}
        aria-label={`查看成就詳情：${isHidden ? "隱藏成就" : achievement.name}`}
        sx={{
          position: "relative",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {hasCondition && (
          <NotesRoundedIcon
            aria-hidden="true"
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              fontSize: 14,
              color: rarity.main,
              opacity: 0.7,
            }}
          />
        )}
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

          {/* 名稱最多兩行：360px 的兩欄格子放不下長名稱，noWrap 會把它切成看不出差別的前半段 */}
          <Typography
            variant="body2"
            sx={{
              fontWeight: "bold",
              width: "100%",
              textAlign: "center",
              mb: 0.5,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              overflowWrap: "anywhere",
            }}
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
              sx={{
                color: "text.secondary",
                mt: "auto",
              }}
            >
              {unlockRate} 已解鎖
            </Typography>
          )}
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
