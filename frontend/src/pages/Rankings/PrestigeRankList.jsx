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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { getBlessingIcon } from "../Prestige/blessingIcons";
import { getBuildIcon } from "../Prestige/buildIcons";
import { BLESSING_CATALOG } from "./blessingCatalog";

const BUILD_TAG_MAP = {
  breeze: { displayName: "疾風" },
  torrent: { displayName: "洪流" },
  temperature: { displayName: "溫度" },
  solitude: { displayName: "孤獨" },
};

const MEDAL_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

// Sub-component: prestige star visualization or awakened chip
function PrestigeStars({ prestigeCount, awakened }) {
  if (awakened) {
    return (
      <Chip
        icon={<AutoAwesomeIcon />}
        label="覺醒"
        size="small"
        sx={{
          background: "linear-gradient(135deg, #6c5ce7, #d63384)",
          "@media (prefers-reduced-motion: reduce)": {
            background: "#6c5ce7",
          },
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.7rem",
          "& .MuiChip-icon": { color: "#fff" },
        }}
      />
    );
  }

  const filled = Math.min(prestigeCount ?? 0, 5);
  const empty = 5 - filled;
  const stars = "★".repeat(filled) + "☆".repeat(empty);

  return (
    <Typography
      variant="caption"
      sx={{
        color: filled > 0 ? "warning.main" : "text.disabled",
        letterSpacing: 1,
        fontFamily: "monospace",
        lineHeight: 1,
      }}
    >
      {stars}
    </Typography>
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
        sx={{ fontSize: "0.7rem", cursor: "default" }}
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
  const [expanded, setExpanded] = useState(null);

  if (!rows?.length) return null;

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
          const avatarColor = i < 3 ? MEDAL_COLORS[i] : "#90a4ae";
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
                      fontSize: "0.8rem",
                      fontWeight: 700,
                    }}
                  >
                    {rank}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
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
