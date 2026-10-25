import { Box, Button, Chip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";

/**
 * 管理頁共用頁首（漸層 hero）。
 *
 * tone 決定色系：primary（宮子青，預設）或 secondary（布丁焦糖，用來區隔「贊助」）。
 * 文字與疊在上面的 chip／按鈕一律用該色系的 contrastText，
 * 深色模式下 primary 底是亮青，contrastText 會自動換成深色，不會變成白字貼亮底。
 */
export default function PageHero({ icon, title, subtitle, tone = "primary", children }) {
  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 3,
        p: { xs: 2.5, sm: 3.5 },
        color: t => t.palette[tone].contrastText,
        background: t =>
          `linear-gradient(135deg, ${t.palette[tone].dark} 0%, ${t.palette[tone].main} 100%)`,
        display: "flex",
        alignItems: "center",
        gap: 2,
        flexWrap: "wrap",
      }}
    >
      {icon && (
        <Box sx={{ display: "flex", flexShrink: 0, "& svg": { fontSize: 44, opacity: 0.85 } }}>
          {icon}
        </Box>
      )}
      <Box sx={{ flex: 1, minWidth: 160 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {children}
    </Box>
  );
}

/** 疊在 hero 上的小標籤（統計數字）。 */
export function HeroChip({ tone = "primary", ...props }) {
  return (
    <Chip
      size="small"
      {...props}
      sx={{
        bgcolor: t => alpha(t.palette[tone].contrastText, 0.2),
        color: t => t.palette[tone].contrastText,
        ...props.sx,
      }}
    />
  );
}

/** 疊在 hero 上的動作按鈕（半透明底，至少 44px 高）。 */
export function HeroButton({ tone = "primary", sx, ...props }) {
  return (
    <Button
      variant="contained"
      {...props}
      sx={{
        minHeight: 44,
        flexShrink: 0,
        bgcolor: t => alpha(t.palette[tone].contrastText, 0.2),
        color: t => t.palette[tone].contrastText,
        boxShadow: "none",
        "&:hover": {
          bgcolor: t => alpha(t.palette[tone].contrastText, 0.3),
          boxShadow: "none",
        },
        ...sx,
      }}
    />
  );
}
