import React, { useEffect } from "react";
import Grid from "@material-ui/core/Grid";
import makeStyles from "@material-ui/core/styles/makeStyles";
import Statistics from "./Statistics";
import Features from "./Features";
import Announcement from "./Announcement";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

const Home = () => {
  const classes = useStyles();

  useEffect(() => {
    window.document.title = "布丁機器人";
  }, []);

  return (
    <Grid container className={classes.root}>
      <Announcement />
      <Statistics />
      <Features />
    </Grid>
  );
};

export default Home;
