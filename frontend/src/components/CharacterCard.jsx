import {
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  CardMedia,
  Button,
  Typography,
  Rating,
  Box,
} from "@mui/material";
import { Link } from "react-router-dom";

/**
 * Reusable character card component.
 *
 * ScratchCard variant  -- pass `to` for a router Link button.
 * GodStoneShop variant -- pass `onClick`, `holding`, `isEnable`, and `star`.
 */
export default function CharacterCard({
  name,
  image,
  price,
  // ScratchCard props
  to,
  // GodStoneShop props
  onClick,
  holding,
  isEnable,
  star,
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

  return (
    <Card>
      <CardActionArea>
        <CardMedia sx={{ height: 200 }} image={image} />
        <CardContent>
          <Typography gutterBottom variant="h5" component="h2">
            {name}
          </Typography>
          {star != null && (
            <Box component="fieldset" mb={1} sx={{ border: "none", p: 0 }}>
              <Rating value={star} readOnly />
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" component="p">
            女神石：{price}
          </Typography>
        </CardContent>
      </CardActionArea>
      <CardActions>
        {to ? (
          <Button size="small" color="primary" component={Link} to={to}>
            {buttonText}
          </Button>
        ) : (
          <Button
            size="small"
            color="primary"
            onClick={onClick}
            disabled={buttonDisabled}
          >
            {buttonText}
          </Button>
        )}
      </CardActions>
    </Card>
  );
}
