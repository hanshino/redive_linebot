export const TYPE_META = {
  new: { label: "新贊助", color: "primary" },
  history: { label: "歷史補登", color: "default" },
};

export const COUPON_STATUS = {
  0: { label: "未使用", color: "success" },
  1: { label: "已使用", color: "default" },
};

/** 金額字串補成兩位小數（純字串處理，不經 float）。 */
export function fmtAmount(v) {
  if (v === null || v === undefined || v === "") return "—";
  const [int, dec = ""] = String(v).split(".");
  const intFmt = int.replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${intFmt}.${(dec + "00").slice(0, 2)}`;
}

export function fmtDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 本地時間的 datetime-local 字串（給表單預設值）。 */
export function toLocalInput(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function playerLabel(userId) {
  return userId === null || userId === undefined ? "未綁定" : `玩家 #${userId}`;
}

/** 從錯誤物件取可顯示的訊息。503 = owner 未配置。 */
export function errorMessage(err, fallback = "操作失敗，請稍後再試") {
  const status = err?.response?.status;
  if (status === 503) return "贊助後台尚未啟用（尚未設定管理者），請先完成部署設定。";
  if (!err?.response) return "連線失敗或逾時，請確認網路後重試。";
  return err.response?.data?.message || fallback;
}
