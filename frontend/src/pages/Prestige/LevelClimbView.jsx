import { Alert } from "@mui/material";

/**
 * LevelClimbView — shown when user is below Lv.100.
 * Real implementation lands in M6-6.
 */
export default function LevelClimbView({ status, onRefresh, onMutationError }) {
  void status;
  void onRefresh;
  void onMutationError;
  return <Alert severity="info">LevelClimbView — implemented in M6-6</Alert>;
}
