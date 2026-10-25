import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Button,
  Divider,
  Drawer,
  Tooltip,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import NavDrawer from "../components/NavDrawer";
import BottomNav, { bottomNavSpace } from "../components/BottomNav";
import DebugOverlay from "../components/DebugOverlay";
import { useColorMode } from "../theme/useColorMode";
import useLiff from "../context/useLiff";

const DRAWER_WIDTH = 260;

// 底部導覽列有的頁面就是「頂層」頁，不需要返回鍵。
const TOP_LEVEL_PATHS = ["/", "/signin", "/trade/market", "/rankings"];

// App bar 上的圖示按鈕統一 44px，LIFF 手機上才好點。
const appBarIconSx = { width: 44, height: 44 };

export default function MainLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, toggleColorMode } = useColorMode();
  const { loggedIn, ready, login, logout } = useLiff();
  const location = useLocation();
  const navigate = useNavigate();

  const [forbiddenOpen, setForbiddenOpen] = useState(false);

  useEffect(() => {
    const handleForbidden = () => setForbiddenOpen(true);
    window.addEventListener("auth:forbidden", handleForbidden);
    return () => window.removeEventListener("auth:forbidden", handleForbidden);
  }, []);

  // location.key 為 "default" 代表這是進站的第一個頁面（例如從 LINE 聊天室點進來），
  // 沒有站內上一頁可退，這時不顯示返回鍵，避免 navigate(-1) 把人帶出 LIFF。
  const canGoBack = location.key !== "default" && !TOP_LEVEL_PATHS.includes(location.pathname);

  const authLabel = loggedIn ? "登出" : "登入";
  const AuthIcon = loggedIn ? LogoutIcon : LoginIcon;
  const handleAuth = loggedIn ? logout : login;

  // 手機上底部導覽列固定在畫面底，提示訊息要避開它。
  const snackbarSx = { bottom: { xs: `calc(${bottomNavSpace} + 8px)`, sm: 24 } };

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
              sx={{ mr: 0.5, ...appBarIconSx }}
              aria-label="開啟選單"
            >
              <MenuIcon />
            </IconButton>
          )}
          {canGoBack && (
            <IconButton
              color="inherit"
              onClick={() => navigate(-1)}
              sx={{ mr: 0.5, ...appBarIconSx }}
              aria-label="返回上一頁"
            >
              <ArrowBackIcon />
            </IconButton>
          )}
          <Typography variant="h6" noWrap sx={{ flexGrow: 1, fontWeight: 700 }}>
            布丁機器人
          </Typography>
          <Tooltip title={mode === "dark" ? "淺色模式" : "深色模式"}>
            <IconButton
              onClick={toggleColorMode}
              color="inherit"
              sx={appBarIconSx}
              aria-label="切換深淺色"
            >
              {mode === "dark" ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>
          {ready && (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5, my: 1 }} />
              {/* 手機寬度只放圖示（aria-label 補名稱），sm 以上顯示文字，登入入口才一眼看得到。 */}
              <IconButton
                color="inherit"
                onClick={handleAuth}
                aria-label={authLabel}
                sx={{ display: { xs: "inline-flex", sm: "none" }, ...appBarIconSx }}
              >
                <AuthIcon />
              </IconButton>
              <Button
                color="inherit"
                onClick={handleAuth}
                startIcon={<AuthIcon />}
                sx={{ display: { xs: "none", sm: "inline-flex" }, minHeight: 44 }}
              >
                {authLabel}
              </Button>
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
            },
          }}
        >
          {/* 讓出 app bar 的高度（跟著主題的 toolbar 高度，不寫死像素） */}
          <Toolbar />
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
              width: `min(${DRAWER_WIDTH}px, 86vw)`,
              boxSizing: "border-box",
              overflowX: "hidden",
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
          // 手機底部導覽列是 fixed，內容底部要多留它的高度，最後一塊才不會被蓋住。
          pb: { xs: `calc(${bottomNavSpace} + 16px)`, sm: 2, md: 3 },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          maxWidth: "100vw",
          overflowX: "hidden",
        }}
      >
        {/* app bar 是 fixed，用 Toolbar 當墊高；手機 56 / 桌面 64 由主題決定 */}
        <Toolbar />
        <Outlet />
      </Box>

      <BottomNav />

      <Snackbar
        open={forbiddenOpen}
        autoHideDuration={3000}
        onClose={() => setForbiddenOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        sx={snackbarSx}
      >
        <Alert
          onClose={() => setForbiddenOpen(false)}
          severity="warning"
          variant="filled"
          sx={{ width: "100%" }}
        >
          你沒有權限存取此頁面
        </Alert>
      </Snackbar>
      <DebugOverlay />
    </Box>
  );
}
