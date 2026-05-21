import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";

export const STATUS = {
  PENDING: 0,
  COMPLETED: 1,
  CANCELLED: -1,
};

export const ROLE = {
  SELLER: "seller",
  BUYER: "buyer",
  GUEST: "guest",
};

export const STATUS_MAP = {
  [STATUS.PENDING]: {
    label: "未交易",
    color: "warning",
    icon: <HourglassEmptyIcon sx={{ fontSize: "14px !important" }} />,
  },
  [STATUS.COMPLETED]: {
    label: "已交易",
    color: "success",
    icon: <CheckCircleIcon sx={{ fontSize: "14px !important" }} />,
  },
  [STATUS.CANCELLED]: {
    label: "已取消",
    color: "default",
    icon: <CancelIcon sx={{ fontSize: "14px !important" }} />,
  },
};

export function fmtDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function getViewerRole(market, viewerUserId) {
  if (!market || !viewerUserId) return ROLE.GUEST;
  if (market.seller_id === viewerUserId) return ROLE.SELLER;
  const targets = Array.isArray(market.sell_target_list) ? market.sell_target_list : [];
  if (targets.includes(viewerUserId)) return ROLE.BUYER;
  return ROLE.GUEST;
}

export const QUICK_PRICES = [100, 500, 1000, 5000, 10000];
