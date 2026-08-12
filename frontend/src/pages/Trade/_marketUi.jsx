import {
  Avatar,
  Box,
  Chip,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import ShoppingBasketRoundedIcon from "@mui/icons-material/ShoppingBasketRounded";
import { LISTING_STATUS, NUMS, ORDER_COPY, charGradient, normalizeOrderType } from "./_market";

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

/**
 * 賣單 / 收購單的方向標。
 *
 * 這個 chip 是整個第二階段最不能誤讀的一格：同一張列表會同時出現
 * 「我要賣掉的角色」跟「我想買進的角色」，兩者的金流方向完全相反。
 * 所以顏色分開（賣＝主色、購＝次色）、圖示分開，字也直接寫「賣出／求購」，
 * 不用「買/賣」單字，避免在小字級被看成同一個字。
 */
export function OrderTypeChip({ orderType, size = "small", sx }) {
  const type = normalizeOrderType(orderType);
  const buy = type === "buy";
  const Icon = buy ? ShoppingBasketRoundedIcon : SellRoundedIcon;

  return (
    <Chip
      size={size}
      label={ORDER_COPY[type].chip}
      color={buy ? "secondary" : "primary"}
      variant="outlined"
      icon={<Icon aria-hidden="true" sx={{ fontSize: "14px !important" }} />}
      aria-label={buy ? "收購單，你把角色賣出去" : "賣單，你把角色賣給買家"}
      sx={{ fontWeight: 700, height: 25, ...sx }}
    />
  );
}

/**
 * 出售中 / 收購中的切換。Market 用它換整本掛單簿，
 * 所以做成兩顆等寬的按鈕，不縮成 icon —— 按錯方向的代價是看錯價格。
 */
export function OrderTypeSwitch({ value, onChange, disabled }) {
  const type = normalizeOrderType(value);

  return (
    <ToggleButtonGroup
      value={type}
      exclusive
      size="small"
      fullWidth
      disabled={disabled}
      onChange={(_, v) => v !== null && onChange(v)}
      aria-label="切換掛單簿方向"
      sx={{
        "& .MuiToggleButton-root": {
          py: 0.75,
          fontSize: 13,
          fontWeight: 700,
          textTransform: "none",
          gap: 0.75,
          borderRadius: "999px !important",
        },
      }}
    >
      <ToggleButton value="sell" aria-label="看別人賣出的角色，你可以買">
        <SellRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
        {ORDER_COPY.sell.book}
      </ToggleButton>
      <ToggleButton value="buy" aria-label="看別人收購的角色，你可以賣">
        <ShoppingBasketRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
        {ORDER_COPY.buy.book}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

/**
 * 主色漸層面板，三個頁面的 banner 共用同一層底。
 *
 * tone="buy" 換成琥珀色那一套：收購單的錢是從你自己口袋先扣出去的，
 * 跟賣單的青色分開，掃一眼就知道現在站在哪一邊，不用讀完標題。
 */
export function GradientPanel({ children, tone = "sell", sx }) {
  const buy = tone === "buy";
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
        background: buy
          ? theme.palette.mode === "dark"
            ? `radial-gradient(120% 140% at 88% -20%, ${alpha(theme.palette.secondary.light, 0.24)}, transparent 55%),
               linear-gradient(135deg, #4A2C05, #A9670A 58%, ${theme.palette.secondary.main})`
            : `radial-gradient(120% 140% at 88% -20%, rgba(255,255,255,.3), transparent 55%),
               linear-gradient(135deg, ${theme.palette.secondary.dark}, ${theme.palette.secondary.main} 55%, ${theme.palette.secondary.light})`
          : theme.palette.mode === "dark"
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
