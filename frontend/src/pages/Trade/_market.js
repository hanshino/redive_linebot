/* =========================================================================
 * 公開市場 / 角色委託所 —— 共用計算、格式化、狀態對應與版面零件
 * 舊的一對一交易用語（STATUS 0/1/-1、ROLE）留在 _shared.jsx，
 * 兩套字彙混在一起只會讓人猜錯，所以這裡另開一個模組。
 * ====================================================================== */

import { useCallback, useEffect } from "react";
import useAxios from "axios-hooks";

export const FEE_PERCENT = 5;
export const PRICE_MIN = 1;
export const PRICE_MAX = 10000000;
export const MAX_OPEN_FALLBACK = 10;

/** 手續費無條件進位，實收為售價扣掉手續費。與後端同一條公式。 */
export const calcFee = price => Math.ceil((price * FEE_PERCENT) / 100);
export const calcNet = price => price - calcFee(price);

/**
 * 金額一律有千分位。
 * 沒有值（還沒載入、載入失敗）時回「—」，不補 0：
 * 「餘額 0」是一個會讓人放棄交易的具體說法，不能拿來當作沒資料的預設。
 */
export const fmtStone = n => {
  if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString("en-US");
};

/** 數字欄位對齊用（等寬數字）。 */
export const NUMS = { fontVariantNumeric: "tabular-nums" };

/** 只給讀屏看的文字（clip 做法，不會在版面上佔位）。 */
export const SR_ONLY = {
  position: "absolute",
  width: "1px",
  height: "1px",
  m: "-1px",
  p: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** 觸控目標最小尺寸（LIFF 手機操作）。 */
export const TOUCH = 44;

/** 交易頁都是單欄表單／清單，桌機上不要撐滿整個內容區，限制在好讀的寬度並置中。 */
export const PAGE_WIDTH = { width: "100%", maxWidth: 680, mx: "auto" };

/** 掛在頁面根節點或 Dialog paper 上，讓裡面所有 MUI Button（含 size="small"）都達觸控目標。 */
export const TAP_TARGETS = { "& .MuiButton-root": { minHeight: TOUCH } };

/**
 * 這個模組重複最多的文字組合。字級只用 12 / 13 / 14 / 16 / 18 / 20 / 24，
 * 集中在這裡，各頁就不會各自長出 11.5、12.8 這種中間值。
 */
export const META_TEXT = { fontSize: 12, color: "text.secondary", ...NUMS };
export const BODY_SMALL = { fontSize: 13, lineHeight: 1.6 };

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

/**
 * 市場參考價：沿用公開市場既有的 /characters 掛單簿（bestPrice 在賣單簿是最低售價、
 * 收購簿是最高收購價），不另開 API。兩本各讀一次，掛單頁用選中的角色去查。
 * 沒有出現在清單裡 = 目前沒人掛，是正常狀態；讀取失敗要另外標出來，不能當成沒人掛。
 */
export function useMarketAnchors(enabled) {
  const [{ data: sellRows, loading: sellLoading, error: sellError }, fetchSell] = useAxios(
    { url: "/api/public-market/characters", params: { orderType: "sell" } },
    { manual: true }
  );
  const [{ data: buyRows, loading: buyLoading, error: buyError }, fetchBuy] = useAxios(
    { url: "/api/public-market/characters", params: { orderType: "buy" } },
    { manual: true }
  );

  const reload = useCallback(() => {
    fetchSell().catch(() => {});
    fetchBuy().catch(() => {});
  }, [fetchSell, fetchBuy]);

  useEffect(() => {
    if (enabled) reload();
  }, [enabled, reload]);

  const failed = Boolean(sellError || buyError);
  const ready = !failed && Array.isArray(sellRows) && Array.isArray(buyRows);
  const find = (rows, id) =>
    Array.isArray(rows) ? rows.find(r => String(r.itemId) === String(id)) : undefined;

  return {
    loading: !failed && (sellLoading || buyLoading || !ready),
    failed,
    ready,
    reload,
    /** { ask, bid }：各自為 { price, count } 或 null（目前沒有）。 */
    anchorFor: itemId => {
      const ask = find(sellRows, itemId);
      const bid = find(buyRows, itemId);
      return {
        ask: ask ? { price: Number(ask.bestPrice), count: Number(ask.listingCount) } : null,
        bid: bid ? { price: Number(bid.bestPrice), count: Number(bid.listingCount) } : null,
      };
    },
  };
}
