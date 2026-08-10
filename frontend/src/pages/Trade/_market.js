/* =========================================================================
 * 公開市場 / 角色委託所 —— 共用計算、格式化、狀態對應與版面零件
 * 舊的一對一交易用語（STATUS 0/1/-1、ROLE）留在 _shared.jsx，
 * 兩套字彙混在一起只會讓人猜錯，所以這裡另開一個模組。
 * ====================================================================== */

export const FEE_PERCENT = 5;
export const PRICE_MIN = 1;
export const PRICE_MAX = 10000000;
export const MAX_OPEN_FALLBACK = 10;

/** 手續費無條件進位，實收為售價扣掉手續費。與後端同一條公式。 */
export const calcFee = price => Math.ceil((price * FEE_PERCENT) / 100);
export const calcNet = price => price - calcFee(price);

/** 金額一律有千分位。 */
export const fmtStone = n => Number(n ?? 0).toLocaleString("en-US");

/** 數字欄位對齊用（等寬數字）。 */
export const NUMS = { fontVariantNumeric: "tabular-nums" };

const pad = n => String(n).padStart(2, "0");

/** MM/DD HH:mm */
export function fmtShortDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** MM/DD */
export function fmtShortDay(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export const LISTING_STATUS = {
  open: { label: "開放中", color: "primary" },
  sold: { label: "已成交", color: "success" },
  cancelled: { label: "已取消", color: "default" },
  invalid: { label: "已失效", color: "error" },
};

/**
 * 後端錯誤碼 → 文案。UI 一律看 code，認不得的才退回 message。
 */
export const MARKET_ERROR = {
  ALREADY_TAKEN: {
    title: "此委託已被其他玩家買走或取消",
    detail: "你的女神石沒有被扣款。",
  },
  SELLER_LOST_ITEM: {
    title: "賣家已無此角色，委託已失效",
    detail: "系統已自動下架這筆委託，沒有任何女神石異動。",
  },
  INSUFFICIENT_FUNDS: { title: "女神石不足，無法購買" },
  ALREADY_OWNED: {
    title: "你已擁有此角色，無法購買",
    detail: "角色為一人一隻，重複持有不會生效。",
  },
  IS_SELLER: { title: "這是你自己的掛單，無法購買" },
  NOT_OPEN: { title: "此委託已結束，無法購買" },
  LISTING_CAP: {
    title: "最多只能同時上架 10 筆",
    detail: "先去「我的掛單」取消一筆，或等現有的賣單成交，才能再掛新的。",
  },
  NOT_OWNED: { title: "你目前沒有這個角色，無法掛單" },
  ALREADY_LISTED: { title: "這個角色你已經有一張掛單了" },
  INVALID_PRICE: { title: "售價只能填 1 ～ 10,000,000" },
};

export function errorInfo(err, fallback = "操作失敗，請稍後再試") {
  const data = err?.response?.data;
  const known = data?.code ? MARKET_ERROR[data.code] : null;
  return {
    code: data?.code ?? null,
    title: known?.title ?? data?.message ?? fallback,
    detail: known?.detail ?? null,
    data: data ?? null,
  };
}

export function errorText(err, fallback) {
  const { title, detail } = errorInfo(err, fallback);
  return detail ? `${title}，${detail}` : title;
}

/** 沒有頭像圖時，用角色編號推一個穩定的漸層底色，跟設計稿一致。 */
export function charGradient(itemId) {
  const h = (parseInt(itemId, 10) * 7 || 0) % 360;
  return `linear-gradient(135deg, hsl(${h} 62% 58%), hsl(${(h + 38) % 360} 66% 44%))`;
}

/** 賣家 / 買家名稱可能是 null（profile 查不到），統一補一個可讀的字。 */
export const displayName = n => n || "未知玩家";
