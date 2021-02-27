import React, { useState, useEffect } from "react";
import Grid from "@material-ui/core/Grid";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import ButtonGroup from "@material-ui/core/ButtonGroup";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import { makeStyles } from "@material-ui/core/styles";
import PropTypes from "prop-types";
import Snackbar from "@material-ui/core/Snackbar";
import MuiAlert from "@material-ui/lab/Alert";

const useStyles = makeStyles(theme => ({
  root: {
    padding: theme.spacing(1),
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    "& > *": {
      padding: theme.spacing(2),
    },
  },
  large: {
    width: theme.spacing(10),
    height: theme.spacing(10),
  },
}));

const Alert = props => {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
};

const SenderInput = props => {
  const { action: setSender, Sender, isLoggedIn } = props;
  const classes = useStyles();
  const [alert, setAlert] = useState({
    open: false,
    level: "success",
    message: "",
  });
  const [state, setState] = useState({
    name: "",
    iconUrl: "",
  });

  useEffect(() => {
    setState({
      ...state,
      name: Sender.name || "",
      iconUrl: Sender.iconUrl || "",
    });
  }, [Sender]);

  const handleCloseBar = () => {
    setAlert({
      ...alert,
      open: false,
    });
  };

  const handleInput = (event, type) => {
    setState({
      ...state,
      [type]: event.target.value,
    });
  };

  const handleReset = () => {
    setState({
      ...state,
      name: "",
      iconUrl: "",
    });
    save("", "");
  };

  const handleSave = () => {
    if (!isValidName(state.name) || !isValidIcon(state.iconUrl)) {
      setAlert({
        ...alert,
        open: true,
        level: "error",
        message: "發送人格式錯誤！",
      });
      return;
    }
    save(state.name, state.iconUrl);
  };

  const save = (name, iconUrl) => {
    setSender(name, iconUrl)
      .then(() => {
        setAlert({
          ...alert,
          open: true,
          level: "success",
          message: "設定成功！",
        });
      })
      .catch(() => {
        setAlert({
          ...alert,
          open: true,
          level: "warning",
          message: "設定失敗！請重新整理試試看！",
        });
      });
  };

  return (
    <React.Fragment>
      <Grid item xs={12} sm={12} component={Paper} className={classes.root}>
        <Grid container alignItems="flex-end" spacing={2}>
          <Grid item xs={12} sm={8}>
            <Grid container direction="column">
              <Grid item>
                <Typography variant="h5" component="h2">
                  {"自訂機器人頭像"}
                </Typography>
              </Grid>
              <Grid item>
                <Typography variant="body2" component="p">
                  {"可設定群組獨特的機器人頭像"}
                </Typography>
              </Grid>
              <Grid item>
                <TextField
                  label="名稱"
                  fullWidth
                  value={state.name}
                  onChange={event => handleInput(event, "name")}
                  inputProps={{ maxLength: 40 }}
                  {...(!isValidName(state.name)
                    ? { error: true, helperText: "發送人長度限制0~20字" }
                    : null)}
                />
              </Grid>
              <Grid item>
                <TextField
                  label="頭像"
                  fullWidth
                  value={state.iconUrl}
                  onChange={event => handleInput(event, "iconUrl")}
                  {...(!isValidIcon(state.iconUrl)
                    ? { error: true, helperText: "圖片格式需為https開頭，jpe(g),png結尾" }
                    : null)}
                />
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Grid container direction="column" alignItems="center" spacing={1}>
              <Grid item>
                <Typography variant="subtitle1" component="p">
                  {state.name ? `${state.name} from ` : null}布丁
                </Typography>
              </Grid>
              <Grid item>
                <Avatar
                  alt="預設"
                  className={classes.large}
                  src={isValidIcon(state.iconUrl) ? state.iconUrl : null}
                />
              </Grid>
              <Grid item>
                <ButtonGroup
                  color="primary"
                  aria-label="outlined button group"
                  disabled={!isLoggedIn}
                >
                  <Button variant="outlined" onClick={handleReset}>
                    重設
                  </Button>
                  <Button variant="outlined" color="primary" onClick={handleSave}>
                    召喚
                  </Button>
                </ButtonGroup>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      <Snackbar open={alert.open} autoHideDuration={6000} onClose={handleCloseBar}>
        <Alert onClose={handleCloseBar} severity={alert.level}>
          {alert.message}
        </Alert>
      </Snackbar>
    </React.Fragment>
  );
};

function isValidName(name) {
  return /^.{0,20}$/.test(name);
}

function isValidIcon(url = "") {
  if (url === "") return true;
  return /^https:.*?(jpg|jpeg|tiff|png)$/i.test(url);
}

SenderInput.propTypes = {
  action: PropTypes.func.isRequired,
  Sender: PropTypes.object.isRequired,
  isLoggedIn: PropTypes.bool.isRequired,
};

export default SenderInput;
