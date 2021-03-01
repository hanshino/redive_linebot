import React, { useEffect, useState } from "react";
import { Grid, IconButton, Typography } from "@material-ui/core";
import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardHeader from "@material-ui/core/CardHeader";
import CardContent from "@material-ui/core/CardContent";
import CardActions from "@material-ui/core/CardActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogActions from "@material-ui/core/DialogActions";
import DialogTitle from "@material-ui/core/DialogTitle";
import Dialog from "@material-ui/core/Dialog";
import Backdrop from "@material-ui/core/Backdrop";
import CircularProgress from "@material-ui/core/CircularProgress";
import makeStyles from "@material-ui/core/styles/makeStyles";
import SettingsIcon from "@material-ui/icons/Settings";
import CloseIcon from "@material-ui/icons/Close";
import Switch from "@material-ui/core/Switch";
import PropTypes from "prop-types";
import { Alert, AlertTitle } from "@material-ui/lab";
import NotifyAPI from "../../api/Notify";
import { Link } from "react-router-dom";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    "& > *": {
      padding: theme.spacing(1),
    },
  },
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: "#fff",
  },
  closeButton: {
    position: "absolute",
    right: theme.spacing(1),
    top: theme.spacing(1),
    color: theme.palette.grey[500],
  },
}));

const useOption = () => {
  const [loading, setLoading] = useState(false);
  const [isBinding, setBinding] = useState(false);
  const [reload, setReload] = useState(0);
  const [option, setOption] = useState({});
  const [open, setOpen] = useState(false);
  const isLoggedIn = window.liff.isLoggedIn();

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSwitch = (key, status) => {
    setLoading(true);
    NotifyAPI.setStatus(key, status).then(() => setReload(old => old + 1));
  };

  const forceReload = () => setReload(old => old + 1);

  const fetchData = () => {
    return NotifyAPI.getNotifyData()
      .then(res => {
        setOption(res);
        setBinding(true);
      })
      .catch(() => {
        setBinding(false);
      });
  };

  useEffect(() => {
    setLoading(true);
    if (isLoggedIn) {
      fetchData().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [reload]);

  return {
    loading,
    isLoggedIn,
    isBinding,
    option,
    open,
    handleOpen,
    handleClose,
    handleSwitch,
    forceReload,
  };
};

const Notify = () => {
  const classes = useStyles();
  const option = useOption();
  const { loading, isBinding, option: optionData, isLoggedIn } = option;

  useEffect(() => {
    window.document.title = "訂閱通知設定頁面";
  }, []);

  return (
    <React.Fragment>
      <Grid container direction="column" className={classes.root}>
        <Grid container item>
          <Grid item>
            <Description />
          </Grid>
          <Grid item>
            <IconButton color="secondary" onClick={option.handleOpen}>
              <SettingsIcon />
            </IconButton>
          </Grid>
        </Grid>
        <Grid item>
          {isBinding ? (
            <Alert severity="success">綁定中！需更改設定請點擊標題右邊齒輪！</Alert>
          ) : (
            <Alert severity="warning">
              <AlertTitle>注意！</AlertTitle>
              {isLoggedIn
                ? "尚未綁定LINE Notify！點擊標題右邊齒輪進行設定吧！"
                : "尚未登入！請先點擊右上角的登入鈕"}
            </Alert>
          )}
        </Grid>
        {isBinding
          ? optionData.subData.map((data, index) => (
              <Grid item key={index}>
                <CardOption
                  handleChange={event =>
                    option.handleSwitch(data.key, event.target.checked ? 1 : 0)
                  }
                  {...data}
                />
              </Grid>
            ))
          : null}
        <Grid item>
          <ActionDialog {...option} />
        </Grid>
      </Grid>
      {
        <Backdrop className={classes.backdrop} open={loading}>
          <CircularProgress color="inherit" />
        </Backdrop>
      }
    </React.Fragment>
  );
};

const Description = () => {
  return (
    <Grid container direction="column">
      <Grid item>
        <Typography variant="h4">訂閱系統</Typography>
      </Grid>
      <Grid item>
        <Typography variant="body1" color="textSecondary">
          隨時接收最新資訊
        </Typography>
      </Grid>
    </Grid>
  );
};

const CardOption = props => {
  return (
    <Card>
      <CardHeader title={props.title} />
      <CardContent>
        <Typography variant="body2" color="textSecondary" component="p">
          {props.description}
        </Typography>
      </CardContent>
      <CardActions disableSpacing>
        <Switch
          checked={props.status === 1 ? true : false}
          onChange={props.handleChange}
          color="primary"
        />
      </CardActions>
    </Card>
  );
};

CardOption.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  status: PropTypes.number.isRequired,
  handleChange: PropTypes.func.isRequired,
};

const ActionDialog = props => {
  const { open, handleClose, isBinding, forceReload } = props;
  const classes = useStyles();

  const revoke = () => {
    NotifyAPI.revokeNotify().then(forceReload);
  };

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>
        設定
        <IconButton aria-label="close" className={classes.closeButton} onClick={handleClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          此系統是藉由Line Notify綁定來達成，因此需將您轉至Line服務進行綁定，完成後可藉由 訊息測試
          的按鈕進行測試！
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button
          color="default"
          disabled={!isBinding}
          variant="outlined"
          onClick={() => NotifyAPI.notifyTest()}
        >
          訊息測試
        </Button>
        <Button color="secondary" disabled={!isBinding} variant="outlined" onClick={revoke}>
          取消綁定
        </Button>
        <Button
          color="primary"
          disabled={isBinding}
          variant="outlined"
          component={Link}
          to="/Bot/Notify/Binding"
        >
          綁定
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ActionDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  isBinding: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
  forceReload: PropTypes.func.isRequired,
};

export default Notify;
