import { useState, useEffect } from "react";
import {
  Grid, Paper, Typography, TextField, ButtonGroup, Button, Avatar,
} from "@mui/material";
import HintSnackBar from "../HintSnackBar";
import useHintBar from "../../hooks/useHintBar";

function isValidName(name) {
  return /^.{0,20}$/.test(name);
}

function isValidIcon(url = "") {
  if (url === "") return true;
  return /^https:.*?(jpg|jpeg|tiff|png)$/i.test(url);
}

export default function SenderInput({ action: setSender, Sender, isLoggedIn }) {
  const [hint, hintActions] = useHintBar();
  const [state, setState] = useState({ name: "", iconUrl: "" });

  useEffect(() => {
    setState({ name: Sender.name || "", iconUrl: Sender.iconUrl || "" });
  }, [Sender]);

  const handleInput = (e, type) => {
    setState((prev) => ({ ...prev, [type]: e.target.value }));
  };

  const save = (name, iconUrl) => {
    setSender(name, iconUrl)
      .then(() => hintActions.handleOpen("設定成功！", "success"))
      .catch(() => hintActions.handleOpen("設定失敗！請重新整理試試看！", "warning"));
  };

  const handleReset = () => {
    setState({ name: "", iconUrl: "" });
    save("", "");
  };

  const handleSave = () => {
    if (!isValidName(state.name) || !isValidIcon(state.iconUrl)) {
      hintActions.handleOpen("發送人格式錯誤！", "error");
      return;
    }
    save(state.name, state.iconUrl);
  };

  return (
    <>
      <Paper sx={{ p: 2, my: 1 }}>
        <Grid container alignItems="flex-end" spacing={2}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <Typography variant="h6" component="h2">
              自訂機器人頭像
            </Typography>
            <Typography variant="body2" color="text.secondary">
              可設定群組獨特的機器人頭像
            </Typography>
            <TextField
              label="名稱"
              fullWidth
              value={state.name}
              onChange={(e) => handleInput(e, "name")}
              slotProps={{ htmlInput: { maxLength: 40 } }}
              {...(!isValidName(state.name)
                ? { error: true, helperText: "發送人長度限制0~20字" }
                : {})}
              sx={{ mt: 1 }}
            />
            <TextField
              label="頭像"
              fullWidth
              value={state.iconUrl}
              onChange={(e) => handleInput(e, "iconUrl")}
              {...(!isValidIcon(state.iconUrl)
                ? { error: true, helperText: "圖片格式需為https開頭，jpe(g),png結尾" }
                : {})}
              sx={{ mt: 1 }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Grid container direction="column" alignItems="center" spacing={1}>
              <Grid>
                <Typography variant="subtitle1">
                  {state.name ? `${state.name} from ` : null}布丁
                </Typography>
              </Grid>
              <Grid>
                <Avatar
                  alt="預設"
                  sx={{ width: 80, height: 80 }}
                  src={isValidIcon(state.iconUrl) ? state.iconUrl : undefined}
                />
              </Grid>
              <Grid>
                <ButtonGroup color="primary" disabled={!isLoggedIn}>
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
      </Paper>

      <HintSnackBar {...hint} onClose={hintActions.handleClose} />
    </>
  );
}
