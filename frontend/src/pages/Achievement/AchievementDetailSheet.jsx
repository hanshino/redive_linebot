import {
  SwipeableDrawer,
  Box,
  Typography,
  Avatar,
  Chip,
  IconButton,
  LinearProgress,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import { RARITY_CONFIG } from "./constants";

/**
 * Bottom-sheet detail view for one achievement.
 *
 * The unlock criteria (`description`) only exists on unlocked achievements —
 * the API omits the key entirely while locked. That gap is intentional product
 * behaviour, so the locked state renders a sealed placeholder instead of an
 * empty box: the sheet should read "there is something here you haven't earned
 * yet", never "the data failed to load".
 */
export default function AchievementDetailSheet({ open, onClose, achievement, stats, icon }) {
  const rarity = RARITY_CONFIG[achievement?.rarity] || RARITY_CONFIG[0];

  if (!achievement) return null;

  const Icon = icon || EmojiEventsIcon;
  const isUnlocked = achievement.isUnlocked === true;
  const isHidden = achievement.type === "hidden" && !isUnlocked;
  const condition = achievement.description;
  const unlockedAt = formatUnlockedAt(achievement.unlockedAt);
  const unlockRate = stats ? `${stats.unlock_rate.toFixed(1)}%` : null;
  const reward = achievement.reward_stones > 0 ? `${achievement.reward_stones} 女神石` : null;
  const target = Number(achievement.target_value) || 0;
  const progress =
    target > 0 ? Math.min(Math.round((achievement.currentValue / target) * 100), 100) : 0;

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "88dvh",
            overflow: "hidden",
          },
        },
      }}
    >
      {/* Rarity wash: carries the collection language from the card into the sheet. */}
      <Box
        sx={{
          position: "relative",
          overflowY: "auto",
          background: `linear-gradient(180deg, ${rarity.color}1f 0%, transparent 180px)`,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 4,
            borderRadius: 2,
            bgcolor: "divider",
            mx: "auto",
            mt: 1.25,
          }}
        />
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="關閉成就詳情"
          sx={{ position: "absolute", top: 6, right: 8, color: "text.secondary" }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>

        <Box
          sx={{
            width: "100%",
            maxWidth: 480,
            mx: "auto",
            px: 2.5,
            pt: 2,
            pb: "calc(env(safe-area-inset-bottom) + 24px)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Avatar
              sx={{
                width: 60,
                height: 60,
                flexShrink: 0,
                bgcolor: isUnlocked ? `${rarity.color}1f` : "action.hover",
                border: isUnlocked ? `2px solid ${rarity.color}` : "1px solid",
                borderColor: isUnlocked ? rarity.color : "divider",
                boxShadow: isUnlocked ? `0 0 16px ${rarity.color}3d` : "none",
              }}
            >
              <Icon sx={{ fontSize: 30, color: isUnlocked ? rarity.color : "text.disabled" }} />
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 0.5 }}>
                <Chip
                  label={rarity.label}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: isUnlocked ? "#fff" : rarity.color,
                    bgcolor: isUnlocked ? rarity.color : `${rarity.color}1f`,
                  }}
                />
                {isUnlocked ? (
                  <Typography
                    variant="caption"
                    sx={{ color: rarity.color, fontWeight: 700, letterSpacing: "0.04em" }}
                  >
                    已解鎖
                  </Typography>
                ) : (
                  <Typography variant="caption" sx={{ color: "text.disabled" }}>
                    {isHidden ? "隱藏成就" : "未解鎖"}
                  </Typography>
                )}
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {isHidden ? "???" : achievement.name}
              </Typography>
            </Box>
          </Box>

          {/* The criteria block — the reason this sheet exists. */}
          {isUnlocked && condition ? (
            <Box
              sx={{
                position: "relative",
                mt: 2.5,
                pl: 2.25,
                pr: 2,
                py: 1.75,
                borderRadius: 2,
                overflow: "hidden",
                border: `1px solid ${rarity.color}3d`,
                background: `linear-gradient(135deg, ${rarity.color}1a, ${rarity.color}08)`,
                "&::before": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  bgcolor: rarity.color,
                },
                "@keyframes conditionReveal": {
                  from: { opacity: 0, transform: "translateY(10px)" },
                  to: { opacity: 1, transform: "none" },
                },
                animation: "conditionReveal 400ms cubic-bezier(0.16, 1, 0.3, 1) 140ms both",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  color: rarity.color,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                }}
              >
                解鎖條件
              </Typography>
              <Typography
                variant="body2"
                sx={{ mt: 0.5, lineHeight: 1.8, fontWeight: 500, wordBreak: "break-word" }}
              >
                {condition}
              </Typography>
            </Box>
          ) : (
            <Box
              sx={{
                mt: 2.5,
                px: 2,
                py: 1.75,
                borderRadius: 2,
                border: "1px dashed",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                gap: 1.25,
              }}
            >
              <LockOutlinedIcon sx={{ fontSize: 20, color: "text.disabled", flexShrink: 0 }} />
              <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.7 }}>
                {isHidden
                  ? "這個成就尚未公開，解鎖後會顯示名稱與條件。"
                  : "達成後才會公開解鎖條件。"}
              </Typography>
            </Box>
          )}

          {!isUnlocked && !isHidden && target > 0 && (
            <Box sx={{ mt: 2.5 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  mb: 0.75,
                }}
              >
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  目前進度
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  {achievement.currentValue} / {target}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 6,
                  borderRadius: 3,
                  "& .MuiLinearProgress-bar": { bgcolor: rarity.color, borderRadius: 3 },
                }}
              />
            </Box>
          )}

          {/* Skipped entirely when every row is empty — an empty bordered
              block reads as a rendering bug. */}
          {(unlockedAt || reward || (unlockRate && !isHidden)) && (
            <Box sx={{ mt: 2.5, display: "flex", flexDirection: "column", gap: 0.25 }}>
              {unlockedAt && (
                <MetaRow icon={EventAvailableOutlinedIcon} label="解鎖時間" value={unlockedAt} />
              )}
              {reward && <MetaRow icon={DiamondOutlinedIcon} label="獎勵" value={reward} />}
              {unlockRate && !isHidden && (
                <MetaRow
                  icon={GroupsOutlinedIcon}
                  label="全服解鎖率"
                  value={`${unlockRate} 的人已解鎖`}
                />
              )}
            </Box>
          )}
        </Box>
      </Box>
    </SwipeableDrawer>
  );
}

function MetaRow({ icon: Icon, label, value }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Icon sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ ml: "auto", fontWeight: 600, textAlign: "right", wordBreak: "break-word" }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function formatUnlockedAt(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
