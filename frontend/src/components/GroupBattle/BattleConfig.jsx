import { useEffect, useReducer, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Box, Grid, Paper, Typography, TextField, Button, Avatar,
  CircularProgress,
} from "@mui/material";
import { green } from "@mui/material/colors";
import AlertLogin from "../AlertLogin";
import HintSnackBar from "../HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import * as GroupAPI from "../../services/group";

/* ---------- keyword buttons ---------- */
const ButtonDatas = [
  { label: "報名者", keyword: "displayName" },
  { label: "階段", keyword: "stage" },
  { label: "幾王", keyword: "boss" },
  { label: "周次", keyword: "week" },
  { label: "備註", keyword: "comment" },
  { label: "報名種類", keyword: "statusText" },
];

/* ---------- reducer ---------- */
function compare(str1, str2) {
  return str1.replace(/(\r\n)/g, "\n") === str2.replace(/(\r\n)/g, "\n");
}

function messageReducer(state, action) {
  const { type, message, error, pos } = action;
  const { origin, defaults, update } = state.message;

  switch (type) {
    case "UPDATE":
      return {
        ...state,
        hasEdited: !compare(message, origin),
        message: { ...state.message, update: message },
      };
    case "CONCAT": {
      const start = update.substring(0, pos);
      const end = update.substring(pos);
      const concatMsg = start + message + end;
      return {
        ...state,
        hasEdited: !compare(concatMsg, origin),
        message: { ...state.message, update: concatMsg },
      };
    }
    case "RESET":
      return {
        ...state,
        hasEdited: !compare(origin, defaults),
        message: { ...state.message, update: defaults },
      };
    case "ROLLBACK":
      return {
        ...state,
        hasEdited: false,
        message: { ...state.message, update: origin },
      };
    case "PREACTION":
      return { ...state, loading: true, hasError: false };
    case "SAVED":
      return {
        ...state,
        loading: false,
        hasEdited: false,
        message: { ...state.message, origin: update },
      };
    case "SAVEFAILED":
      return { ...state, loading: false, hasError: true, errorMsg: error };
    case "INIT_PREPARE":
      return { ...state, loading: true, hasError: false };
    case "INIT_SAVED":
      return {
        ...state,
        loading: false,
        message: { ...state.message, origin: message, update: message },
      };
    case "INIT_FAILED":
      return { ...state, loading: false, hasError: true, errorMsg: error };
    default:
      return state;
  }
}

/* ---------- assemble preview ---------- */
function assemble(mapData, strData) {
  const objMapData = {};
  Object.keys(mapData).forEach((key) => {
    objMapData[`{${key.toLowerCase()}}`] = mapData[key];
  });
  const re = new RegExp(Object.keys(objMapData).join("|"), "gi");
  return strData.replace(re, (matched) => objMapData[matched.toLowerCase()]);
}

const TestingData = {
  displayName: "佑樹",
  week: 999,
  boss: 3,
  statusText: "補償",
  damage: 12345678,
  comment: "補償盡量打了",
  stage: 5,
};

/* ---------- hook ---------- */
function useSignMessage(groupId) {
  const [state, dispatch] = useReducer(messageReducer, {
    message: {
      update: "",
      origin: "",
      defaults: "我報名了 *{week}周{boss}王* ，{statusText}\r\n傷害：{damage}\r\n備註：{comment}",
    },
    hasEdited: false,
    loading: false,
    hasError: false,
    errorMsg: "",
  });

  useEffect(() => {
    dispatch({ type: "INIT_PREPARE" });
    GroupAPI.getBattleConfig(groupId)
      .then((res) => {
        const { signMessage } = res;
        dispatch({ type: "INIT_SAVED", message: signMessage.replace(/\r\n/g, "\n") });
      })
      .catch((err) => {
        const status = err?.response?.status;
        const message =
          status === 401 ? "尚未登入，請先登入再進行動作！" : "未知錯誤，請通知作者！";
        dispatch({ type: "INIT_FAILED", error: message });
      });
  }, [groupId]);

  const save = () => {
    dispatch({ type: "PREACTION" });
    GroupAPI.updateBattleConfig(groupId, { signMessage: state.message.update })
      .then(() => dispatch({ type: "SAVED" }))
      .catch((err) => {
        const code = err?.response?.status;
        const errorMap = {
          400: "更新失敗，請確認輸入的訊息是否合法！",
          403: "更新失敗，請嘗試重新整理頁面！",
        };
        dispatch({ type: "SAVEFAILED", error: errorMap[code] || "未知錯誤，請通知作者查修！" });
      });
  };

  return {
    message: {
      template: state.message.update,
      display: assemble(TestingData, state.message.update),
    },
    action: dispatch,
    save,
    status: {
      edited: state.hasEdited,
      loading: state.loading,
      hasError: state.hasError,
      errorMsg: state.errorMsg,
    },
  };
}

