import { Avatar, Box, Chip, Paper, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import { LISTING_STATUS, NUMS, charGradient } from "./_market";

/* ---------------------------------------------------------------- 版面零件 */

/**
 * 基礎星數標記：一顆 ★ 加數字（★3），不是重複三顆星。
 *
 * 為什麼是 ★+數字而不是 ★★★：
 * 掛單列已經擠了賣家名、角色編號、價格、最低價/你的掛單標籤跟購買鍵，
 * 三顆星在 390px 會把名字那行推到換行；★3 固定寬度，1 星到 6 星都不會變版。
 *
 * 為什麼一定要 aria-label：
 * 純 ★ 會被讀成裝飾或評分小工具，但這裡是「買到手的星數」，
 * 講錯會讓人花錯錢，所以文字替代一律寫「基礎 N 星」。
 *
 * star 缺值（後端還沒上線）時回傳 null —— 不補預設值 1，
 * 「沒有資料」跟「真的是 1 星」必須長得不一樣。
 */
export function BaseStar({ star, size = 12, tone = "secondary", sx }) {
  const n = Number(star);
  if (!Number.isFinite(n) || n < 1) return null;

  return (
    <Box
      component="span"
      role="img"
      aria-label={`基礎 ${n} 星`}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "1px",
        flexShrink: 0,
        whiteSpace: "nowrap",
        lineHeight: 1,
        fontSize: size,
        fontWeight: 700,
        color: tone === "inherit" ? "inherit" : "secondary.main",
        ...NUMS,
        ...sx,
      }}
    >
      <StarRateRoundedIcon aria-hidden="true" sx={{ fontSize: size + 3 }} />
      {n}
    </Box>
  );
}

/**
 * 詳情頁用的完整版：★N 加上「基礎星數」四個字。
 * 買家決策就發生在這一頁，光一個 ★3 還是可能被讀成「賣家練到 3 星」，
 * 所以這裡把字寫滿，跟下面的升星警語同一個口徑。
 */
export function BaseStarBadge({ star, onGradient = false, sx }) {
  const n = Number(star);
  if (!Number.isFinite(n) || n < 1) return null;

  return (
    <Box
      component="span"
      role="img"
      aria-label={`基礎 ${n} 星，成交後買家取得的星數`}
      sx={theme => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.375,
        px: 0.875,
        py: 0.375,
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...NUMS,
        ...(onGradient
          ? {
              color: "#fff",
              bgcolor: alpha("#fff", 0.22),
              border: `1px solid ${alpha("#fff", 0.3)}`,
            }
          : {
              color: theme.palette.secondary.main,
              bgcolor: alpha(theme.palette.secondary.main, 0.14),
              border: `1px solid ${alpha(theme.palette.secondary.main, 0.34)}`,
            }),
        ...sx,
      })}
    >
      <StarRateRoundedIcon aria-hidden="true" sx={{ fontSize: 14 }} />
      {n}
      <Box component="span" sx={{ fontWeight: 600, opacity: 0.9 }}>
        基礎星數
      </Box>
    </Box>
  );
}

export function CharAvatar({ itemId, name = "", headImage, size = 44, dimmed = false, sx }) {
  return (
    <Avatar
      src={headImage || undefined}
      alt={name}
      sx={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        fontSize: Math.round(size * 0.4),
        fontWeight: 700,
        color: "#fff",
        background: charGradient(itemId),
        boxShadow: "inset 0 0 0 2px rgba(255,255,255,.35)",
        filter: dimmed ? "grayscale(.35)" : "none",
        ...sx,
      }}
    >
      {name.charAt(0)}
    </Avatar>
  );
}

export function StatusChip({ status, size = "small", sx }) {
  const info = LISTING_STATUS[status] || LISTING_STATUS.invalid;
  return (
    <Chip
      size={size}
      label={info.label}
      color={info.color === "default" ? undefined : info.color}
      variant="outlined"
      icon={
        <Box
          component="span"
          sx={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            bgcolor: "currentColor",
            ml: "10px !important",
            mr: "-2px !important",
          }}
        />
      }
      sx={{ fontWeight: 600, height: 25, ...sx }}
    />
  );
}

/** 「我的」「最低價」這類小標。 */ export function Tag({ label, color = "secondary" }) {
  return (
    <Box
      component="span"
      sx={theme => ({
        fontSize: 10,
        fontWeight: 700,
        lineHeight: 1,
        px: 1,
        py: 0.5,
        borderRadius: 999,
        whiteSpace: "nowrap",
        color: theme.palette[color].main,
        bgcolor: alpha(theme.palette[color].main, 0.14),
        border: `1px solid ${alpha(theme.palette[color].main, 0.34)}`,
      })}
    >
      {label}
    </Box>
  );
}

/** 主色漸層面板，三個頁面的 banner 共用同一層底。 */
export function GradientPanel({ children, sx }) {
  return (
    <Paper
      elevation={0}
      sx={theme => ({
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
        p: 2,
        color: "#fff",
        border: "1px solid",
        borderColor: alpha("#fff", 0.14),
        background:
          theme.palette.mode === "dark"
            ? `radial-gradient(120% 140% at 88% -20%, ${alpha(theme.palette.primary.light, 0.22)}, transparent 55%),
               linear-gradient(135deg, #0B3A4C, #0E7A8C 60%, ${theme.palette.primary.main})`
            : `radial-gradient(120% 140% at 88% -20%, rgba(255,255,255,.28), transparent 55%),
               linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main} 55%, ${theme.palette.primary.light})`,
        "&::after": {
          content: '""',
          position: "absolute",
          right: -30,
          bottom: -60,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: "rgba(255,255,255,.10)",
          pointerEvents: "none",
        },
        ...sx,
      })}
    >
      <Box sx={{ position: "relative", zIndex: 1 }}>{children}</Box>
    </Paper>
  );
}

/** 小標題 + 延伸細線。 */
export function SectionTitle({ children, sx }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        mx: 0.25,
        color: "text.secondary",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "1px",
        "&::after": {
          content: '""',
          flex: "1 1 auto",
          height: "1px",
          bgcolor: "divider",
        },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

/** key / value 一行，第二行起自帶上分隔線。 */
export function Row({ label, value, valueColor, strike }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1.25,
        py: 1.125,
        fontSize: 13.5,
        "&:not(:first-of-type)": { borderTop: "1px solid", borderColor: "divider" },
      }}
    >
      <Typography component="span" variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography
        component="span"
        variant="body2"
        sx={{
          fontWeight: 600,
          color: valueColor || "text.primary",
          textDecoration: strike ? "line-through" : "none",
          opacity: strike ? 0.6 : 1,
          textAlign: "right",
          ...NUMS,
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
