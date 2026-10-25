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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState({ name: Sender.name || "", iconUrl: Sender.iconUrl || "" });
  }, [Sender]);

  const handleInput = (e, type) => {
    setState(prev => ({ ...prev, [type]: e.target.value }));
  };

  const save = async (name, iconUrl) => {
    setSaving(true);
    try {
      await setSender(name, iconUrl);
      hintActions.handleOpen("已儲存機器人名稱與頭像", "success");
    } catch {
      hintActions.handleOpen("儲存失敗，請稍後再試一次", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setState({ name: "", iconUrl: "" });
    save("", "");
  };

  const handleSave = () => {
    if (!isValidName(state.name) || !isValidIcon(state.iconUrl)) {
      hintActions.handleOpen("名稱或頭像網址格式有誤，請先修正", "error");
      return;
    }
    save(state.name, state.iconUrl);
  };

  return (
    <>
      <SectionCard title="自訂機器人頭像">
        <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ alignItems: "center" }}>
          <Grid size={{ xs: 12, sm: 7, md: 8 }}>
            <Stack spacing={2}>
              <TextField
                label="名稱"
                fullWidth
                value={state.name}
                onChange={e => handleInput(e, "name")}
                slotProps={{ htmlInput: { maxLength: 40 } }}
                {...(!isValidName(state.name) ? { error: true, helperText: "名稱最多 20 字" } : {})}
              />
              <TextField
                label="頭像"
                fullWidth
                value={state.iconUrl}
                onChange={e => handleInput(e, "iconUrl")}
                placeholder="https://example.com/avatar.png"
                error={!isValidIcon(state.iconUrl)}
                helperText={
                  isValidIcon(state.iconUrl)
                    ? undefined
                    : "需為 https 開頭的 .jpg、.jpeg、.png 或 .tiff 圖片網址"
                }
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
                alt="頭像預覽"
                sx={{ width: 80, height: 80 }}
                src={isValidIcon(state.iconUrl) ? state.iconUrl : undefined}
              />
              <Typography variant="body2" align="center" sx={{ color: "text.secondary" }}>
                {state.name ? `${state.name} from ` : null}布丁
              </Typography>
              <ButtonGroup color="primary" disabled={!isLoggedIn || saving}>
                <Button variant="outlined" onClick={handleReset} sx={{ minHeight: 44 }}>
                  重設
                </Button>
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleSave}
                  sx={{ minHeight: 44 }}
                >
                  {saving ? "儲存中…" : "儲存"}
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
