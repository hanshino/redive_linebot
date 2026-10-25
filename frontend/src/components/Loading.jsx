import { Backdrop, CircularProgress } from "@mui/material";

export function FullPageLoading({ open = true }) {
  return (
    <Backdrop
      open={open}
      role="status"
      aria-label="載入中"
      sx={{ zIndex: t => t.zIndex.drawer + 1, color: "common.white" }}
    >
      <CircularProgress color="inherit" aria-hidden />
    </Backdrop>
  );
}
