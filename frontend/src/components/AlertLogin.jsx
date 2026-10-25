import { Alert, Button } from "@mui/material";
import useLiff from "../context/useLiff";

export default function AlertLogin() {
  const { login } = useLiff();

  return (
    <Alert
      severity="warning"
      sx={{ mt: 2, alignItems: "center" }}
      action={
        <Button color="inherit" onClick={login} sx={{ minHeight: 44 }}>
          登入
        </Button>
      }
    >
      請先登入再使用這個功能
    </Alert>
  );
}
