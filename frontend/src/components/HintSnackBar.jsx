import { bottomNavSpace } from "./BottomNav";
import { Snackbar, Alert } from "@mui/material";

// 手機底部有固定的導覽列（見 BottomNav，56px + 安全區），提示要浮在它上方，不然會被蓋住。
const ABOVE_BOTTOM_NAV = `calc(${bottomNavSpace} + 8px)`;

export default function HintSnackBar({ open, message, severity = "info", onClose }) {
  return (
    <Snackbar
      open={open}
      autoHideDuration={3000}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{ bottom: { xs: ABOVE_BOTTOM_NAV, sm: 24 } }}
    >
      <Alert onClose={onClose} severity={severity} variant="filled" sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  );
}
