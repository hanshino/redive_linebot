import { Alert, Box, Button } from "@mui/material";

/**
 * 載入失敗的統一呈現：說明 + 重試。
 *
 * 失敗一定要跟「沒有資料」長得不一樣——不要在 catch 裡留空陣列然後顯示空狀態，
 * 也不要顯示寫死的預設值。用法：
 *
 *   loading ? <Skeleton/> : error ? <LoadError onRetry={load} /> : items.length === 0 ? <Empty/> : …
 *
 * message 留空時用通用文案；有後端訊息可傳入，但不要把技術細節（status code、stack）給玩家看。
 */
export default function LoadError({
  message = "資料載入失敗，請檢查網路後再試一次。",
  onRetry,
  retryText = "重試",
  sx,
}) {
  return (
    <Box sx={{ py: 2, ...sx }}>
      <Alert
        severity="error"
        action={
          onRetry ? (
            <Button color="inherit" size="small" onClick={onRetry} sx={{ minHeight: 44 }}>
              {retryText}
            </Button>
          ) : undefined
        }
      >
        {message}
      </Alert>
    </Box>
  );
}
