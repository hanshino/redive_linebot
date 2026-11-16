import { Link as RouterLink } from "react-router-dom";
import { Box, ButtonBase, Typography } from "@mui/material";
import FeatureArt from "./FeatureArt";
import { displayFont } from "../../theme";

// 舞台卡（stage）只給戰鬥場景：猜拳、世界王。其他一律中性青框，不分稀有度。
const features = [
  { key: "janken", label: "猜拳競技場", path: "/janken", stage: true },
  { key: "worldboss", label: "世界王", path: "/worldboss", stage: true },
  { key: "race", label: "蘭德索爾盃", path: "/race" },
  { key: "gacha", label: "轉蛋商店", path: "/gacha/exchange" },
  { key: "trade", label: "角色交易所", path: "/trade/market" },
  { key: "bag", label: "轉蛋包包", path: "/bag" },
  { key: "achievement", label: "成就系統", path: "/achievements" },
  { key: "rankings", label: "排行榜", path: "/rankings" },
];

function FeatureCard({ feature, badge }) {
  const { key, label, path, stage } = feature;
  return (
    <ButtonBase
      component={RouterLink}
      to={path}
      sx={theme => {
        const { card, stage: st, surface, primary } = theme.palette;
        return {
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          textAlign: "left",
          width: "100%",
          overflow: "hidden",
          borderRadius: "14px",
          border: "1.5px solid",
          borderColor: stage ? st.hairline : card.frame,
          bgcolor: stage ? st.bg : "background.paper",
          transition: "border-color 0.2s ease-out, transform 0.2s ease-out",
          "&:hover": {
            borderColor: stage ? st.accent : primary.main,
            bgcolor: stage ? st.panel : surface.inset,
          },
          "@media (hover: hover) and (prefers-reduced-motion: no-preference)": {
            "&:hover": { transform: "translateY(-2px)" },
          },
          "&:focus-visible": { outline: "2px solid", outlineColor: primary.main, outlineOffset: 2 },
        };
      }}
    >
      {badge && (
        <Box
          component="span"
          sx={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 1,
            px: 1,
            py: 0.25,
            borderRadius: 999,
            fontSize: "0.75rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            bgcolor: "stage.accent",
            color: "stage.onAccent",
          }}
        >
          {badge}
        </Box>
      )}
      <Box component="span" sx={{ display: "block", aspectRatio: "4 / 3" }}>
        <FeatureArt name={key} />
      </Box>
      <Typography
        component="span"
        sx={{
          display: "flex",
          alignItems: "center",
          minHeight: 44,
          px: 1.25,
          py: 1,
          fontFamily: displayFont,
          fontWeight: 700,
          fontSize: "0.9375rem",
          letterSpacing: "0.02em",
          borderTop: "1px solid",
          borderColor: stage ? "stage.line" : "divider",
          color: stage ? "stage.text" : "text.primary",
        }}
      >
        {label}
      </Typography>
    </ButtonBase>
  );
}

export default function FeatureBinder({ badges = {} }) {
  return (
    <Box component="section" aria-labelledby="binder-heading">
      <Typography
        id="binder-heading"
        component="h2"
        sx={{ fontFamily: displayFont, fontWeight: 700, fontSize: "1.0625rem", mb: 1.25, mx: 0.25 }}
      >
        功能卡冊
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(3, 1fr)", xl: "repeat(4, 1fr)" },
          gap: { xs: 1.5, md: 2 },
        }}
      >
        {features.map(f => (
          <FeatureCard key={f.key} feature={f} badge={badges[f.key]} />
        ))}
      </Box>
    </Box>
  );
}
