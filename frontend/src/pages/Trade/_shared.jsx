/* 舊的一對一交易已停用；這裡只留 MyListings 唯讀紀錄與兩張掛單頁還在用的常數。 */

/** 舊私人交易的狀態碼（只用來顯示唯讀紀錄）。 */
export const STATUS = {
  PENDING: 0,
  COMPLETED: 1,
  CANCELLED: -1,
};

export const QUICK_PRICES = [100, 500, 1000, 5000, 10000];
