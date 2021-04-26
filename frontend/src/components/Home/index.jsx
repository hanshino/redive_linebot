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
      <Grid item xs={12}>
        <iframe
          width="100%"
          src="https://discord.com/widget?id=669080231079968770&theme=dark"
          height="500"
          allowtransparency="true"
          frameBorder="0"
          sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
        ></iframe>
      </Grid>
    </Grid>
  );
};

export default Home;
