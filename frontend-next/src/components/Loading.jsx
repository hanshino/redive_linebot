import { Backdrop, CircularProgress } from "@mui/material";

export function FullPageLoading({ open = true }) {
  return (
    <Backdrop open={open} sx={{ zIndex: (t) => t.zIndex.drawer + 1, color: "#fff" }}>
      <CircularProgress color="inherit" />
    </Backdrop>
  );
}

// For inline loading
export function InlineLoading() {
  return <CircularProgress size={24} />;
}
