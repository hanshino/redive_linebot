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
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { useSendMessage } from "../../hooks/useLiff";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";

const Accordions = [
  {
    title: "報名操作",
    description: "可進行報名或是取消報名的操作",
    buttons: [
      { title: "報名", text: ".gbs", dialog: true, required: ["week", "boss"] },
      { title: "取消報名", text: ".gbc", dialog: true, required: ["week", "boss"] },
    ],
  },
  {
    title: "周次切換",
    description: "可將報名表的周次進行切換",
    buttons: [
      { title: "前往下週", text: ".nextweek" },
      { title: "自己設定", text: ".setweek", dialog: true, required: ["week"], disabled: ["boss"] },
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
      { title: "自己挑選", text: ".gb", dialog: true, required: ["week"] },
    ],
  },
  {
    title: "三刀出完簽到",
    description: "偶酥酥咩~獨立於報名表系統，只著重於出完三刀的戰隊，歡迎使用！",
    buttons: [
      { title: "出完簽到", text: ".done" },
      { title: "取消簽到", text: ".reset" },
      { title: "稽查未打完的", text: ".gblist" },
    ],
  },
  {
    title: "其他",
    description: "集合了其餘雜項功能！",
    buttons: [
      { title: "報名成功測試", text: ".signtest" },
      { title: "補償刀軸轉換", text: ".bt" },
    ],
  },
];

function genAccordionButtons({ showDialog, send, sendable, buttons }) {
  return buttons.map((button) => {
    const onClick = button.dialog
      ? () => showDialog({ open: true, param: { ...button, send } })
      : () => send(button.text);
    return (
      <CopyToClipboard key={button.title} text={button.text}>
        <Button disabled={!sendable} variant="outlined" onClick={onClick}>
          {button.title}
        </Button>
      </CopyToClipboard>
    );
  });
}

const paramReducer = (state, action) => {
  const { type, week, boss } = action;
  let error = null;
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

function InputDialog({
  open,
  handleClose,
  sendable,
  disabled = [],
  required = [],
  title,
  text,
  send,
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
      .filter((key) => disabled.indexOf(key) === -1)
      .forEach((key) => {
        const isEmpty = param[key].data === "";
        const isError = param[key].error;
        const isRequired = required.indexOf(key) !== -1;

        if (!isEmpty && isError) pass = false;
        else if (isEmpty && isRequired) pass = false;
        else if (!isEmpty) message += ` ${param[key].data}`;
      });
    setSendState({ text: message, pass });
  }, [param, disabled, required, text]);

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{sendState.text}</DialogContentText>
        <TextField
          fullWidth
          value={param.week.data}
          error={required.indexOf("week") !== -1 && param.week.error}
          label="周次"
          type="tel"
          disabled={disabled.indexOf("week") !== -1}
          onChange={(e) => dispatcher({ type: "WEEK", week: e.target.value })}
        />
        <TextField
          fullWidth
          value={param.boss.data}
          error={required.indexOf("boss") !== -1 && param.boss.error}
          label="王"
          type="tel"
          disabled={disabled.indexOf("boss") !== -1}
          onChange={(e) => dispatcher({ type: "BOSS", boss: e.target.value })}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          取消
        </Button>
        <CopyToClipboard text={sendState.text}>
          <Button
            onClick={() => send(sendState.text)}
            color="primary"
            autoFocus
            disabled={!sendState.pass || !sendable}
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
  const { isSending, isError } = sendState;
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [sendable, setSendable] = useState(true);
  const [dialog, showDialog] = useState({ open: false, param: {} });

  const closeDialog = () => showDialog({ open: false, param: {} });

  useEffect(() => {
    if (isError) {
      showHint("發送失敗，不過幫你複製起來囉！請直接到LINE貼上～", "error");
    }
  }, [isError, showHint]);

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
      Accordions.map((data) => (
        <Accordion key={data.title}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="h6">{data.title}</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="subtitle1" color="text.secondary">
              {data.description}
            </Typography>
          </AccordionDetails>
          <Divider />
          <AccordionActions>
            {genAccordionButtons({ showDialog, send, sendable, buttons: data.buttons })}
          </AccordionActions>
        </Accordion>
      )),
    [sendable, send],
  );

  return (
    <div style={{ width: "100%" }}>
      {isSending && (
        <Backdrop sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: "#fff" }} open>
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
          <Typography>點擊相對應的按鈕就會代替您發送指令</Typography>
        </Grid>
      </Grid>
      <AccordionButtons />
    </>
  );
}
