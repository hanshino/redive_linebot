import { Card, CardContent, Stack, Typography } from "@mui/material";

/**
 * 設定頁的區段卡片：標題、說明、內容。
 * 只服務目前的群組設定頁，需要更多變化時再加 props。
 */
export default function SectionCard({ title, description, children }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 } }}>
        <Stack spacing={1.75}>
          <Stack spacing={0.25}>
            <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {description && (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            )}
          </Stack>
          {children}
        </Stack>
      </CardContent>
    </Card>
  );
}
