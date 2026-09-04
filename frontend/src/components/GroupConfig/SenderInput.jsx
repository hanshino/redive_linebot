import { useState, useEffect } from "react";
import { Grid, Stack, Typography, TextField, ButtonGroup, Button, Avatar } from "@mui/material";
import SectionCard from "../SectionCard";
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
    setState(prev => ({ ...prev, [type]: e.target.value }));
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
      <SectionCard title="自訂機器人頭像" description="讓布丁在這個群組使用專屬的名稱與頭像">
        <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, sm: 7, md: 8 }}>
            <Stack spacing={2}>
              <TextField
                label="名稱"
                fullWidth
                value={state.name}
                onChange={e => handleInput(e, "name")}
                slotProps={{ htmlInput: { maxLength: 40 } }}
                {...(!isValidName(state.name)
                  ? { error: true, helperText: "發送人長度限制0~20字" }
                  : {})}
              />
              <TextField
                label="頭像"
                fullWidth
                value={state.iconUrl}
                onChange={e => handleInput(e, "iconUrl")}
                {...(!isValidIcon(state.iconUrl)
                  ? { error: true, helperText: "圖片格式需為https開頭，jpe(g),png結尾" }
                  : {})}
              />
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, sm: 5, md: 4 }}>
            {/* 預覽區：左邊輸入什麼，右邊立刻看到訊息會長怎樣 */}
            <Stack
              spacing={1.25}
              sx={{
                alignItems: "center",
                p: 2,
                borderRadius: 2,
                border: 1,
                borderColor: "divider",
                bgcolor: "action.hover",
              }}
            >
              <Avatar
                alt="預設"
                sx={{ width: 80, height: 80 }}
                src={isValidIcon(state.iconUrl) ? state.iconUrl : undefined}
              />
              <Typography variant="body2" color="text.secondary" align="center">
                {state.name ? `${state.name} from ` : null}布丁
              </Typography>
              <ButtonGroup color="primary" disabled={!isLoggedIn} size="small">
                <Button variant="outlined" onClick={handleReset}>
                  重設
                </Button>
                <Button variant="outlined" color="primary" onClick={handleSave}>
                  召喚
                </Button>
              </ButtonGroup>
            </Stack>
          </Grid>
        </Grid>
      </SectionCard>
      <HintSnackBar {...hint} onClose={hintActions.handleClose} />
    </>
  );
}
