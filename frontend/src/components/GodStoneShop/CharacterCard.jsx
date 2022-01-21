import React from "react";
import Card from "@material-ui/core/Card";
import CardActionArea from "@material-ui/core/CardActionArea";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import CardMedia from "@material-ui/core/CardMedia";
import Button from "@material-ui/core/Button";
import Typography from "@material-ui/core/Typography";
import Rating from "@material-ui/lab/Rating";
import Box from "@material-ui/core/Box";
import PropTypes from "prop-types";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles({
  root: {
    // maxWidth: 345,
  },
  media: {
    height: 200,
  },
});

const CharacterCard = ({ name, itemImage, star, price, onClick, holding, isEnable }) => {
  const classes = useStyles();

  let buttonText = "兌換";

  if (holding) {
    buttonText = "已兌換";
  } else if (!isEnable) {
    buttonText = "未開放";
  }

  return (
    <Card className={classes.root}>
      <CardActionArea>
        <CardMedia className={classes.media} image={itemImage} title="Contemplative Reptile" />
        <CardContent>
          <Typography gutterBottom variant="h5" component="h2">
            {name}
          </Typography>
          <Box component="fieldset" mb={1} borderColor="transparent">
            <Rating name="read-only" value={star} readOnly />
          </Box>
          <Typography variant="body2" color="textSecondary" component="p">
            女神石：{price}
          </Typography>
        </CardContent>
      </CardActionArea>
      <CardActions>
        <Button size="small" color="primary" onClick={onClick} disabled={holding || isEnable !== 1}>
          {buttonText}
        </Button>
      </CardActions>
    </Card>
  );
};

CharacterCard.propTypes = {
  name: PropTypes.string.isRequired,
  itemImage: PropTypes.string.isRequired,
  star: PropTypes.number.isRequired,
  price: PropTypes.number.isRequired,
  onClick: PropTypes.func.isRequired,
  holding: PropTypes.bool.isRequired,
  isEnable: PropTypes.number.isRequired,
};

export default CharacterCard;
