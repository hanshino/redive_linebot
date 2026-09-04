import { useState } from "react";
import { ListItem, ListItemText, Switch } from "@mui/material";

export default function FeatureToggleItem({
  title,
  description,
  status,
  name,
  handle,
  isLoggedIn,
}) {
  const [checked, setChecked] = useState(status === "Y");

  const handleChange = () => {
    handle(name, !checked);
    setChecked(!checked);
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
          disabled={!isLoggedIn}
          slotProps={{ input: { "aria-label": `toggle ${name}` } }}
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
