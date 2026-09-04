import { Fragment, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  Stack,
  Container,
  Divider,
  List,
  Typography,
  TextField,
  Button,
  Avatar,
  Chip,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import { FullPageLoading } from "../../components/Loading";
import SectionCard from "../../components/SectionCard";
import FeatureToggleItem from "../../components/GroupConfig/FeatureToggleItem";
import SenderInput from "../../components/GroupConfig/SenderInput";
import * as GroupAPI from "../../services/group";

/* ---------- GuildHeadInfo ---------- */
function GuildHeadInfo({ groupName, pictureUrl, count }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
          <Avatar
            variant="rounded"
            sx={{ width: { xs: 56, sm: 72 }, height: { xs: 56, sm: 72 }, flexShrink: 0 }}
            alt={groupName}
            src={pictureUrl || undefined}
          />
          <Stack spacing={0.75} sx={{ minWidth: 0, alignItems: "flex-start" }}>
            <Typography variant="caption" color="text.secondary">
              群組設定
            </Typography>
            <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }} noWrap>
              {groupName}
            </Typography>
            <Chip
              size="small"
              variant="outlined"
              icon={<PeopleIcon />}
              label={`${count} 人`}
              sx={{ color: "text.secondary" }}
            />
          </Stack>
        </Stack>
      </CardContent>
    </Card>
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
    <SectionCard title="Discord Webhook 綁定" description="將群組訊息即時轉發到指定的 Discord 頻道">
      <TextField
        label="Discord Webhook"
        fullWidth
        disabled={!isLoggedIn}
        value={webhook}
        onChange={e => setWebhook(e.target.value)}
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button disabled={testBlock} onClick={handleTest}>
          測試
        </Button>
        <Button variant="contained" color="primary" disabled={!isLoggedIn} onClick={handleSave}>
          連結
        </Button>
        <Button color="secondary" disabled={!isLoggedIn} onClick={handleRemove}>
          解除
        </Button>
      </Stack>
    </SectionCard>
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
      <SectionCard title="加入歡迎訊息" description="新成員加入群組時，自動發送這段訊息">
        <TextField label="歡迎訊息" disabled variant="filled" fullWidth multiline value={message} />
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            color="primary"
            onClick={() => setOpen(true)}
            disabled={!isLoggedIn}
          >
            編輯
          </Button>
        </Stack>
      </SectionCard>
      <Dialog
        fullScreen={fullScreen}
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        sx={{ minWidth: 320 }}
      >
        <DialogTitle>加入歡迎訊息</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="訊息"
              fullWidth
              value={message}
              onChange={e => setMessage(e.target.value)}
              multiline
              rows={4}
            />
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <Typography variant="body2" color="text.secondary" sx={{ width: "100%" }}>
                點下方按鈕插入變數
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setMessage(m => `${m} {UserName}`)}
              >
                使用者名稱
              </Button>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => setMessage(m => `${m} {GroupName}`)}
              >
                群組名稱
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" color="primary" onClick={handleSave}>
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
    <SectionCard title="功能開關" description="關閉後，該功能的指令在這個群組不會有反應">
      <List disablePadding>
        {datas.map((data, index) => (
          <Fragment key={data.name}>
            {index > 0 && <Divider component="li" />}
            <FeatureToggleItem
              {...data}
              status={config[data.name]}
              handle={handle}
              isLoggedIn={isLoggedIn}
            />
          </Fragment>
        ))}
      </List>
    </SectionCard>
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
      WorldBossAttack: "N",
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

      setInfo(prev => ({ ...prev, ...Info }));
      setState(prev => ({
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
    <Container maxWidth="md" sx={{ py: 1 }}>
      <Stack spacing={2}>
        <GuildHeadInfo {...info} />

        {!isLoggedIn && <Alert severity="warning">登入後即可進行操作！</Alert>}

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
      </Stack>

      <FullPageLoading open={loading} />
    </Container>
  );
}
