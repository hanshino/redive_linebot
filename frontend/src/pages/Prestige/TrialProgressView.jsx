import { Alert } from "@mui/material";

/**
 * TrialProgressView — shown when user has an active trial in progress.
 * Also rendered as compact side-card when Lv < 100 with active trial.
 * Real implementation lands in M6-6.
 */
export default function TrialProgressView({ status, onRefresh, onMutationError, compact }) {
  void status;
  void onRefresh;
  void onMutationError;
  void compact;
  return <Alert severity="info">TrialProgressView — implemented in M6-6</Alert>;
}
