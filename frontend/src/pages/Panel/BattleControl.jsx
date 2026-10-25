import { useEffect, useState, useReducer, useMemo } from "react";
import {
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Divider,
  AccordionActions,
  Backdrop,
  CircularProgress,
  Grid,
  Dialog,
  DialogActions,
  Stack,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useSendMessage } from "../../hooks/useLiff";
import HintSnackBar from "../../components/HintSnackBar";
import AlertDialog from "../../components/AlertDialog";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";

const Accordions = [
  {
    title: "報名操作",
    description: "可進行報名或是取消報名的操作",
    buttons: [
      {
        title: "報名",
        text: ".gbs",
        dialog: true,
        required: ["week", "boss"],
        describe: ({ week, boss }) => `報名第 ${week} 周第 ${boss} 王`,
      },
      {
        title: "取消報名",
        text: ".gbc",
        dialog: true,
        required: ["week", "boss"],
        describe: ({ week, boss }) => `取消第 ${week} 周第 ${boss} 王的報名`,
        confirm: {
          title: "取消報名？",
          description: text => `會在群組發出「${text}」，所有人都看得到，報名表也會更新。`,
          submitText: "取消報名",
        },
      },
    ],
  },
  {
    title: "周次切換",
    description: "可將報名表的周次進行切換",
    buttons: [
      { title: "前往下週", text: ".nextweek" },
      {
        title: "自己設定",
        text: ".setweek",
        dialog: true,
        required: ["week"],
        disabled: ["boss"],
        describe: ({ week }) => `把報名表切換到第 ${week} 周`,
      },
      { title: "回去上週", text: ".lastweek" },
    ],
  },
  {
    title: "檢視列表",
    description: "讓機器人把報名表交出來，依據目前戰隊所在的周次，前後周次的報名表會有所差異！",
    buttons: [
      { title: "看上一週", text: ".showlastweek" },
      { title: "看目前的", text: ".nowweek" },
      { title: "看下一週", text: ".shownextweek" },
      {
        title: "自己挑選",
        text: ".gb",
        dialog: true,
        required: ["week"],
        describe: ({ week, boss }) =>
          boss ? `顯示第 ${week} 周第 ${boss} 王的報名表` : `顯示第 ${week} 周的報名表`,
      },
    ],
  },
  {
    title: "三刀出完簽到",
    description: "偶酥酥咩~獨立於報名表系統，只著重於出完三刀的戰隊，歡迎使用！",
    buttons: [
      { title: "出完簽到", text: ".done" },
      {
        title: "取消簽到",
        text: ".reset",
        confirm: {
          title: "取消簽到？",
          description: text =>
            `會在群組發出「${text}」，所有人都看得到，你的出完簽到紀錄會被清除。`,
          submitText: "取消簽到",
        },
      },
      { title: "稽查未打完的", text: ".gblist" },
    ],
  },
  {
    title: "其他",
    description: "集合了其餘雜項功能！",
    buttons: [{ title: "報名成功測試", text: ".signtest" }],
  },
];

// send(button, text)：由父層決定要直接送，還是先跳出「會發到群組」的確認
function genAccordionButtons({ showDialog, send, sendable, buttons }) {
  return buttons.map(button => {
    const onClick = button.dialog
      ? () => showDialog({ open: true, param: { ...button, send: text => send(button, text) } })
      : () => send(button, button.text);
    return (
      <CopyToClipboard key={button.title} text={button.text}>
        <Button disabled={!sendable} variant="outlined" onClick={onClick} sx={{ minHeight: 44 }}>
          {button.title}
        </Button>
      </CopyToClipboard>
    );
  });
}

const paramReducer = (state, action) => {
  const { type, week, boss } = action;
  let error;
  switch (type) {
    case "INIT":
      return {
        week: { data: "", error: false },
        boss: { data: "", error: false },
      };
    case "WEEK":
      error = !/^1?\d{1,2}$/.test(week);
      return {
        ...state,
        week: { data: week, error },
      };
    case "BOSS":
      error = !/^[1-5]$/.test(boss);
      return {
        ...state,
        boss: { data: boss, error },
      };
    default:
      throw new Error();
  }
};

// 預設值要用固定的陣列：每次 render 都 new 一個 []，會讓下面依賴它的 effect 不斷重跑
const NO_FIELDS = [];

