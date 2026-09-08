/* =========================================================================
 * 公開市場 / 角色委託所 —— 共用計算、格式化、狀態對應與版面零件
 * 舊的一對一交易用語（STATUS 0/1/-1、ROLE）留在 _shared.jsx，
 * 兩套字彙混在一起只會讓人猜錯，所以這裡另開一個模組。
 * ====================================================================== */

export const FEE_PERCENT = 5;
export const PRICE_MIN = 1;
export const PRICE_MAX = 10000000;
export const MAX_OPEN_FALLBACK = 10;
/** 碎片片數上限，與後端 MAX_QUANTITY 同值。 */
export const QUANTITY_MAX = 9999;
/** 單價 × 數量的天花板，與後端 MAX_TOTAL 同值（等於 PRICE_MAX）。 */
export const TOTAL_MAX = 10000000;
/** 兌換一隻角色要幾片。後端 /api/character-fragments 會回真值，這只是還沒載到時的墊底。 */
export const REDEEM_COST_FALLBACK = 150;

/**
 * 手續費無條件進位，實收為成交總額扣掉手續費。與後端同一條公式。
 *
 * 傳進來的一定是**總額**（碎片單是單價 × 片數），不是每片單價。
 * 角色單 quantity 恆為 1，total === price，所以既有呼叫端不必改。
 */
export const calcFee = total => Math.ceil((total * FEE_PERCENT) / 100);
export const calcNet = total => total - calcFee(total);

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

/* ------------------------------------------------------------ 委託標的種類 */

/**
 * 標的有兩種：角色本體（character）與角色專屬碎片（fragment）。
 * 缺值一律當角色 —— 第二階段前的資料與連結都沒有這個欄位。
 */
export const normalizeItemKind = v =>
  String(v ?? "").toLowerCase() === "fragment" ? "fragment" : "character";

export const itemKindOf = listing => normalizeItemKind(listing?.itemKind);

export const isFragment = listing => itemKindOf(listing) === "fragment";

/** 碎片片數。角色單恆為 1，缺值也當 1，絕不讓 NaN 流進金額計算。 */
export const quantityOf = listing => {
  const n = Number(listing?.quantity);
  return Number.isInteger(n) && n > 0 ? n : 1;
};

/**
 * 這張單的實際金流金額 = 單價 × 片數。
 *
 * `price` 永遠是「每片／每隻」單價，`total` 才是買家付出 / 收購單預扣 / 退款的金額。
 * 後端已經算好 total 了，這裡只在它缺值（舊資料、mock）時自己乘一次。
 */
export const totalOf = listing => {
  const t = Number(listing?.total);
  if (Number.isFinite(t) && t > 0) return t;
  return Number(listing?.price ?? 0) * quantityOf(listing);
};

/**
 * 那隻角色的原生星數。
 *
 * 後端刻意把欄位分成兩個名字：角色單給 `star`、碎片單給 `baseStar`，
 * 就是為了不讓前端把「20 片 3★ 碎片」畫成「一隻 3★ 角色」。
 * 所以這裡照 kind 讀對應欄位，兩者之間**不做 fallback** ——
 * 讀錯欄位得到 undefined 比讀到一個看起來合理卻意義不同的數字安全。
 */
export const nativeStarOf = listing => (isFragment(listing) ? listing?.baseStar : listing?.star);

/**
 * 兩種標的的固定用字。
 *
 * 碎片跟角色的規則差很多（可累積、可無限持有、不 escrow），
 * 講錯就會讓人以為碎片也是「一人一份」，所以把字集中在這裡對齊。
 */
export const KIND_COPY = {
  character: {
    chip: "角色",
    unit: "隻",
    thing: "角色",
    book: "角色",
    pickTitle: "選擇角色",
  },
  fragment: {
    chip: "碎片",
    unit: "片",
    thing: "碎片",
    book: "碎片",
    pickTitle: "選擇角色碎片",
  },
};

/** 「宮子碎片」／「宮子」。碎片單的標題一定要帶「碎片」兩個字。 */
export const itemLabel = listing =>
  isFragment(listing) ? `${listing?.name ?? "角色"}碎片` : (listing?.name ?? "角色");

