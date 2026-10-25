import { Box } from "@mui/material";
import StarRateRoundedIcon from "@mui/icons-material/StarRateRounded";

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
export default function BaseStar({ star, size = 12, tone = "secondary", sx }) {
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
        fontVariantNumeric: "tabular-nums",
        ...sx,
      }}
    >
      <StarRateRoundedIcon aria-hidden="true" sx={{ fontSize: size + 3 }} />
      {n}
    </Box>
  );
}
