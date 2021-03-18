import React from "react";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import makeStyles from "@material-ui/core/styles/makeStyles";
import { useHistory } from "react-router-dom";

const useStyles = makeStyles(theme => ({
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
}));

const { liff } = window;

const Binding = () => {
  const isLoggedIn = liff.isLoggedIn();
  return isLoggedIn ? <RedirectToBinding /> : <LoginAlert />;
};

const RedirectToBinding = () => {
  const classes = useStyles();
  const { userId } = liff.getContext();
  const { URLSearchParams, location } = window;
  let params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", "CQZhxtEo0NeSgGRQ2LNeEp");
  params.set("redirect_uri", `${window.location.origin}/api/Bot/Notify/Callback`);
  params.set("scope", "notify");
  params.set("state", userId);

  location.href = "https://notify-bot.line.me/oauth/authorize?" + params.toString();

  return (
    <Backdrop className={classes.backdrop} open={true}>
      <CircularProgress color="inherit" />
    </Backdrop>
  );
};

/**
 * 登入跳轉提示
 */
const LoginAlert = () => {
  let history = useHistory();

  function goBack() {
    history.push("/Bot/Notify");
  }

  return (
    <Dialog open={true}>
      <DialogTitle>{"Oops!請問您哪位?"}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          為了知道您是誰，必須先進行 Line 的登入，通知訊息才能跟著您的 Line!
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button color="secondary" variant="outlined" onClick={goBack}>
          取消
        </Button>
        <Button color="primary" variant="outlined" onClick={doLogin}>
          登入
        </Button>
      </DialogActions>
    </Dialog>
  );
};

function doLogin() {
  window.localStorage.setItem("reactRedirectUri", "/Bot/Notify");
  window.liff.login();
}

export default Binding;
