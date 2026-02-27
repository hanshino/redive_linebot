import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Box, Grid, Container, Paper, Typography, TextField, Button, Avatar,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
  useMediaQuery, useTheme,
} from "@mui/material";
import { FullPageLoading } from "../../components/Loading";
import ConfigCard from "../../components/GroupConfig/ConfigCard";
import SenderInput from "../../components/GroupConfig/SenderInput";
import * as GroupAPI from "../../services/group";

/* ---------- GuildHeadInfo ---------- */
function GuildHeadInfo({ groupName, pictureUrl, count }) {
  return (
    <Paper sx={{ mb: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 2 }}>
        <Avatar
          variant="square"
          sx={{ width: 80, height: 80 }}
          alt={groupName}
          src={pictureUrl || undefined}
        />
        <Box>
          <Typography variant="subtitle1">
            群組名稱 <b>{groupName}</b>
          </Typography>
          <Typography variant="subtitle1">
            群組人數 <b>{count}</b>
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}

/* ---------- WebhookInput ---------- */
function WebhookInput({ DiscordWebhook, modifyTrigger, isLoggedIn }) {
  const { groupId } = useParams();
  const [webhook, setWebhook] = useState(DiscordWebhook);
  const [testBlock, setTestBlock] = useState(false);

  useEffect(() => {
    setWebhook(DiscordWebhook);
  }, [DiscordWebhook]);

  const handleSave = () => {
    GroupAPI.setDiscordWebhook(groupId, webhook).then(modifyTrigger);
  };

  const handleRemove = () => {
    GroupAPI.removeDiscordWebhook(groupId).then(modifyTrigger);
  };

  const handleTest = () => {
    setTestBlock(true);
    GroupAPI.testDiscordWebhook(webhook);
    setTimeout(() => setTestBlock(false), 10000);
  };

  return (
    <Paper sx={{ my: 1, p: 2 }}>
      <Typography variant="h6" component="h2">
        Discord Webhook 綁定
      </Typography>
      <Typography variant="body2" color="text.secondary">
        可將 Line 訊息，即時轉發至 Discord 指定頻道
      </Typography>
      <Grid container spacing={1} sx={{ mt: 1 }} alignItems="center">
        <Grid size={{ xs: 12, sm: 8 }}>
          <TextField
            label="Discord Webhook"
            fullWidth
            disabled={!isLoggedIn}
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
          />
        </Grid>
        <Grid size={{ xs: 4, sm: 1 }}>
          <Button disabled={testBlock} onClick={handleTest} sx={{ m: 1, mb: 0 }}>
            測試
          </Button>
        </Grid>
        <Grid size={{ xs: 4, sm: 1 }}>
          <Button
            color="primary"
            disabled={!isLoggedIn}
            onClick={handleSave}
            sx={{ m: 1, mb: 0 }}
          >
            連結
          </Button>
        </Grid>
        <Grid size={{ xs: 4, sm: 1 }}>
          <Button
            color="secondary"
            disabled={!isLoggedIn}
            onClick={handleRemove}
            sx={{ m: 1, mb: 0 }}
          >
            解除
          </Button>
        </Grid>
      </Grid>
    </Paper>
  );
}

/* ---------- WelcomeMessageInput ---------- */
function WelcomeMessageInput({ WelcomeMessage, modifyTrigger, isLoggedIn }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { groupId } = useParams();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage(WelcomeMessage);
  }, [WelcomeMessage]);

  const handleSave = () => {
    setOpen(false);
    GroupAPI.setWelcomeMessage(groupId, message).then(modifyTrigger);
  };

  return (
    <>
      <Paper sx={{ my: 1, p: 2 }}>
        <Typography variant="h6" component="h2">
          加入歡迎訊息
        </Typography>
        <Typography variant="body2" color="text.secondary">
          可設定新成員加入發送特定訊息。
        </Typography>
        <Grid container spacing={1} sx={{ mt: 1 }} alignItems="center">
          <Grid size={{ xs: 12, sm: 10 }}>
            <TextField
              label="歡迎訊息"
              disabled
              variant="filled"
              fullWidth
              multiline
              value={message}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 2 }}>
            <Button
              color="primary"
              onClick={() => setOpen(true)}
              disabled={!isLoggedIn}
              sx={{ m: 1 }}
            >
              編輯
            </Button>
          </Grid>
        </Grid>
      </Paper>

      <Dialog
        fullScreen={fullScreen}
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        sx={{ minWidth: 320 }}
      >
        <DialogTitle>加入歡迎訊息</DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                label="訊息"
                fullWidth
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                multiline
                rows={4}
              />
            </Grid>
            <Grid>
              <Button
                variant="contained"
                color="primary"
                onClick={() => setMessage((m) => `${m} {UserName}`)}
              >
                使用者名稱
              </Button>
            </Grid>
            <Grid>
              <Button
                variant="contained"
                color="primary"
                onClick={() => setMessage((m) => `${m} {GroupName}`)}
              >
                群組名稱
              </Button>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button color="primary" onClick={handleSave}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ---------- FeatureCards ---------- */
