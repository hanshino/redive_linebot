import { useRef } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Box, Button, Skeleton, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PersonIcon from "@mui/icons-material/Person";
import LoginIcon from "@mui/icons-material/Login";
import LoadError from "../../components/LoadError";
import { displayFont } from "../../theme";
import { APPROX_MAX_EXP } from "../Prestige/constants";

const num = { fontFamily: displayFont, fontVariantNumeric: "tabular-nums" };

// 卡框稀有度跟著轉生次數走：0 普通、1–2 稀有、3–4 史詩、覺醒（5）傳說。只有傳說有箔光。
function tierOf({ prestigeCount = 0, awakened }) {
  if (awakened || prestigeCount >= 5) return 3;
  if (prestigeCount >= 3) return 2;
  if (prestigeCount >= 1) return 1;
  return 0;
}

// 卡框。傳說卡的箔光只在框上，立繪上多一道跟著指標走的反光；按鈕與數字區不受影響。
function CardFrame({ tier = 0, children }) {
  const ref = useRef(null);
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const holo = tier === 3;

  const setLight = (x, y) => {
    ref.current?.style.setProperty("--mx", x);
    ref.current?.style.setProperty("--my", y);
  };
  const track =
    holo && !reduceMotion
      ? {
          onPointerMove: e => {
            const r = ref.current.getBoundingClientRect();
            setLight(
              `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`,
              `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`
            );
          },
          onPointerLeave: () => setLight("46%", "30%"),
        }
      : {};

  return (
    <Box
      ref={ref}
      {...track}
      sx={theme => ({
        "--mx": "46%",
        "--my": "30%",
        position: "relative",
        borderRadius: "18px",
        p: holo ? "6px" : "4px",
        background: holo ? theme.palette.card.foil : theme.palette.rarity[tier].main,
        ...(holo && {
          "&::before": {
            content: '""',
            position: "absolute",
            inset: 0,
            borderRadius: "18px",
            pointerEvents: "none",
            background: theme.palette.card.foilBands,
            backgroundSize: "200% 200%",
            backgroundPosition: "var(--mx) var(--my)",
            mixBlendMode: "overlay",
          },
        }),
      })}
    >
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          borderRadius: "13px",
          overflow: "hidden",
          bgcolor: "background.paper",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

function Portrait({ src, tier, children }) {
  const { palette } = useTheme();
  return (
    <Box
      component="figure"
      sx={{
        position: "relative",
        m: 0,
        aspectRatio: "4 / 3.1",
        bgcolor: "surface.inset",
        overflow: "hidden",
      }}
    >
      {src ? (
        <Box
          component="img"
          src={src}
          alt=""
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 30%",
            display: "block",
          }}
        />
      ) : (
        <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
          <PersonIcon sx={{ fontSize: 120, color: "text.disabled" }} />
        </Box>
      )}
      {tier === 3 && (
        <Box
          aria-hidden="true"
          sx={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background: `radial-gradient(60% 46% at var(--mx) var(--my), ${palette.card.sheen}, transparent 62%)`,
            mixBlendMode: "screen",
          }}
        />
      )}
      {tier != null && (
        <Box
          component="span"
          sx={{
            position: "absolute",
            top: 10,
            right: 10,
            px: 1,
            py: 0.25,
            borderRadius: "6px",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.14em",
            // 深色模式的稀有度色是亮色，字改用深底色才讀得到
            color: palette.mode === "dark" ? palette.stage.bg : palette.card.onScrim,
            bgcolor: palette.rarity[tier].main,
          }}
        >
          {palette.rarity[tier].label}
        </Box>
      )}
      {children}
    </Box>
  );
}

