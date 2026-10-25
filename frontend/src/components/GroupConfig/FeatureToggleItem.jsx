import { useState } from "react";
import { ListItem, ListItemText, Switch } from "@mui/material";

/**
 * 單一功能開關。
 * checked 完全由父層的 status 決定（受控）：只有後端回應成功、父層更新 status 之後，
 * 開關才會翻過去；失敗時狀態沒變，開關自然維持原樣，不需要另外還原。
 * 請求期間 pending 會鎖住開關，避免連點造成順序錯亂。
 */
export default function FeatureToggleItem({
  title,
  description,
  status,
  name,
  handle,
  isLoggedIn,
}) {
  const [pending, setPending] = useState(false);
  const checked = status === "Y";

  const handleChange = async () => {
    setPending(true);
    try {
      await handle(name, !checked, title);
    } finally {
      setPending(false);
    }
  };

  return (
    <ListItem
      disableGutters
      sx={{ py: 1.25, alignItems: "flex-start", gap: 2 }}
      secondaryAction={
        <Switch
          checked={checked}
          onChange={isLoggedIn ? handleChange : undefined}
          color="primary"
          disabled={!isLoggedIn || pending}
          slotProps={{ input: { "aria-label": `開關：${title}`, "aria-busy": pending } }}
        />
      }
    >
      <ListItemText
        primary={title}
        secondary={description}
        slotProps={{
          primary: { variant: "body1", fontWeight: 600 },
          secondary: { variant: "body2" },
        }}
        sx={{ my: 0, pr: 6 }}
      />
    </ListItem>
  );
}
