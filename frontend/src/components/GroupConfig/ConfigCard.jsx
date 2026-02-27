import { useState } from "react";
import {
  Card, CardContent, CardActions, Typography, Switch,
} from "@mui/material";

export default function ConfigCard({ title, description, status, name, handle, isLoggedIn }) {
  const [checked, setChecked] = useState(status === "Y");

  const handleChange = () => {
    handle(name, !checked);
    setChecked(!checked);
  };

  return (
    <Card sx={{ display: "grid", height: "100%", minWidth: 200 }}>
      <CardContent>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </CardContent>
      <CardActions sx={{ mt: "auto", ml: "auto" }}>
        <Switch
          checked={checked}
          onChange={isLoggedIn ? handleChange : undefined}
          color="primary"
          disabled={!isLoggedIn}
          inputProps={{ "aria-label": `toggle ${name}` }}
        />
      </CardActions>
    </Card>
  );
}