function NamePlate({ name, level, prestigeCount, awakened }) {
  const { card } = useTheme().palette;
  return (
    <Box
      component="figcaption"
      sx={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        px: 1.75,
        pt: 3.25,
        pb: 1.25,
        background: card.scrim,
        color: card.onScrim,
      }}
    >
      <Typography
        component="h1"
        sx={{
          fontFamily: displayFont,
          fontWeight: 700,
          fontSize: "1.5rem",
          lineHeight: 1.2,
          letterSpacing: "0.02em",
          overflowWrap: "anywhere",
        }}
      >
        {name}
      </Typography>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mt: 0.25,
          fontSize: "0.8125rem",
          color: card.onScrimMuted,
        }}
      >
        <Box
          component="span"
          sx={{ ...num, fontWeight: 700, fontSize: "1rem", color: card.onScrim }}
        >
          Lv. {level}
        </Box>
        {(awakened || prestigeCount > 0) && (
          <>
            <span aria-hidden="true">·</span>
            {awakened ? (
              <Box component="span" sx={{ fontWeight: 700, color: card.onScrimAccent }}>
                覺醒者
              </Box>
            ) : (
              <span>
                轉生{" "}
                <Box component="span" sx={{ ...num, fontWeight: 700, color: card.onScrimAccent }}>
                  ★{prestigeCount}
                </Box>
              </span>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

function Stat({ label, children, currency }) {
  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: currency ? "transparent" : "divider",
        borderRadius: "10px",
        px: 1.25,
        py: 1,
        bgcolor: currency ? "currency.bg" : "background.paper",
        color: currency ? "currency.main" : "text.primary",
      }}
    >
      <Typography
        component="dt"
        sx={{ fontSize: "0.75rem", color: currency ? "inherit" : "text.secondary" }}
      >
        {label}
      </Typography>
      <Typography component="dd" sx={{ ...num, m: 0, fontWeight: 700, fontSize: "1.0625rem" }}>
        {children}
      </Typography>
    </Box>
  );
}

function CardSkeleton() {
  return (
    <CardFrame>
      <Skeleton variant="rectangular" sx={{ aspectRatio: "4 / 3.1", height: "auto" }} />
      <Box sx={{ p: 1.75, display: "grid", gap: 1.5 }}>
        <Skeleton variant="rounded" height={10} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
          <Skeleton variant="rounded" height={54} />
          <Skeleton variant="rounded" height={54} />
        </Box>
        <Skeleton variant="rounded" height={48} />
      </Box>
    </CardFrame>
  );
}

// 冒險者卡：玩家本人的立繪、等級、轉生、女神石、連續簽到。
// 資料：/api/prestige/status（等級、累積 EXP、轉生）＋ /api/me/signins（今日、連續簽到、女神石）。
export default function AdventurerCard({ ready, loggedIn, login, profile, prestige, signins }) {
  if (!ready || (loggedIn && (prestige.loading || signins.loading))) return <CardSkeleton />;

  if (!loggedIn) {
    return (
      <CardFrame>
        <Portrait />
        <Box sx={{ p: 1.75 }}>
          <Button
            variant="contained"
            fullWidth
            startIcon={<LoginIcon />}
            onClick={login}
            sx={{ minHeight: 48, fontSize: "1rem", fontWeight: 700 }}
          >
            登入看你的冒險者卡
          </Button>
        </Box>
      </CardFrame>
    );
  }

  if (prestige.error || signins.error) {
    const retry = () => {
      if (prestige.error) prestige.reload();
      if (signins.error) signins.reload();
    };
    return (
      <CardFrame>
        <Box sx={{ p: 1.75 }}>
          <LoadError message="冒險者卡載入失敗，請稍後再試。" onRetry={retry} sx={{ py: 0 }} />
        </Box>
      </CardFrame>
    );
  }

  const status = prestige.data;
  const cal = signins.data;
  const tier = tierOf(status);
  const exp = Number(status.currentExp) || 0;
  const expPct = status.currentLevel >= 100 ? 100 : Math.min((exp / APPROX_MAX_EXP) * 100, 100);
  const signedToday = Boolean(cal.entries?.some(e => e.date === cal.today));

  return (
    <CardFrame tier={tier}>
      <Portrait src={profile?.pictureUrl} tier={tier}>
        <NamePlate
          name={profile?.displayName ?? "冒險者"}
          level={status.currentLevel}
          prestigeCount={status.prestigeCount}
          awakened={status.awakened}
        />
      </Portrait>

      <Box sx={{ p: 1.75, display: "grid", gap: 1.5 }}>
        <Box>
          <Box
            role="progressbar"
            aria-label="距離 Lv.100 的經驗值"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(expPct)}
            sx={{
              height: 10,
              borderRadius: "5px",
              bgcolor: "surface.inset",
              border: "1px solid",
              borderColor: "divider",
              overflow: "hidden",
            }}
          >
            <Box
              sx={theme => ({
                height: "100%",
                width: `${expPct}%`,
                background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light})`,
              })}
            />
          </Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              mt: 0.5,
              fontSize: "0.75rem",
              color: "text.secondary",
            }}
          >
            <span>EXP</span>
            <Box component="span" sx={num}>
              <Box component="b" sx={{ color: "text.primary" }}>
                {exp.toLocaleString()}
              </Box>{" "}
              / {APPROX_MAX_EXP.toLocaleString()}
            </Box>
          </Box>
        </Box>

        <Box component="dl" sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, m: 0 }}>
          <Stat label="女神石" currency>
            {(Number(cal.godStoneBalance) || 0).toLocaleString()}
          </Stat>
          <Stat label="連續簽到">{Number(cal.stats?.streak) || 0} 天</Stat>
        </Box>

        <Button
          component={RouterLink}
          to="/signin"
          variant={signedToday ? "text" : "contained"}
          fullWidth
          sx={{
            minHeight: 48,
            fontSize: "1rem",
            fontWeight: 700,
            ...(signedToday && { bgcolor: "surface.inset", color: "text.secondary" }),
          }}
        >
          {signedToday ? "今日已簽到" : "今日簽到"}
        </Button>
      </Box>
    </CardFrame>
  );
}
