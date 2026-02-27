import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
  Button,
} from "@mui/material";
import { FullPageLoading } from "../../components/Loading";
import useLiff from "../../context/useLiff";
import liff from "@line/liff";

export default function Binding() {
  const { loggedIn, liffContext } = useLiff();
  return loggedIn ? <RedirectToBinding liffContext={liffContext} /> : <LoginAlert />;
}

function RedirectToBinding({ liffContext }) {
  const { userId } = liffContext;
  const params = new URLSearchParams();
  params.set("response_type", "code");
  params.set("client_id", "CQZhxtEo0NeSgGRQ2LNeEp");
  params.set("redirect_uri", `${window.location.origin}/api/Bot/Notify/Callback`);
  params.set("scope", "notify");
  params.set("state", userId);

  window.location.href = "https://notify-bot.line.me/oauth/authorize?" + params.toString();

  return <FullPageLoading />;
}

function LoginAlert() {
  const navigate = useNavigate();

  return (
    <Dialog open>
      <DialogTitle>Oops! 請問您哪位?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          為了知道您是誰，必須先進行 Line 的登入，通知訊息才能跟著您的 Line!
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button color="secondary" variant="outlined" onClick={() => navigate("/bot/notify")}>
          取消
        </Button>
        <Button color="primary" variant="outlined" onClick={() => {
          window.localStorage.setItem("reactRedirectUri", "/bot/notify");
          liff.login();
        }}>
          登入
        </Button>
      </DialogActions>
    </Dialog>
  );
}
