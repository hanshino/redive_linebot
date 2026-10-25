/**
 * 把 axios 錯誤轉成給管理員看的一句話。
 *
 * 後端有帶 message 就用它（例如「兌換碼重複」），否則用呼叫端的 fallback；
 * 不顯示 status code 或 stack。fallback 請寫「發生什麼事＋怎麼辦」。
 */
export function errorText(error, fallback) {
  const message = error?.response?.data?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}
