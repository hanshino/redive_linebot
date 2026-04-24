import { Alert } from "@mui/material";

/**
 * BlessingSelectView — shown when user is Lv.100 and has an unconsumed passed trial
 * (ready to choose a blessing and perform the prestige action).
 * Real implementation lands in M6-5.
 */
export default function BlessingSelectView({ status, onRefresh, onMutationError }) {
  void status;
  void onRefresh;
  void onMutationError;
  return <Alert severity="info">BlessingSelectView — implemented in M6-5</Alert>;
}