/* ---------- SignMessage ---------- */
function SignMessage() {
  const { groupId } = useParams();
  const inputRef = useRef();
  const [selectionStart, setSelectionStart] = useState(0);
  const [hint, hintActions] = useHintBar();
  const { message, action, status, save } = useSignMessage(groupId);
  const { template, display } = message;
  const { edited, loading, hasError, errorMsg } = status;

  useEffect(() => {
    if (hasError && errorMsg) hintActions.handleOpen(errorMsg, "error");
  }, [hasError, errorMsg]);

  const handleSave = () => {
    save();
    if (!hasError) hintActions.handleOpen("保存成功！", "success");
  };

  return (
    <>
      <Paper sx={{ p: 2, "& > *": { my: 1 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="h6">報名成功訊息</Typography>
          {edited && (
            <Typography variant="caption" color="error" sx={{ fontWeight: "bold" }}>
              尚未保存
            </Typography>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary">
          自定義，當透過布丁戰隊系統報名成功後，需回饋的訊息！
        </Typography>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 0.5 }}>
          <Avatar alt="我" />
          <TextField
            fullWidth
            multiline
            variant="filled"
            label="預覽"
            value={display}
            disabled
          />
        </Box>

        <TextField
          fullWidth
          multiline
          variant="outlined"
          label="訊息設定"
          value={template}
          inputRef={inputRef}
          onSelect={() => setSelectionStart(inputRef.current?.selectionStart ?? 0)}
          onChange={(e) => action({ type: "UPDATE", message: e.target.value })}
        />

        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          {ButtonDatas.map((data, index) => (
            <Button
              key={index}
              variant="outlined"
              color="primary"
              onClick={() =>
                action({ type: "CONCAT", message: `{${data.keyword}}`, pos: selectionStart })
              }
            >
              {data.label}
            </Button>
          ))}
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => action({ type: "RESET" })}
            disabled={loading}
          >
            回復預設
          </Button>
          <Button
            variant="contained"
            color="inherit"
            onClick={() => action({ type: "ROLLBACK" })}
            disabled={loading}
          >
            重來
          </Button>
          <Box sx={{ position: "relative" }}>
            <Button variant="contained" color="primary" disabled={loading} onClick={handleSave}>
              保存
            </Button>
            {loading && (
              <CircularProgress
                size={24}
                sx={{
                  color: green[500],
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  mt: "-12px",
                  ml: "-12px",
                }}
              />
            )}
          </Box>
        </Box>
      </Paper>

      <HintSnackBar {...hint} onClose={hintActions.handleClose} />
    </>
  );
}

/* ---------- NotifyConfig ---------- */
function NotifyConfig() {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6">通知設定</Typography>
      <Typography variant="body2" color="text.secondary">
        可邀請通知機器人，進入群組，讓戰報更為即時，建設中..敬請期待！
      </Typography>
    </Paper>
  );
}

/* ---------- BattleConfig (main export) ---------- */
export default function BattleConfig() {
  const isLoggedIn = window.liff?.isLoggedIn?.() ?? false;

  useEffect(() => {
    document.title = "戰隊系統設定";
  }, []);

  if (!isLoggedIn) return <AlertLogin />;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, p: 2 }}>
      <SignMessage />
      <NotifyConfig />
    </Box>
  );
}
