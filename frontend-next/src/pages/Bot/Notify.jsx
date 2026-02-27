import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Box, Grid, IconButton, Typography, Button,
  Card, CardHeader, CardContent, CardActions, Switch,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Alert, AlertTitle,
} from "@mui/material";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";
import { FullPageLoading } from "../../components/Loading";
import * as NotifyAPI from "../../services/notify";
import { isLiffLoggedIn } from "../../utils/liff";

function useOption() {
  const [loading, setLoading] = useState(false);
  const [isBinding, setBinding] = useState(false);
  const [reload, setReload] = useState(0);
  const [option, setOption] = useState({});
  const [open, setOpen] = useState(false);
  const isLoggedIn = isLiffLoggedIn();

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSwitch = (key, status) => {
    setLoading(true);
    NotifyAPI.setStatus(key, status).then(() => setReload((old) => old + 1));
  };

  const forceReload = () => setReload((old) => old + 1);

  useEffect(() => {
    setLoading(true);
    if (isLoggedIn) {
      NotifyAPI.getNotifyData()
        .then((res) => {
          setOption(res);
          setBinding(true);
        })
        .catch(() => setBinding(false))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [reload]);

  return { loading, isLoggedIn, isBinding, option, open, handleOpen, handleClose, handleSwitch, forceReload };
}

export default function Notify() {
  const { loading, isBinding, option, isLoggedIn, ...actions } = useOption();

  useEffect(() => {
    document.title = "訂閱通知設定頁面";
  }, []);

  return (
    <>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>訂閱系統</Typography>
            <Typography variant="body2" color="text.secondary">隨時接收最新資訊</Typography>
          </Box>
          <IconButton color="secondary" onClick={actions.handleOpen}>
            <SettingsIcon />
          </IconButton>
        </Box>

        {isBinding ? (
          <Alert severity="success">綁定中！需更改設定請點擊標題右邊齒輪！</Alert>
        ) : (
          <Alert severity="warning">
            <AlertTitle>注意！</AlertTitle>
            {isLoggedIn
              ? "尚未綁定LINE Notify！點擊標題右邊齒輪進行設定吧！"
              : "尚未登入！請先點擊右上角的登入鈕"}
          </Alert>
        )}

        {isBinding && option.subData?.map((data, index) => (
          <Card key={index}>
            <CardHeader title={data.title} />
            <CardContent>
              <Typography variant="body2" color="text.secondary">{data.description}</Typography>
            </CardContent>
            <CardActions>
              <Switch
                checked={data.status === 1}
                onChange={(e) => actions.handleSwitch(data.key, e.target.checked ? 1 : 0)}
                color="primary"
              />
            </CardActions>
          </Card>
        ))}
      </Box>

      <SettingsDialog
        open={actions.open}
        onClose={actions.handleClose}
        isBinding={isBinding}
        forceReload={actions.forceReload}
      />
      <FullPageLoading open={loading} />
    </>
  );
}

function SettingsDialog({ open, onClose, isBinding, forceReload }) {
  const revoke = () => {
    NotifyAPI.revokeNotify().then(forceReload);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>
        設定
        <IconButton onClick={onClose} sx={{ position: "absolute", right: 8, top: 8, color: "grey.500" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          此系統是藉由Line Notify綁定來達成，因此需將您轉至Line服務進行綁定，完成後可藉由 訊息測試 的按鈕進行測試！
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button disabled={!isBinding} variant="outlined" onClick={() => NotifyAPI.notifyTest()}>
          訊息測試
        </Button>
        <Button color="error" disabled={!isBinding} variant="outlined" onClick={revoke}>
          取消綁定
        </Button>
        <Button
          color="primary"
          disabled={isBinding}
          variant="outlined"
          component={Link}
          to="/bot/notify/binding"
        >
          綁定
        </Button>
      </DialogActions>
    </Dialog>
  );
}
