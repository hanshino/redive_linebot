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
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import AutoAwesomeMosaicRoundedIcon from "@mui/icons-material/AutoAwesomeMosaicRounded";
import {
  KIND_COPY,
  LISTING_STATUS,
  NUMS,
  ORDER_COPY,
  charGradient,
  normalizeItemKind,
  normalizeOrderType,
} from "./_market";

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
 * kind="fragment" 時整句話換掉：碎片本身沒有星級，這個數字是「那隻角色的原生
 * 星數」，跟這疊碎片能換到什麼無關 —— 兌換出來的角色固定 1★。用同一個讀法會讓人
 * 以為湊滿 150 片就能拿到一隻 3★，那是這個系統最貴的誤解。
 *
 * star 缺值（後端還沒上線）時回傳 null —— 不補預設值 1，
 * 「沒有資料」跟「真的是 1 星」必須長得不一樣。
 */
export function BaseStar({ star, size = 12, tone = "secondary", kind = "character", sx }) {
  const n = Number(star);
  if (!Number.isFinite(n) || n < 1) return null;
  const fragment = normalizeItemKind(kind) === "fragment";

  return (
    <Box
      component="span"
      role="img"
      aria-label={fragment ? `角色原生 ${n} 星` : `基礎 ${n} 星`}
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
 * 詳情頁用的完整版：★N 加上說明字。
 * 買家決策就發生在這一頁，光一個 ★3 還是可能被讀成「賣家練到 3 星」，
 * 所以這裡把字寫滿，跟下面的升星警語同一個口徑。
 *
 * 碎片的字換成「角色原生」，而且**不能**寫成「你會取得」——
 * 碎片兌換出來的角色一律 1★，跟這個數字沒有關係。
 */
export function BaseStarBadge({ star, onGradient = false, kind = "character", sx }) {
  const n = Number(star);
  if (!Number.isFinite(n) || n < 1) return null;
  const fragment = normalizeItemKind(kind) === "fragment";

  return (
    <Box
      component="span"
      role="img"
      aria-label={
        fragment
          ? `這隻角色的原生 ${n} 星，與碎片兌換取得的星數無關`
          : `基礎 ${n} 星，成交後買家取得的星數`
      }
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
        {fragment ? "角色原生星數" : "基礎星數"}
      </Box>
    </Box>
  );
}

/**
 * 角色頭像。
 *
 * kind="fragment" 時右下角壓一枚馬賽克小徽章，並把頭像切成內縮的圓角方框：
 * 碎片列與角色列會出現在同一個畫面（我的掛單、成交紀錄），光看名字下面那行小字
 * 分辨太慢，形狀不同才掃得出來。徽章是 aria-hidden，語意交給旁邊的文字標。
 */
export function CharAvatar({
  itemId,
  name = "",
  headImage,
  size = 44,
  dimmed = false,
  kind = "character",
  sx,
}) {
  const fragment = normalizeItemKind(kind) === "fragment";

  const avatar = (
    <Avatar
      src={headImage || undefined}
      alt={name}
      variant={fragment ? "rounded" : "circular"}
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
        ...(fragment ? { borderRadius: `${Math.max(6, Math.round(size * 0.22))}px` } : {}),
        ...(fragment ? {} : sx),
      }}
    >
      {name.charAt(0)}
    </Avatar>
  );

  if (!fragment) return avatar;

  return (
    <Box
      sx={{
        position: "relative",
        flex: `0 0 ${size}px`,
        width: size,
        height: size,
        ...sx,
      }}
    >
      {avatar}
      <Box
        aria-hidden="true"
        sx={theme => ({
          position: "absolute",
          right: -2,
          bottom: -2,
          width: Math.max(14, Math.round(size * 0.38)),
          height: Math.max(14, Math.round(size * 0.38)),
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          color: "#fff",
          bgcolor: theme.palette.secondary.main,
          border: `2px solid ${theme.palette.background.paper}`,
          filter: dimmed ? "grayscale(.35)" : "none",
        })}
      >
        <AutoAwesomeMosaicRoundedIcon sx={{ fontSize: Math.max(9, Math.round(size * 0.22)) }} />
      </Box>
    </Box>
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
 * 角色 / 碎片的標的標。
 *
 * 碎片列和角色列會混在同一份清單（我的掛單、成交紀錄），而兩者的規則差很多
 * （碎片可累積、已持有也能買、賣單不鎖庫存），所以每一列都要能一眼看出是哪種。
 * 碎片用次色 + 馬賽克圖示，跟角色的人形圖示分開。
 */
export function ItemKindChip({ itemKind, size = "small", sx }) {
  const kind = normalizeItemKind(itemKind);
  const fragment = kind === "fragment";
  const Icon = fragment ? AutoAwesomeMosaicRoundedIcon : PersonRoundedIcon;

  return (
    <Chip
      size={size}
      label={KIND_COPY[kind].chip}
      color={fragment ? "secondary" : "default"}
      variant={fragment ? "filled" : "outlined"}
      icon={<Icon aria-hidden="true" sx={{ fontSize: "14px !important" }} />}
      aria-label={fragment ? "角色專屬碎片，可累積、可回收、可兌換" : "角色本體，一人一隻"}
      sx={{ fontWeight: 700, height: 25, ...sx }}
    />
  );
}

/**
 * 角色 / 碎片的簿子切換。
 *
 * 跟方向切換分兩排而不是併成四顆：這兩個維度是獨立的（角色賣單、碎片收購單…
 * 四種組合都存在），擠成一排會讓人以為只能選一個。
 */
export function ItemKindSwitch({ value, onChange, disabled }) {
  const kind = normalizeItemKind(value);

  return (
    <ToggleButtonGroup
      value={kind}
      exclusive
      size="small"
      fullWidth
      disabled={disabled}
      onChange={(_, v) => v !== null && onChange(v)}
      aria-label="切換委託標的種類"
      sx={{
        "& .MuiToggleButton-root": {
          py: 0.625,
          fontSize: 12.5,
          fontWeight: 700,
          textTransform: "none",
          gap: 0.625,
          borderRadius: "999px !important",
        },
      }}
    >
      <ToggleButton value="character" aria-label="看角色本體的委託">
        <PersonRoundedIcon aria-hidden="true" sx={{ fontSize: 15 }} />
        角色本體
      </ToggleButton>
      <ToggleButton value="fragment" aria-label="看角色碎片的委託，碎片可以累積">
        <AutoAwesomeMosaicRoundedIcon aria-hidden="true" sx={{ fontSize: 15 }} />
        角色碎片
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

/**
 * 片數標記，例如「20 片」。
 *
 * 為什麼片數要獨立一格、而且比單價更粗：
 * 碎片單的價格欄寫的是**每片**單價，光看「50 女神石」會被當成整筆的價錢。
 * 片數必須跟單價在視覺上綁在一起，人才會自己去乘。
 */
export function QuantityBadge({ quantity, unit = "片", sx }) {
  const n = Number(quantity);
  if (!Number.isFinite(n) || n < 1) return null;

  return (
    <Box
      component="span"
      aria-label={`共 ${n} ${unit}`}
      sx={theme => ({
        display: "inline-flex",
        alignItems: "baseline",
        gap: "2px",
        px: 0.875,
        py: 0.375,
        borderRadius: 1.5,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: theme.palette.mode === "dark" ? "secondary.light" : "secondary.dark",
        bgcolor: alpha(theme.palette.secondary.main, 0.14),
        border: `1px solid ${alpha(theme.palette.secondary.main, 0.3)}`,
        ...NUMS,
        ...sx,
      })}
    >
      {n.toLocaleString("en-US")}
      <Box component="span" sx={{ fontSize: 10.5, fontWeight: 600, opacity: 0.85 }}>
        {unit}
      </Box>
    </Box>
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
