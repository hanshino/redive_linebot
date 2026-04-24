import { Alert } from "@mui/material";

/**
 * TrialSelectView — shown when user is Lv.100, no active trial, no unconsumed passed trial.
 * Real implementation lands in M6-5.
 */
export default function TrialSelectView({ status, onRefresh, onMutationError }) {
  void status;
  void onRefresh;
  void onMutationError;
  return <Alert severity="info">TrialSelectView — implemented in M6-5</Alert>;
}
