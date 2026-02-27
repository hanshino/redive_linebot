import { Outlet } from "react-router-dom";
import { Box } from "@mui/material";

export default function MainLayout() {
  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* NavBar/Drawer will be added in Phase 3 */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: "100%",
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
}
