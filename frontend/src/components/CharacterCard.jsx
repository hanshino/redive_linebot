import {
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  CardMedia,
  Button,
  Typography,
  Box,
} from "@mui/material";
import DiamondIcon from "@mui/icons-material/Diamond";
import { Link } from "react-router-dom";
import BaseStar from "./BaseStar";

/**
 * Reusable character card component.
 *
 * GodStoneShop variant -- pass `onClick`, `holding`, `isEnable`, and `star`.
 * `highlighted` 只加一圈外框（深連結指到這張卡時用），不影響其他呈現。
 */
export default function CharacterCard({
  name,
  image,
  price,
  to,
  onClick,
  holding,
  isEnable,
  star,
  highlighted = false,
}) {
  const isShopVariant = typeof onClick === "function";

  let buttonText = "購買";
  let buttonDisabled = false;

  if (isShopVariant) {
    buttonText = "兌換";
    if (holding) {
      buttonText = "已兌換";
      buttonDisabled = true;
    } else if (isEnable !== 1) {
      buttonText = "未開放";
      buttonDisabled = true;
    }
  }

  // 按鈕才是鍵盤與讀屏的操作點；卡面保留給滑鼠／觸控點擊，所以不重複進 tab 順序。
  const areaProps = to
    ? { component: Link, to, tabIndex: -1 }
    : { onClick, disabled: buttonDisabled, tabIndex: -1 };

  const priceNumber = Number(price);
  const priceText = Number.isFinite(priceNumber) ? priceNumber.toLocaleString() : (price ?? "-");

  return (
    <Card
      sx={
        highlighted
          ? theme => ({ outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 })
          : undefined
      }
    >
      <CardActionArea {...areaProps}>
        {/* 商品圖都是 16:9，固定高度會在寬卡片上把圖裁成橫條 */}
        <CardMedia
          component="img"
          image={image}
          alt={name}
          loading="lazy"
          sx={{ aspectRatio: "16 / 9", objectFit: "cover" }}
        />
        <CardContent>
          <Typography gutterBottom variant="h5" component="h2">
            {name}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            {/* 跟市場同一種呈現：★N 是基礎星數，不是評分 */}
            <BaseStar star={star} size={14} />
            <Box
              sx={{
                display: "inline-flex",
                alignItems: "center",
                gap: 0.5,
                color: "currency.main",
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <DiamondIcon aria-hidden="true" sx={{ fontSize: 16 }} />
              <Typography variant="body2" component="span" sx={{ fontWeight: "inherit" }}>
                {priceText}
                <Box component="span" sx={{ ml: 0.5, fontWeight: 500 }}>
                  女神石
                </Box>
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </CardActionArea>
      <CardActions>
        {to ? (
          <Button color="primary" component={Link} to={to} sx={{ minHeight: 44 }}>
            {buttonText}
          </Button>
        ) : (
          <Button
            color="primary"
            onClick={onClick}
            disabled={buttonDisabled}
            aria-label={name ? `${buttonText} ${name}` : undefined}
            sx={{ minHeight: 44 }}
          >
            {buttonText}
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
