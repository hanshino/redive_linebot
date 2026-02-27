import { Alert, AlertTitle } from "@mui/material";

export default function AlertLogin() {
  return (
    <Alert severity="warning" sx={{ mt: 2 }}>
      <AlertTitle>Oops! 你好像還沒登入！</AlertTitle>
      進行任何操作前，請先點擊右上角的登入！
    </Alert>
  );
}
