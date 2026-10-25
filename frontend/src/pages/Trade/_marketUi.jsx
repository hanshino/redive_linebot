import {
  Alert,
  AlertTitle,
  Avatar,
  Box,
  Button,
  Chip,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { alpha, darken } from "@mui/material/styles";
import DiamondIcon from "@mui/icons-material/Diamond";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";
import SellRoundedIcon from "@mui/icons-material/SellRounded";
import ShoppingBasketRoundedIcon from "@mui/icons-material/ShoppingBasketRounded";
import {
  BODY_SMALL,
  LISTING_STATUS,
  META_TEXT,
  NUMS,
  ORDER_COPY,
  TOUCH,
  charGradient,
  fmtStone,
  normalizeOrderType,
} from "./_market";

/* ---------------------------------------------------------------- 版面零件 */

// BaseStar 搬到 components/，背包 / 轉蛋兌換的角色卡也會用；這裡轉出口，交易頁的 import 不用改。
export { default as BaseStar } from "../../components/BaseStar";

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
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: "nowrap",
        ...NUMS,
        ...(onGradient
          ? {
              color: theme.palette.common.white,
              bgcolor: alpha(theme.palette.common.white, 0.22),
              border: `1px solid ${alpha(theme.palette.common.white, 0.3)}`,
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
        color: "common.white",
        background: charGradient(itemId),
        boxShadow: theme => `inset 0 0 0 2px ${alpha(theme.palette.common.white, 0.35)}`,
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

/** 「我的」「最低價」這類小標。 */
export function Tag({ label, color = "secondary" }) {
  return (
    <Box
      component="span"
      sx={theme => ({
        fontSize: 12,
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
          minHeight: TOUCH,
          py: 0.75,
          fontSize: 14,
          fontWeight: 700,
          textTransform: "none",
          gap: 0.75,
          color: "text.secondary",
          borderRadius: "999px !important",
        },
        // 選中的那一邊用方向色（賣單青、收購琥珀）加粗框，不只靠底色深淺區分
        "& .MuiToggleButton-root.Mui-selected": {
          borderColor: "currentColor",
        },
      }}
    >
      <ToggleButton
        value="sell"
        aria-label="看別人賣出的角色，你可以買"
        sx={theme => ({
          "&.Mui-selected, &.Mui-selected:hover": {
            color: "primary.main",
            bgcolor: alpha(theme.palette.primary.main, 0.14),
          },
        })}
      >
        <SellRoundedIcon aria-hidden="true" sx={{ fontSize: 16 }} />
        {ORDER_COPY.sell.book}
      </ToggleButton>
      <ToggleButton
        value="buy"
        aria-label="看別人收購的角色，你可以賣"
        sx={theme => ({
          "&.Mui-selected, &.Mui-selected:hover": {
            color: "secondary.main",
            bgcolor: alpha(theme.palette.secondary.main, 0.14),
          },
        })}
      >
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
        color: theme.palette.common.white,
        border: "1px solid",
        borderColor: alpha(theme.palette.common.white, 0.14),
        background: buy
          ? theme.palette.mode === "dark"
            ? `radial-gradient(120% 140% at 88% -20%, ${alpha(theme.palette.secondary.light, 0.24)}, transparent 55%),
               linear-gradient(135deg, ${darken(theme.palette.secondary.dark, 0.78)}, ${darken(theme.palette.secondary.dark, 0.3)} 58%, ${theme.palette.secondary.dark})`
            : `radial-gradient(120% 140% at 88% -20%, ${alpha(theme.palette.common.white, 0.3)}, transparent 55%),
               linear-gradient(135deg, ${theme.palette.secondary.dark}, ${theme.palette.secondary.main} 55%, ${theme.palette.secondary.light})`
          : theme.palette.mode === "dark"
            ? `radial-gradient(120% 140% at 88% -20%, ${alpha(theme.palette.primary.light, 0.22)}, transparent 55%),
               linear-gradient(135deg, ${darken(theme.palette.primary.dark, 0.7)}, ${darken(theme.palette.primary.dark, 0.3)} 60%, ${theme.palette.primary.dark})`
            : `radial-gradient(120% 140% at 88% -20%, ${alpha(theme.palette.common.white, 0.28)}, transparent 55%),
               linear-gradient(135deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main} 55%, ${theme.palette.primary.light})`,
        "&::after": {
          content: '""',
          position: "absolute",
          right: -30,
          bottom: -60,
          width: 160,
          height: 160,
          borderRadius: "50%",
          background: alpha(theme.palette.common.white, 0.1),
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
        fontSize: 14,
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

/**
 * 一個提示區塊：標題 + 一小段說明。
 * 詳情頁原本到處手寫「AlertTitle 13 / Typography 12.8」這一組，集中在這裡，
 * 字級才會一致，也方便把多個提示併成一個。
 */
export function InfoBlock({ severity = "info", title, role, icon, children, sx }) {
  return (
    <Alert severity={severity} role={role} icon={icon} sx={{ borderRadius: 3, ...sx }}>
      {title && <AlertTitle sx={{ fontSize: 14, fontWeight: 700, mb: "2px" }}>{title}</AlertTitle>}
      {children && (
        <Typography component="div" sx={BODY_SMALL}>
          {children}
        </Typography>
      )}
    </Alert>
  );
}

/** 女神石的單一符號：一律用 DiamondIcon + 貨幣色，整個市場只有這一種寫法。 */
export function StoneIcon({ size = 14, sx }) {
  return (
    <DiamondIcon
      aria-hidden="true"
      sx={{ fontSize: size, color: "currency.main", flexShrink: 0, ...sx }}
    />
  );
}

/**
 * 掛單頁的市場參考價。賣單頁看「最低售價」是定價的錨點，
 * 收購單頁看「最高收購價」，所以兩者都列，只是順序隨頁面調整。
 * 沒資料（沒人掛）跟讀取失敗是兩件事，文案與重試分開處理。
 */
export function MarketAnchor({ anchors, itemId, order = ["ask", "bid"] }) {
  if (itemId == null) return null;

  const box = {
    mt: 1.25,
    px: 1.5,
    py: 1,
    borderRadius: 3,
    border: "1px solid",
    borderColor: "divider",
    bgcolor: "surface.subtle",
  };

  if (anchors.failed) {
    return (
      <Box sx={{ ...box, display: "flex", alignItems: "center", gap: 1 }} role="status">
        <Typography sx={{ ...META_TEXT, flex: "1 1 auto" }}>暫時讀不到市場價格</Typography>
        <Button size="small" onClick={anchors.reload} sx={{ minHeight: TOUCH, flexShrink: 0 }}>
          重試
        </Button>
      </Box>
    );
  }

  if (anchors.loading) {
    return (
      <Box sx={box} role="status">
        <Typography sx={META_TEXT}>讀取市場價格中…</Typography>
      </Box>
    );
  }

  const { ask, bid } = anchors.anchorFor(itemId);
  const lines = {
    ask: { label: ORDER_COPY.sell.bestPrice, data: ask, none: "目前沒有人在賣", unit: "張賣單" },
    bid: { label: ORDER_COPY.buy.bestPrice, data: bid, none: "目前沒有人收購", unit: "張收購單" },
  };

  return (
    <Box sx={box} role="status" aria-label="這隻角色目前的市場價格">
      {order.map(key => {
        const { label, data, none, unit } = lines[key];
        return (
          <Box key={key} sx={{ display: "flex", alignItems: "baseline", gap: 1, py: 0.25 }}>
            <Typography component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
              {label}
            </Typography>
            <Box sx={{ flex: "1 1 auto" }} />
            {data ? (
              <>
                <Typography
                  component="span"
                  sx={{
                    fontSize: 14,
                    fontWeight: 700,
                    // 方向色固定：賣單側青色、收購側琥珀，不隨頁面改變。
                    color: key === "bid" ? "secondary.main" : "primary.main",
                    ...NUMS,
                  }}
                >
                  {fmtStone(data.price)}
                </Typography>
                <Typography component="span" sx={META_TEXT}>
                  {data.count} {unit}
                </Typography>
              </>
            ) : (
              <Typography component="span" sx={META_TEXT}>
                {none}
              </Typography>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
