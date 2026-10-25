/**
 * datetime-local 輸入框用的時間工具。
 *
 * datetime-local 沒有時區，瀏覽器會用裝置時區解讀；表單送出前再轉成 ISO（UTC）。
 * 欄位下方要告訴管理員「現在填的是哪個時區」，不然跨時區操作會差幾小時。
 */

/** ISO 字串 → datetime-local 的值（裝置時區，到分鐘）。 */
export function toLocalDateTimeString(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** 目前裝置時區的說明文字，例如「時間為 Asia/Taipei（UTC+8）」。 */
export function timezoneHint() {
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  const utc = `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
  let zone = "";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // 取不到時區名稱時只顯示 UTC 偏移
  }
  return `時間為 ${zone ? `${zone}（${utc}）` : utc}`;
}