/** 「20 片」／「1 隻」。 */
export const fmtAmount = listing =>
  `${quantityOf(listing).toLocaleString("en-US")} ${KIND_COPY[itemKindOf(listing)].unit}`;

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

  /* ---- 碎片 ---- */
  INVALID_ITEM_KIND: {
    title: "委託標的種類不正確",
    detail: "請回上一頁重新操作，網址可能被改過。",
  },
  INVALID_QUANTITY: {
    title: "數量填得不對",
    detail: "碎片片數只能是 1 ～ 9,999 的整數，角色一次只能掛 1 隻。",
  },
  INVALID_TOTAL: {
    title: "總額超過上限",
    detail: "單價 × 片數不能超過 10,000,000 女神石，請調低單價或片數。",
  },
  INSUFFICIENT_FRAGMENTS: {
    title: "碎片不足",
    detail: "碎片可能已經被你回收、兌換或掛在別的單上了，重新整理看看目前的數量。",
  },
  SELLER_LOST_FRAGMENTS: {
    title: "賣家的碎片已不足，委託已失效",
    detail: "系統已自動下架這筆委託，你的女神石沒有被扣款。",
  },
  ITEM_NOT_FOUND: { title: "找不到這個角色" },
};

/**
 * 碎片情境專用的覆寫。
 *
 * 有幾個碼在角色與碎片下語意完全不同，最要命的是 ALREADY_OWNED：
 * 角色的說法是「一人一隻，重複持有不會生效」，但碎片可以無限累積，
 * 那句話套到碎片上是錯的 —— 已持有角色照樣能買、能賣、能收碎片，
 * 只是不能再拿去兌換。所以碎片走這張表，不要共用上面那句。
 */
export const FRAGMENT_ERROR = {
  ALREADY_OWNED: {
    title: "你已經有這隻角色了，不能兌換",
    detail: "碎片留著還是可以回收成女神石，或拿到市場上賣給缺這隻角色的人。",
  },
  NOT_OWNED: {
    title: "你的碎片不足，無法賣出",
    detail: "要接這張收購單，手上的碎片得夠對方要的片數。",
  },
  ALREADY_LISTED: { title: "這個角色的碎片你已經有一張賣單了" },
  ALREADY_REQUESTED: {
    title: "這個角色的碎片你已經有一張收購單了",
    detail: "同一個角色的碎片同時只能掛一張收購單，先取消原本那張再改價。",
  },
  ALREADY_OWNED_REQUESTER: {
    title: "這筆收購單已失效",
    detail: "系統已自動下架，並把預扣的女神石全額退還給對方。",
  },
};

/**
 * 後端錯誤碼 → 文案。
 *
 * @param {*} err axios 的 error
 * @param {String} fallback 認不得的碼要顯示什麼
 * @param {Object} [opts]
 * @param {Boolean} [opts.fragment] 這次操作的標的是碎片，優先查碎片文案
 */
export function errorInfo(err, fallback = "操作失敗，請稍後再試", { fragment = false } = {}) {
  const data = err?.response?.data;
  const code = data?.code ?? null;
  const known = code ? (fragment && FRAGMENT_ERROR[code]) || MARKET_ERROR[code] : null;
  return {
    code,
    title: known?.title ?? data?.message ?? fallback,
    detail: known?.detail ?? null,
    data: data ?? null,
  };
}

export function errorText(err, fallback, opts) {
  const { title, detail } = errorInfo(err, fallback, opts);
  return detail ? `${title}，${detail}` : title;
}

/** 沒有頭像圖時，用角色編號推一個穩定的漸層底色，跟設計稿一致。 */
export function charGradient(itemId) {
  const h = (parseInt(itemId, 10) * 7 || 0) % 360;
  return `linear-gradient(135deg, hsl(${h} 62% 58%), hsl(${(h + 38) % 360} 66% 44%))`;
}

/** 賣家 / 買家名稱可能是 null（profile 查不到），統一補一個可讀的字。 */
export const displayName = n => n || "未知玩家";
