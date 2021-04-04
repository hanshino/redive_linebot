import React from "react";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";

const useStyles = makeStyles(theme => ({
  block: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

const NotifyConfig = () => {
  const classes = useStyles();
  return (
    <Grid container item component={Paper} className={classes.block}>
      <Grid container item direction="column">
        <Typography variant="h5">通知設定</Typography>
        <Typography variant="overline" color="textSecondary">可邀請通知機器人，進入群組，讓戰報更為即時，建設中..敬請期待！</Typography>
      </Grid>
    </Grid>
  );
};

export default NotifyConfig;