function FeatureCards({ datas, config, handle, isLoggedIn }) {
  return (
    <Grid container spacing={2} sx={{ mt: 1 }}>
      {datas.map((data) => (
        <Grid size={{ xs: 12, sm: 4 }} key={data.name}>
          <ConfigCard
            {...data}
            status={config[data.name]}
            handle={handle}
            isLoggedIn={isLoggedIn}
          />
        </Grid>
      ))}
    </Grid>
  );
}

/* ---------- GroupConfig (main export) ---------- */
export default function GroupConfig() {
  const { groupId } = useParams();
  const isLoggedIn = window.liff?.isLoggedIn?.() ?? false;
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState({
    groupId: "",
    groupName: "",
    pictureUrl: "",
    count: 0,
  });
  const [state, setState] = useState({
    GroupConfigData: [],
    GroupConfig: {
      Battle: "Y",
      PrincessCharacter: "Y",
      CustomerOrder: "Y",
      GlobalOrder: "Y",
      Gacha: "Y",
      PrincessInformation: "Y",
    },
    DiscordWebhook: "",
    WelcomeMessage: "",
    Sender: { name: "", iconUrl: "" },
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [GroupConfigData, Config, Info] = await Promise.all([
        GroupAPI.fetchGroupConfigData(),
        GroupAPI.fetchGroupConfig(groupId),
        GroupAPI.getGroupInfo(groupId),
      ]);

      const { GroupConfig: gc, DiscordWebhook, WelcomeMessage, Sender } = Config;

      setInfo((prev) => ({ ...prev, ...Info }));
      setState((prev) => ({
        ...prev,
        GroupConfigData,
        GroupConfig: gc,
        DiscordWebhook,
        WelcomeMessage,
        Sender: { ...prev.Sender, ...Sender },
      }));
    } catch {
      // silently handle errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "群組設定";
    fetchData();
  }, []);

  const writeConfig = (name, status) => {
    return GroupAPI.switchGroupConfig(groupId, name, status ? 1 : 0);
  };

  const setSender = (name, iconUrl) => {
    setLoading(true);
    return GroupAPI.setSender(groupId, { name, iconUrl })
      .then(fetchData)
      .finally(() => setLoading(false));
  };

  return (
    <Container>
      <Box sx={{ p: 2 }}>
        <GuildHeadInfo {...info} />

        {!isLoggedIn && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            登入後即可進行操作！
          </Alert>
        )}

        <SenderInput isLoggedIn={isLoggedIn} action={setSender} Sender={state.Sender} />

        <WelcomeMessageInput
          WelcomeMessage={state.WelcomeMessage}
          modifyTrigger={fetchData}
          isLoggedIn={isLoggedIn}
        />

        <WebhookInput
          DiscordWebhook={state.DiscordWebhook}
          modifyTrigger={fetchData}
          isLoggedIn={isLoggedIn}
        />

        <FeatureCards
          datas={state.GroupConfigData}
          config={state.GroupConfig}
          handle={writeConfig}
          isLoggedIn={isLoggedIn}
        />
      </Box>

      <FullPageLoading open={loading} />
    </Container>
  );
}
