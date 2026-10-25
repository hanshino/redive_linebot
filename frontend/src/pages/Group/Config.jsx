import { Fragment, useState, useEffect, useRef, useCallback } from "react";
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
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import PeopleIcon from "@mui/icons-material/People";
import AlertLogin from "../../components/AlertLogin";
import SectionCard from "../../components/SectionCard";
import AlertDialog from "../../components/AlertDialog";
import HintSnackBar from "../../components/HintSnackBar";
import LoadError from "../../components/LoadError";
import useHintBar from "../../hooks/useHintBar";
import useAlertDialog from "../../hooks/useAlertDialog";
import FeatureToggleItem from "../../components/GroupConfig/FeatureToggleItem";
import SenderInput from "../../components/GroupConfig/SenderInput";
import * as GroupAPI from "../../services/group";
import useLiff from "../../context/useLiff";

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
function WebhookInput({ DiscordWebhook, onChange, isLoggedIn, notify }) {
  const { groupId } = useParams();
  const [webhook, setWebhook] = useState(DiscordWebhook);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [alertState, { handleOpen, handleClose, setBusy }] = useAlertDialog();

  useEffect(() => {
    setWebhook(DiscordWebhook);
  }, [DiscordWebhook]);

  const hasWebhook = webhook.trim() !== "";

  const handleSave = async () => {
    setSaving(true);
    try {
      await GroupAPI.setDiscordWebhook(groupId, webhook);
      onChange(webhook);
      notify("已連結 Discord Webhook", "success");
    } catch {
      notify("連結失敗，請確認網址是否正確後再試一次", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    try {
      await GroupAPI.removeDiscordWebhook(groupId);
      onChange("");
      setWebhook("");
      handleClose();
      notify("已解除 Discord 綁定", "success");
    } catch {
      setBusy(false);
      notify("解除失敗，請稍後再試", "error");
    }
  };

  const confirmRemove = () =>
    handleOpen({
      title: "解除 Discord 綁定",
      description: "這個群組的訊息不會再轉發到 Discord。",
      submitText: "解除",
      destructive: true,
      onSubmit: handleRemove,
    });

  const handleTest = async () => {
    setTesting(true);
    try {
      await GroupAPI.testDiscordWebhook(webhook);
      notify("測試訊息已送出，請到 Discord 頻道確認", "success");
    } catch {
      notify("測試失敗，請確認 Webhook 網址是否正確", "error");
    } finally {
      setTesting(false);
    }
  };

  return (
    <SectionCard title="Discord Webhook 綁定">
      <TextField
        label="Discord Webhook"
        fullWidth
        disabled={!isLoggedIn || saving}
        value={webhook}
        onChange={e => setWebhook(e.target.value)}
        placeholder="https://discord.com/api/webhooks/…"
      />
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button
          disabled={!isLoggedIn || !hasWebhook || testing || saving}
          onClick={handleTest}
          sx={{ minHeight: 44 }}
        >
          {testing ? "測試中…" : "測試"}
        </Button>
        <Button
          variant="contained"
          color="primary"
          disabled={!isLoggedIn || !hasWebhook || saving}
          onClick={handleSave}
          sx={{ minHeight: 44 }}
        >
          {saving ? "連結中…" : "連結"}
        </Button>
        <Button
          color="error"
          disabled={!isLoggedIn || !DiscordWebhook || saving}
          onClick={confirmRemove}
          sx={{ minHeight: 44 }}
        >
          解除
        </Button>
      </Stack>
      <AlertDialog
        open={alertState.open}
        onClose={handleClose}
        onSubmit={alertState.onSubmit}
        title={alertState.title}
        description={alertState.description}
        submitText={alertState.submitText}
        destructive={alertState.destructive}
        busy={alertState.busy}
      />
    </SectionCard>
  );
}

/* ---------- WelcomeMessageInput ---------- */
function WelcomeMessageInput({ WelcomeMessage, onChange, isLoggedIn, notify }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const { groupId } = useParams();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    setMessage(WelcomeMessage);
  }, [WelcomeMessage]);

  const handleOpen = () => {
    setError("");
    setOpen(true);
  };

  const handleCancel = () => {
    if (saving) return;
    // 取消要丟掉沒存的修改，下次打開看到的是已儲存的內容
    setMessage(WelcomeMessage);
    setOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await GroupAPI.setWelcomeMessage(groupId, message);
      onChange(message);
      setOpen(false);
      notify("已儲存歡迎訊息", "success");
    } catch {
      setError("儲存失敗，你的內容還在，請稍後再試一次");
    } finally {
      setSaving(false);
    }
  };

  // 在游標位置插入變數（有選取文字就取代選取範圍），而不是一律接在最後面
  const insertVariable = variable => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? message.length;
    const end = input?.selectionEnd ?? message.length;
    const next = message.slice(0, start) + variable + message.slice(end);
    const caret = start + variable.length;
    setMessage(next);
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(caret, caret);
    });
  };

  return (
    <>
      <SectionCard title="加入歡迎訊息">
        <TextField
          label="歡迎訊息"
          disabled
          variant="filled"
          fullWidth
          multiline
          value={WelcomeMessage}
        />
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOpen}
            disabled={!isLoggedIn}
            sx={{ minHeight: 44 }}
          >
            編輯
          </Button>
        </Stack>
      </SectionCard>
      <Dialog
        fullScreen={fullScreen}
        open={open}
        onClose={handleCancel}
        fullWidth
        sx={{ minWidth: 320 }}
      >
        <DialogTitle>加入歡迎訊息</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              label="訊息"
              fullWidth
              value={message}
              onChange={e => setMessage(e.target.value)}
              multiline
              rows={4}
              inputRef={inputRef}
              disabled={saving}
            />
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
              <Typography variant="body2" sx={{ color: "text.secondary", width: "100%" }}>
                插入變數
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                disabled={saving}
                onClick={() => insertVariable("{UserName}")}
                sx={{ minHeight: 44 }}
              >
                使用者名稱
              </Button>
              <Button
                variant="outlined"
                color="primary"
                disabled={saving}
                onClick={() => insertVariable("{GroupName}")}
                sx={{ minHeight: 44 }}
              >
                群組名稱
              </Button>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancel} disabled={saving} sx={{ minHeight: 44 }}>
            取消
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={saving}
            sx={{ minHeight: 44 }}
          >
            {saving ? "儲存中…" : "儲存"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/* ---------- FeatureCards ---------- */
function FeatureCards({ datas, config, handle, isLoggedIn }) {
  return (
    <SectionCard title="功能開關">
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

/* ---------- Loading skeleton ---------- */
function ConfigSkeleton() {
  return (
    <Stack spacing={2} aria-busy="true" aria-label="載入群組設定中">
      <Skeleton variant="rounded" height={104} animation="wave" />
      <Skeleton variant="rounded" height={220} animation="wave" />
      <Skeleton variant="rounded" height={160} animation="wave" />
      <Skeleton variant="rounded" height={200} animation="wave" />
    </Stack>
  );
}

/* ---------- GroupConfig (main export) ---------- */
export default function GroupConfig() {
  const { groupId } = useParams();
  const { loggedIn: isLoggedIn } = useLiff();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [hint, hintActions] = useHintBar();
  const [info, setInfo] = useState({
    groupId: "",
    groupName: "",
    pictureUrl: "",
    count: 0,
  });
  // GroupConfig 在真正載入完成前是 null：失敗時不能拿寫死的預設值冒充群組目前的設定
  const [state, setState] = useState({
    GroupConfigData: [],
    GroupConfig: null,
    DiscordWebhook: "",
    WelcomeMessage: "",
    Sender: { name: "", iconUrl: "" },
  });

  const fetchData = useCallback(async () => {
    // 群組資料的 API 需要登入；未登入就不要打，免得 401 被誤顯示成「網路失敗」
    if (!isLoggedIn) return;
    setLoading(true);
    setLoadError(false);
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
        DiscordWebhook: DiscordWebhook ?? "",
        WelcomeMessage: WelcomeMessage ?? "",
        Sender: { ...prev.Sender, ...Sender },
      }));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [groupId, isLoggedIn]);

  useEffect(() => {
    document.title = "群組設定";
    fetchData();
  }, [fetchData]);

  const notify = hintActions.handleOpen;

  // 開關只在後端確認成功後才更新畫面上的狀態，失敗就維持原樣
  const writeConfig = async (name, enabled, title) => {
    try {
      await GroupAPI.switchGroupConfig(groupId, name, enabled ? 1 : 0);
      setState(prev => ({
        ...prev,
        GroupConfig: { ...prev.GroupConfig, [name]: enabled ? "Y" : "N" },
      }));
      notify(`已${enabled ? "開啟" : "關閉"}「${title}」`, "success");
      return true;
    } catch {
      notify(`「${title}」切換失敗，請稍後再試`, "error");
      return false;
    }
  };

  const setSender = async (name, iconUrl) => {
    await GroupAPI.setSender(groupId, { name, iconUrl });
    setState(prev => ({ ...prev, Sender: { name, iconUrl } }));
  };

  const renderBody = () => {
    if (!isLoggedIn) return <AlertLogin />;
    if (loading) return <ConfigSkeleton />;
    if (loadError || !state.GroupConfig) {
      return <LoadError message="群組設定載入失敗，請檢查網路後再試一次。" onRetry={fetchData} />;
    }
    return (
      <Stack spacing={2}>
        <GuildHeadInfo {...info} />

        {!isLoggedIn && <Alert severity="warning">登入後即可進行操作！</Alert>}

        <SenderInput isLoggedIn={isLoggedIn} action={setSender} Sender={state.Sender} />

        <WelcomeMessageInput
          WelcomeMessage={state.WelcomeMessage}
          onChange={WelcomeMessage => setState(prev => ({ ...prev, WelcomeMessage }))}
          isLoggedIn={isLoggedIn}
          notify={notify}
        />

        <WebhookInput
          DiscordWebhook={state.DiscordWebhook}
          onChange={DiscordWebhook => setState(prev => ({ ...prev, DiscordWebhook }))}
          isLoggedIn={isLoggedIn}
          notify={notify}
        />

        <FeatureCards
          datas={state.GroupConfigData}
          config={state.GroupConfig}
          handle={writeConfig}
          isLoggedIn={isLoggedIn}
        />
      </Stack>
    );
  };

  return (
    <Container maxWidth="md" sx={{ py: 1 }}>
      {renderBody()}
      <HintSnackBar {...hint} onClose={hintActions.handleClose} />
    </Container>
  );
}
