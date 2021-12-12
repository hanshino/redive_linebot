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
