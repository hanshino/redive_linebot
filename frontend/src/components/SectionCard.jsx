import { Card, CardContent, Stack, Typography } from "@mui/material";

/**
 * 頁面的區段卡片：標題、說明、內容。
 *
 * 群組設定頁一開始用它，現在也是其他頁面的預設區段容器。新增的 props 都是選填，
 * 原本只傳 title / description / children 的用法不受影響：
 * - action：標題列右側的操作（按鈕、Chip），窄螢幕會換到標題下方
 * - headingComponent：標題的 HTML 標籤，預設 h2，巢狀在別的區段裡時改 h3
 * - sx：套在最外層 Card
 */
export default function SectionCard({
  title,
  description,
  action,
  headingComponent = "h2",
  sx,
  children,
}) {
  return (
    <Card variant="outlined" sx={sx}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={1.75}>
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}
          >
            <Stack spacing={0.25} sx={{ minWidth: 0, flex: "1 1 auto" }}>
              <Typography variant="subtitle1" component={headingComponent} sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
              {description && (
                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                  {description}
                </Typography>
              )}
            </Stack>
            {action}
          </Stack>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}
