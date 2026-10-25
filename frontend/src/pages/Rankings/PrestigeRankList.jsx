import { createElement, useState } from "react";
import {
  Box,
  List,
  ListItemButton,
  ListItemAvatar,
  ListItemText,
  Avatar,
  Chip,
  Collapse,
  Typography,
  Tooltip,
  useTheme,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { getBlessingIcon } from "../Prestige/blessingIcons";
import { getBuildIcon } from "../Prestige/buildIcons";
import { BLESSING_CATALOG } from "./blessingCatalog";
import StarGlyphs from "../Prestige/StarGlyphs";
import { AWAKENED_GRADIENT, AWAKENED_FALLBACK } from "../Prestige/constants";

const BUILD_TAG_MAP = {
  breeze: { displayName: "疾風" },
  torrent: { displayName: "洪流" },
  temperature: { displayName: "溫度" },
  solitude: { displayName: "孤獨" },
};

// Sub-component: prestige star visualization or awakened chip
function PrestigeStars({ prestigeCount, awakened }) {
  if (awakened) {
    return (
      <Chip
        icon={<AutoAwesomeIcon />}
        label="覺醒"
        size="small"
        sx={{
          // 與轉生頁的覺醒者徽章同一組色
          background: AWAKENED_GRADIENT,
          "@media (prefers-reduced-motion: reduce)": {
            background: AWAKENED_FALLBACK,
          },
          color: "common.white",
          fontWeight: 600,
          fontSize: "0.75rem",
          "& .MuiChip-icon": { color: "common.white" },
        }}
      />
    );
  }

  const filled = Math.min(prestigeCount ?? 0, 5);

  // StarGlyphs 讀成「N / 5 星」，不會逐顆唸「黑星」
  return (
    <StarGlyphs
      value={filled}
      variant="caption"
      sx={{
        color: filled > 0 ? "warning.main" : "text.secondary",
        letterSpacing: 1,
        fontFamily: "monospace",
        lineHeight: 1,
      }}
    />
  );
}

// Sub-component: build tag chip with tooltip listing blessings
function BuildTagChip({ buildTag, blessingIds }) {
  const ids = blessingIds ?? [];

  if (ids.length === 0 && buildTag === null) return null;

  const tag = BUILD_TAG_MAP[buildTag] ?? { displayName: "自選" };
  const buildIconType = getBuildIcon(buildTag);

  const tooltipLines = ids.map(id => BLESSING_CATALOG[id]?.displayName).filter(Boolean);
  const tooltipContent = tooltipLines.length > 0 ? tooltipLines.join(" / ") : "尚未取得祝福";

  return (
    <Tooltip title={tooltipContent} arrow disableTouchListener>
      <Chip
        icon={buildIconType ? createElement(buildIconType) : undefined}
        label={tag.displayName}
        size="small"
        variant="outlined"
        // Inherit cursor from the parent ListItemButton (pointer) so the
        // whole row reads as one tappable target. Tooltip still works on
        // desktop hover; mobile users get the expand-row affordance instead.
        sx={{ fontSize: "0.75rem", cursor: "inherit" }}
        aria-label={`Build：${tag.displayName}，展開查看祝福`}
      />
    </Tooltip>
  );
}

// Sub-component: expanded blessing detail list
function BlessingsDetail({ blessingIds }) {
  const ids = blessingIds ?? [];

  if (ids.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: "text.secondary" }}>
        尚未取得祝福
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {ids.map(id => {
        const entry = BLESSING_CATALOG[id];
        if (!entry) return null;
        const Icon = getBlessingIcon(entry.slug);
        return (
          <Box key={id} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Icon sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="caption">{entry.displayName}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

// Main component: ranked list with prestige + build info
export default function PrestigeRankList({ rows }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(null);

  if (!rows?.length) return null;

  // 前三名獎牌色來自 theme.palette.medal；其餘用 surface.inset 的中性底
  const medalColors = theme.palette.medal;
  const defaultAvatarColor = theme.palette.surface.inset;

  const handleToggle = rank => {
    setExpanded(prev => (prev === rank ? null : rank));
  };

  return (
    <Box sx={{ mt: 1 }}>
      <Typography
        variant="subtitle2"
        sx={{ color: "text.secondary", mb: 0.5, px: 1, fontWeight: 600 }}
      >
        等級詳情
      </Typography>
      <List disablePadding>
        {rows.map((row, i) => {
          const rank = i + 1;
          const isExpanded = expanded === rank;
          const avatarColor = i < 3 ? medalColors[i] : defaultAvatarColor;
          const blessingIds = row.blessingIds ?? [];

          return (
            <Box key={rank}>
              <ListItemButton
                sx={{
                  borderRadius: 1,
                  minHeight: 48,
                  px: 1,
                  py: 0.5,
                }}
                onClick={() => handleToggle(rank)}
                aria-expanded={isExpanded}
              >
                <ListItemAvatar sx={{ minWidth: 44 }}>
                  <Avatar
                    sx={{
                      width: 32,
                      height: 32,
                      bgcolor: avatarColor,
                      color: theme.palette.getContrastText(avatarColor),
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    {rank}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  slotProps={{ primary: { component: "div" }, secondary: { component: "div" } }}
                  primary={
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {row.displayName}
                    </Typography>
                  }
                  secondary={
                    <Box
                      component="span"
                      sx={{
                        display: "flex",
                        gap: 0.75,
                        alignItems: "center",
                        flexWrap: "wrap",
                        mt: 0.25,
                      }}
                    >
                      <Typography
                        component="span"
                        variant="caption"
                        sx={{ color: "text.secondary" }}
                      >
                        Lv.{row.level}
                      </Typography>
                      <PrestigeStars
                        prestigeCount={row.prestigeCount ?? 0}
                        awakened={row.awakened ?? false}
                      />
                      <BuildTagChip buildTag={row.buildTag ?? null} blessingIds={blessingIds} />
                    </Box>
                  }
                />
                <ExpandMoreIcon
                  fontSize="small"
                  aria-hidden="true"
                  sx={{
                    transition: "transform 0.2s",
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                    "@media (prefers-reduced-motion: reduce)": {
                      transition: "none",
                    },
                    ml: 0.5,
                    flexShrink: 0,
                  }}
                />
              </ListItemButton>
              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                <Box
                  sx={{
                    pl: 7,
                    pr: 2,
                    pb: 1.5,
                    pt: 0.5,
                  }}
                >
                  <BlessingsDetail blessingIds={blessingIds} />
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );
}
