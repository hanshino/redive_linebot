import React, { useEffect } from "react";
import Grid from "@material-ui/core/Grid";
import makeStyles from "@material-ui/core/styles/makeStyles";
import ChatLevelChart from "./ChatLevelChart";
import GachaRankChart from "./GachaRankChart";
import GodStoneChart from "./GodStoneChart";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

const Rankings = () => {
  const classes = useStyles();

  useEffect(() => {
    window.document.title = "各大排行榜";
  }, []);

  return (
    <Grid container className={classes.root}>
      <ChatLevelChart />
      <GachaRankChart />
      <GodStoneChart />
    </Grid>
  );
};

export default Rankings;
