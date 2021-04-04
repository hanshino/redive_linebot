import React, { useEffect } from "react";
import Grid from "@material-ui/core/Grid";
import { makeStyles } from "@material-ui/core/styles";
import SignMessage from "./SignMessage";
import NotifyConfig from "./NotifyConfig";
import AlertLogin from "../AlertLogin";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
}));

const ConfigPage = () => {
  const classes = useStyles();
  const { liff } = window;

  useEffect(() => {
    window.document.title = "戰隊系統設定";
  }, []);

  if (!liff.isLoggedIn()) return <AlertLogin />;

  return (
    <Grid container className={classes.root}>
      <SignMessage />
      <NotifyConfig />
    </Grid>
  );
};

export default ConfigPage;