function InputDialog({
  open,
  handleClose,
  sendable,
  disabled = NO_FIELDS,
  required = NO_FIELDS,
  title,
  text,
  send,
  describe,
}) {
  const [param, dispatcher] = useReducer(paramReducer, {
    week: { data: "", error: false },
    boss: { data: "", error: false },
  });
  const [sendState, setSendState] = useState({ text: "", pass: true });

  useEffect(() => {
    dispatcher({ type: "INIT" });
  }, [text]);

  useEffect(() => {
    let message = text;
    let pass = true;
    Object.keys(param)
      .filter(key => disabled.indexOf(key) === -1)
      .forEach(key => {
        const isEmpty = param[key].data === "";
        const isError = param[key].error;
        const isRequired = required.indexOf(key) !== -1;

        if (!isEmpty && isError) pass = false;
        else if (isEmpty && isRequired) pass = false;
        else if (!isEmpty) message += ` ${param[key].data}`;
      });
    setSendState({ text: message, pass });
  }, [param, disabled, required, text]);

  // 必填欄位都通過檢查才有白話預覽，避免顯示「第  周」這種半成品
  const preview =
    describe && sendState.pass ? describe({ week: param.week.data, boss: param.boss.data }) : "";

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {/* 先用白話說明會發生什麼，再列出實際送出的指令 */}
        {preview && (
          <DialogContentText sx={{ color: "text.primary", fontWeight: 600 }}>
            {preview}
          </DialogContentText>
        )}
        <DialogContentText variant="body2" sx={{ mb: 2 }}>
          將發送指令：<code>{sendState.text}</code>
        </DialogContentText>
        <Stack spacing={2}>
          <TextField
            fullWidth
            value={param.week.data}
            error={required.indexOf("week") !== -1 && param.week.error}
            label="周次"
            type="tel"
            disabled={disabled.indexOf("week") !== -1}
            onChange={e => dispatcher({ type: "WEEK", week: e.target.value })}
          />
          <TextField
            fullWidth
            value={param.boss.data}
            error={required.indexOf("boss") !== -1 && param.boss.error}
            label="王"
            type="tel"
            disabled={disabled.indexOf("boss") !== -1}
            onChange={e => dispatcher({ type: "BOSS", boss: e.target.value })}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary" sx={{ minHeight: 44 }}>
          取消
        </Button>
        <CopyToClipboard text={sendState.text}>
          <Button
            onClick={() => send(sendState.text)}
            color="primary"
            autoFocus
            disabled={!sendState.pass || !sendable}
            sx={{ minHeight: 44 }}
          >
            發送
          </Button>
        </CopyToClipboard>
      </DialogActions>
    </Dialog>
  );
}

function AccordionButtons() {
  const [sendState, send] = useSendMessage();
  const { isSending, isError, isSuccess } = sendState;
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [sendable, setSendable] = useState(true);
  const [dialog, showDialog] = useState({ open: false, param: {} });

  const closeDialog = () => showDialog({ open: false, param: {} });
  const [alertState, { handleOpen: openAlert, handleClose: closeAlert }] = useAlertDialog();

  // 這些按鈕都是「代替你在群組聊天室發話」。取消報名、取消簽到會影響報名表，
  // 先跳出確認並講清楚會發到群組；其他指令直接送出。
  const dispatchSend = (button, text) => {
    if (!button.confirm) {
      closeDialog();
      send(text);
      return;
    }
    openAlert({
      title: button.confirm.title,
      description: button.confirm.description(text),
      submitText: button.confirm.submitText,
      cancelText: "先不要",
      destructive: true,
      onSubmit: () => {
        closeAlert();
        closeDialog();
        send(text);
      },
    });
  };

  useEffect(() => {
    if (isError) {
      showHint("發送失敗，不過幫你複製起來囉！請直接到LINE貼上～", "error");
    }
  }, [isError, showHint]);

  useEffect(() => {
    if (isSuccess) showHint("指令已發送到聊天室", "success");
  }, [isSuccess, showHint]);

  // Disable button after sending to prevent duplicate sends
  useEffect(() => {
    if (isSending) {
      setSendable(false);
    }

    const timer = setTimeout(() => {
      setSendable(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isSending]);

  const AccordionView = useMemo(
    () =>
      Accordions.map(data => (
        <Accordion key={data.title}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">{data.title}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography
              variant="subtitle1"
              sx={{
                color: "text.secondary",
              }}
            >
              {data.description}
            </Typography>
          </AccordionDetails>
          <Divider />
          <AccordionActions disableSpacing sx={{ flexWrap: "wrap", gap: 1, px: 2, pb: 2 }}>
            {genAccordionButtons({
              showDialog,
              send: dispatchSend,
              sendable,
              buttons: data.buttons,
            })}
          </AccordionActions>
        </Accordion>
      )),
    // dispatchSend 每次 render 都是新函式，這裡跟著 send 一起重算即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sendable, send]
  );

  return (
    <div style={{ width: "100%" }}>
      {isSending && (
        <Backdrop
          sx={theme => ({ zIndex: theme.zIndex.drawer + 1, color: theme.palette.common.white })}
          open
        >
          <CircularProgress color="inherit" />
        </Backdrop>
      )}
      <HintSnackBar {...hintState} onClose={closeHint} />
      {AccordionView}
      <InputDialog
        open={dialog.open}
        sendable={sendable}
        handleClose={closeDialog}
        {...dialog.param}
      />
      <AlertDialog
        open={alertState.open}
        onClose={closeAlert}
        onSubmit={alertState.onSubmit}
        title={alertState.title}
        description={alertState.description}
        submitText={alertState.submitText}
        cancelText={alertState.cancelText}
        destructive={alertState.destructive}
        busy={alertState.busy}
      />
    </div>
  );
}

export default function BattleControl() {
  useEffect(() => {
    window.document.title = "戰隊控制面板";
  }, []);

  return (
    <>
      <Grid container direction="column" sx={{ p: 1 }}>
        <Grid>
          <Typography variant="h4">戰隊操控面板</Typography>
        </Grid>
        <Grid>
          <Typography>點擊相對應的按鈕，就會代替你在聊天室發送指令</Typography>
        </Grid>
      </Grid>
      <AccordionButtons />
    </>
  );
}
