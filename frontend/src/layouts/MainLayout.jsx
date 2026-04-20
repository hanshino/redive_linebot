import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Divider,
  Drawer,
  Tooltip,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import NavDrawer from "../components/NavDrawer";
import DebugOverlay from "../components/DebugOverlay";
import { useColorMode } from "../theme/useColorMode";
import useLiff from "../context/useLiff";

const DRAWER_WIDTH = 260;

export default function MainLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, toggleColorMode } = useColorMode();
  const { loggedIn, ready, login, logout } = useLiff();

  const [forbiddenOpen, setForbiddenOpen] = useState(false);

  useEffect(() => {
    const handleForbidden = () => setForbiddenOpen(true);
    window.addEventListener("auth:forbidden", handleForbidden);
    return () => window.removeEventListener("auth:forbidden", handleForbidden);
  }, []);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          {!isDesktop && (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
              aria-label="open menu"
            >
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1, fontWeight: 700 }}>
            布丁機器人
          </Typography>
          <Tooltip title={mode === "dark" ? "淺色模式" : "深色模式"}>
            <IconButton onClick={toggleColorMode} color="inherit" aria-label="toggle theme">
              {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          {ready && (
            <>
              <Divider
                orientation="vertical"
                flexItem
                sx={{ mx: 0.5, borderColor: "rgba(255,255,255,0.3)" }}
              />
              <Tooltip title={loggedIn ? "登出" : "登入"}>
                <IconButton
                  color="inherit"
                  onClick={loggedIn ? logout : login}
                  aria-label={loggedIn ? "logout" : "login"}
                >
                  {loggedIn ? <LogoutIcon /> : <LoginIcon />}
                </IconButton>
              </Tooltip>
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Desktop: permanent drawer */}
      {isDesktop && (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              top: "64px",
              height: "calc(100% - 64px)",
            },
          }}
        >
          <NavDrawer />
        </Drawer>
      )}

      {/* Mobile: temporary drawer */}
      {!isDesktop && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          <Toolbar />
          <NavDrawer onClose={() => setMobileOpen(false)} />
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, md: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          maxWidth: "100vw",
          overflowX: "hidden",
          mt: "64px",
        }}
      >
        <Outlet />
      </Box>

      <Snackbar
        open={forbiddenOpen}
        autoHideDuration={3000}
        onClose={() => setForbiddenOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setForbiddenOpen(false)}
          severity="warning"
          variant="filled"
          sx={{ width: "100%" }}
        >
          您沒有權限存取此頁面
        </Alert>
      </Snackbar>
      <DebugOverlay />
    </Box>
  );
}
