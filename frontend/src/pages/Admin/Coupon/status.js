export function deriveStatus(coupon, now = new Date()) {
  const start = coupon.start_at ? new Date(coupon.start_at) : null;
  const end = coupon.end_at ? new Date(coupon.end_at) : null;
  if (start && now < start) return "upcoming";
  if (end && now > end) return "expired";
  return "active";
}

export const STATUS_META = {
  active: { label: "進行中", color: "success" },
  upcoming: { label: "尚未啟用", color: "warning" },
  expired: { label: "已過期", color: "default" },
};
