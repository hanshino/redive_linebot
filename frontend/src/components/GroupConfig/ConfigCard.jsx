import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import Card from "@material-ui/core/Card";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import Typography from "@material-ui/core/Typography";
import Switch from "@material-ui/core/Switch";
import PropTypes from "prop-types";

const useStyles = makeStyles(() => ({
  card: {
    minWeight: 275,
    display: "grid",
    height: "100%",
  },
  footer: {
    marginTop: "auto",
    marginLeft: "auto",
  },
}));

export default function ConfigCard(props) {
  const classes = useStyles();
  const [status, setStatus] = React.useState(props.status === "Y");
  const { name, handle, isLoggedIn } = props;

  const handleChange = () => {
    handle(name, !status);
    setStatus(!status);
  };

  return (
    <Card className={classes.card}>
      <CardContent>
        <Typography variant="h5" component="h2">
          {props.title}
        </Typography>
        <Typography variant="body2" component="p">
          {props.description}
        </Typography>
      </CardContent>
      <CardActions className={classes.footer}>
        <Switch
          checked={status}
          onChange={isLoggedIn ? handleChange : function () {}}
          color="primary"
          name="checkedB"
          inputProps={{ "aria-label": "primary checkbox" }}
          disabled={!isLoggedIn}
        />
      </CardActions>
    </Card>
  );
}

ConfigCard.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  status: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  handle: PropTypes.func,
  isLoggedIn: PropTypes.bool.isRequired,
};
