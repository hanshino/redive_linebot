import React from "react";
import MuiBackdrop from "@material-ui/core/Backdrop";
import { makeStyles } from "@material-ui/core/styles";

const useStyles = makeStyles(theme => ({
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
}));

const Backdrop = props => {
  const classes = useStyles();
  return <MuiBackdrop {...props} className={classes.backdrop} />;
};

export const DotsLoading = () => {
  return (
    <Backdrop open={true}>
      <div className="dots-loader" />
    </Backdrop>
  );
};

export const ThrobberLoading = () => {
  return (
    <Backdrop open={true}>
      <div className="throbber-loader" />
    </Backdrop>
  );
};

export const HeartbeatLoading = () => {
  return (
    <Backdrop open={true}>
      <div className="heartbeat-loader" />
    </Backdrop>
  );
};

export const GaugeLoading = () => {
  return (
    <Backdrop open={true}>
      <div className="gauge-loader" />
    </Backdrop>
  );
};

export const WobblebarLoading = () => {
  return (
    <Backdrop open={true}>
      <div className="wobblebar-loader" />
    </Backdrop>
  );
};

export const WhirlyLoading = () => {
  return (
    <Backdrop open={true}>
      <div className="whirly-loader" />
    </Backdrop>
  );
};
