import React, { useEffect, useReducer, Fragment, useState, useRef } from "react";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import Avatar from "@material-ui/core/Avatar";
import Paper from "@material-ui/core/Paper";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import axios from "axios";
import { useParams } from "react-router-dom";
import CircularProgress from "@material-ui/core/CircularProgress";
import { green } from "@material-ui/core/colors";
import Box from "@material-ui/core/Box";
import MuiAlert from "@material-ui/lab/Alert";
import Snackbar from "@material-ui/core/Snackbar";

function Alert(props) {
  return <MuiAlert elevation={6} variant="filled" {...props} />;
}

const useStyles = makeStyles(theme => ({
  block: {
    padding: theme.spacing(1),
    "& > *": {
      margin: theme.spacing(1),
    },
  },
  messageBox: {
    padding: theme.spacing(0.5),
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
  wrapper: {
    position: "relative",
  },
  buttonSuccess: {
    backgroundColor: green[500],
    "&:hover": {
      backgroundColor: green[700],
    },
  },
}));

const ButtonDatas = [
  { label: "報名者", keyword: "displayName" },
  { label: "階段(台)", keyword: "stageTW" },
  { label: "階段(日)", keyword: "stageJP" },
  { label: "幾王", keyword: "boss" },
  { label: "周次", keyword: "week" },
  { label: "備註", keyword: "comment" },
  { label: "報名種類", keyword: "statusText" },
];

const SignMessageConfig = () => {
  const classes = useStyles();
  const inputRef = useRef();
  const [alert, setAlert] = useState({ open: false, message: "", level: "error" });
  const [selectionStart, setSelectionStart] = useState();
  const updateSelectionStart = () => setSelectionStart(inputRef.current.selectionStart);
  const { groupId } = useParams();
  const { message, action, status, save, alertMessage } = useSignMessage(groupId);
  const { template, display } = message;
  const { edited, hasError, loading } = status;

  useEffect(() => {
    if (!alertMessage) return;
    setAlert({
      ...alert,
      open: true,
      message: alertMessage,
      level: hasError ? "error" : "success",
    });
  }, [alertMessage]);

  const alertClose = () => {
    setAlert({ ...alert, open: false });
  };

  return (
    <Fragment>
      <Grid container item component={Paper} className={classes.block}>
        <Grid container item alignItems="center">
          <Grid item>
            <Typography variant="h5">報名成功訊息</Typography>
          </Grid>
          {edited && (
            <Grid item>
              <Typography variant="caption" color="error">
                <Box fontWeight="fontWeightBold">尚未保存</Box>
              </Typography>
            </Grid>
          )}
          <Grid item xs={12}>
            <Typography variant="overline" color="textSecondary">
              自定義，當透過布丁戰隊系統報名成功後，需回饋的訊息！
            </Typography>
          </Grid>
        </Grid>
        <Grid container item className={classes.messageBox} alignItems="center" spacing={1}>
          <Grid item>
            <Avatar alt="我" />
          </Grid>
          <Grid item xs={10}>
            <TextField fullWidth multiline variant="filled" label="預覽" value={display} disabled />
          </Grid>
        </Grid>
        <Grid container item>
          <TextField
            fullWidth
            multiline
            variant="outlined"
            label="訊息設定"
            value={template}
            inputRef={inputRef}
            onSelect={updateSelectionStart}
            onChange={event => action({ type: "UPDATE", message: event.target.value })}
          />
        </Grid>
        <Grid container item spacing={1}>
          {ButtonDatas.map((data, index) => (
            <Grid item key={index}>
              <Button
                variant="outlined"
                color="primary"
                onClick={() =>
                  action({ type: "CONCAT", message: `{${data.keyword}}`, pos: selectionStart })
                }
              >
                {data.label}
              </Button>
            </Grid>
          ))}
        </Grid>
        <Grid container item spacing={1} direction="row-reverse">
          <Grid item>
            <div className={classes.wrapper}>
              <Button variant="contained" color="primary" disabled={loading} onClick={save}>
                保存
              </Button>
              {loading && <CircularProgress size={24} className={classes.buttonProgress} />}
            </div>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              color="default"
              onClick={() => action({ type: "ROLLBACK" })}
              disabled={loading}
            >
              重來
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="contained"
              color="secondary"
              onClick={() => action({ type: "RESET" })}
              disabled={loading}
            >
              回復預設
            </Button>
          </Grid>
        </Grid>
      </Grid>
      <Snackbar open={alert.open} autoHideDuration={6000} onClose={alertClose}>
        <Alert onClose={alertClose} severity={alert.level}>
          {alert.message}
        </Alert>
      </Snackbar>
    </Fragment>
  );
};

/**
 * 報名訊息 hooks
 *
 * @typedef SignHooks
 * @property {Object} message
 * @property {String} message.template
 * @property {String} message.display
 * @property {Function} action
 * @property {Object} status
 * @property {Boolean} status.edited
 *
 * @param {String} groupId
 * @returns {SignHooks} SignHooks
 */
const useSignMessage = groupId => {
  const [state, dispatcher] = useReducer(updateMessageReducer, {
    message: {
      update: "",
      origin: "",
      defaults: "我報名了 *{week}周{boss}王* ，{statusText}\r\n傷害：{damage}\r\n備註：{comment}",
    },
    hasEdited: false,
    loading: false,
    alertMessage: "",
    hasError: false,
  });
  const api = `/api/Guild/${groupId}/Battle/Config`;

  const TestingData = {
    displayName: "佑樹",
    week: 999,
    boss: 3,
    statusText: "補償",
    damage: 12345678,
    comment: "補償盡量打了",
    stageTW: 4,
    stageJP: 5,
  };

  useEffect(() => {
    dispatcher({ type: "INIT_PREPARE" });
    axios
      .get(api)
      .then(res => res.data)
      .then(res => {
        let { signMessage } = res;
        dispatcher({ type: "INIT_SAVED", message: signMessage.replace(/\r\n/g, "\n") });
      })
      .catch(err => {
        let { status } = err.response;
        let message = "";
        if (status === 401) {
          message = "尚未登入，請先登入再進行動作！";
        } else {
          message = "未知錯誤，請通知作者！";
        }

        dispatcher({ type: "INIT_FAILED", error: message });
      });
  }, [groupId]);

  let { update } = state.message;

  const save = () => {
    dispatcher({ type: "PREACTION" });
    axios
      .put(api, { signMessage: update })
      .then(res => res.data)
      .then(() => dispatcher({ type: "SAVED" }))
      .catch(err => {
        let { response } = err;
        let { status: code } = response;
        let errorDatas = [
          { code: 400, message: "更新失敗，請確認輸入的訊息是否合法！" },
          { code: 403, message: "更新失敗，請嘗試重新整理頁面！" },
        ];

        let result = errorDatas.find(data => data.code === code);
        let message = result ? result.message : "未知錯誤，請通知作者查修！";

        dispatcher({ type: "SAVEFAILED", error: message });
      });
  };

  return {
    message: { template: update, display: assemble(TestingData, update) },
    action: dispatcher,
    save,
    status: { edited: state.hasEdited, loading: state.loading, hasError: state.hasError },
    alertMessage: state.alertMessage,
  };
};

const updateMessageReducer = (state, action) => {
  let { type, message, error, pos } = action;

  let { origin, defaults, update } = state.message;
  switch (type) {
    case "UPDATE":
      return {
        ...state,
        hasEdited: !compare(message, origin),
        message: {
          ...state.message,
          update: message,
        },
      };
    case "CONCAT": {
      let start = update.substr(0, pos);
      let end = update.substr(pos);
      let concatMsg = start + message + end;

      return {
        ...state,
        hasEdited: !compare(concatMsg, origin),
        message: {
          ...state.message,
          update: concatMsg,
        },
      };
    }
    case "RESET":
      return {
        ...state,
        hasEdited: !compare(origin, defaults),
        message: {
          ...state.message,
          update: defaults,
        },
      };
    case "ROLLBACK":
      return {
        ...state,
        hasEdited: false,
        message: {
          ...state.message,
          update: origin,
        },
      };
    case "PREACTION":
      return {
        ...state,
        loading: true,
        hasError: false,
        alertMessage: "",
      };
    case "SAVED":
      return {
        ...state,
        loading: false,
        hasEdited: false,
        alertMessage: "保存成功！",
        message: {
          ...state.message,
          origin: update,
        },
      };
    case "SAVEFAILED":
      return {
        ...state,
        loading: false,
        hasError: true,
        alertMessage: error,
      };
    case "INIT_PREPARE":
      return {
        ...state,
        loading: true,
        hasError: false,
        alertMessage: "",
      };
    case "INIT_SAVED":
      return {
        ...state,
        loading: false,
        message: {
          ...state.message,
          origin: message,
          update: message,
        },
      };
    case "INIT_FAILED":
      return {
        ...state,
        loading: false,
        hasError: true,
        alertMessage: error,
      };
    default:
      return state;
  }
};

function compare(str1, str2) {
  return str1.replace(/(\r\n)/g, "\n") === str2.replace(/(\r\n)/g, "\n");
}

function assemble(mapData, strData) {
  var objMapData = {};

  Object.keys(mapData).forEach(key => {
    let newIndex = "{" + key.toLowerCase() + "}";
    objMapData[newIndex] = mapData[key];
  });

  var re = new RegExp(Object.keys(objMapData).join("|"), "gi");

  var strResult = strData.replace(re, function (matched) {
    matched = matched.toLowerCase();
    return objMapData[matched];
  });

  return strResult;
}

export default SignMessageConfig;
