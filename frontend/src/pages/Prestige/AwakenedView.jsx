import { Alert } from "@mui/material";

/**
 * AwakenedView — shown when user has prestiged 5+ times (fully awakened).
 * Real implementation lands in M6-6.
 */
export default function AwakenedView({ status, onRefresh, onMutationError }) {
  void status;
  void onRefresh;
  void onMutationError;
  return <Alert severity="info">AwakenedView — implemented in M6-6</Alert>;
}
