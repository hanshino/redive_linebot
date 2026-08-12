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

/* ------------------------------------------------------------ 委託方向 */

/**
 * 掛單有兩個方向：賣單（sell）與收購單（buy）。
 * 網址、API query、listing 欄位都用同一組字串，缺值一律當賣單，
 * 這樣第一階段留下來的連結與資料都還會照舊運作。
 */
export const normalizeOrderType = v => (String(v ?? "").toLowerCase() === "buy" ? "buy" : "sell");

export const orderTypeOf = listing => normalizeOrderType(listing?.orderType);

/**
 * 兩個方向的固定用字。不是抽象層，只是把「賣家／收購方」這種
 * 會在三個頁面同時出現、講錯就會誤導金流的字集中在一處。
 */
export const ORDER_COPY = {
  sell: {
    chip: "賣出",
    book: "出售中",
    noun: "賣單",
    poster: "賣家",
    best: "最低價",
    bestPrice: "最低售價",
    sortNote: "價格由低到高",
    action: "立即購買",
  },
  buy: {
    chip: "求購",
    book: "收購中",
    noun: "收購單",
    poster: "收購方",
    best: "最高價",
    bestPrice: "最高收購價",
    sortNote: "價格由高到低",
    action: "賣給他",
  },
};

/** 掛出這張單的人：賣單是賣家，收購單是收購方（買家）。 */
export const posterIdOf = listing =>
  orderTypeOf(listing) === "buy" ? (listing?.buyerId ?? listing?.sellerId) : listing?.sellerId;

export const posterNameOf = listing =>
  orderTypeOf(listing) === "buy"
    ? (listing?.buyerName ?? listing?.sellerName)
    : listing?.sellerName;

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
    title: "你已擁有此角色",
    detail: "角色為一人一隻，重複持有不會生效。",
  },
  IS_SELLER: { title: "這是你自己的掛單，無法購買" },
  NOT_OPEN: { title: "此委託已結束，無法再操作" },
  LISTING_CAP: {
    title: "最多只能同時掛 10 筆",
    detail: "賣單和收購單合計算，先去「我的掛單」取消一筆，或等現有的單成交，才能再掛新的。",
  },
  NOT_OWNED: {
    title: "你目前沒有這個角色",
    detail: "要掛賣單或賣給收購方，都得先真的持有這隻角色。",
  },
  ALREADY_LISTED: { title: "這個角色你已經有一張掛單了" },
  INVALID_PRICE: { title: "價格只能填 1 ～ 10,000,000" },

  /* ---- 收購單 ---- */
  INVALID_ORDER_TYPE: {
    title: "委託方向不正確",
    detail: "請回上一頁重新操作，網址可能被改過。",
  },
  WRONG_ORDER_TYPE: {
    title: "這筆委託不是用這種方式成交的",
    detail: "賣單要用購買、收購單要用賣出，請重新整理後再試一次。",
  },
  ALREADY_REQUESTED: {
    title: "這個角色你已經有一張收購單了",
    detail: "同一個角色同時只能掛一張收購單，先取消原本那張再改價。",
  },
  IS_BUYER: {
    title: "這是你自己發的收購單，無法賣給自己",
  },
  IS_REQUESTER: {
    title: "這是你自己發的收購單，無法賣給自己",
  },
  ALREADY_OWNED_REQUESTER: {
    title: "收購方已經有這個角色了，收購單已失效",
    detail: "系統已自動下架這筆收購單，並把預扣的女神石全額退還給對方。",
  },
  NOT_ENOUGH_TO_RESERVE: {
    title: "女神石不足，無法發布收購單",
    detail: "發布時就會先預扣全額，請先確認餘額夠付出價金額。",
  },
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
