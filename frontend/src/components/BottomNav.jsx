import { Link as RouterLink, useLocation } from "react-router-dom";
import { BottomNavigation, BottomNavigationAction, GlobalStyles, Paper } from "@mui/material";
import useLiff from "../context/useLiff";
import { destinations } from "./navDestinations";

// 手機專用底部導覽：LIFF 深連結多半在手機上開，常用入口放在拇指區。
// 完整選單仍在左上角漢堡。只放 4 個，且都是不需要先挑群組就能進的頁面。
export const BOTTOM_NAV_HEIGHT = 56;

// 主內容、snackbar、sticky 操作列要讓出的底部空間（含 iPhone 的 home indicator 安全區）。
// 走 CSS 變數：導覽列沒顯示時（桌機、或 LIFF 半高視窗）自動變成 0，用的地方不用各自判斷。
export const bottomNavSpace = "var(--bottom-nav-space, 0px)";

export default function BottomNav() {
  const { pathname } = useLocation();
  const { liffContext } = useLiff();
  const index = destinations.findIndex(d => d.match(pathname));

  // LIFF 的 tall / compact 視窗本來就矮，又是從聊天室開來做單一件事，不放底部導覽。
  const viewType = liffContext?.viewType;
  if (viewType && viewType !== "full") return null;

  return (
    <>
      <GlobalStyles
        styles={theme => ({
          [theme.breakpoints.down("sm")]: {
            ":root": {
              "--bottom-nav-space": `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`,
            },
          },
        })}
      />
      <Paper
        component="nav"
        aria-label="常用功能"
        elevation={0}
        square
        sx={theme => ({
          display: { xs: "block", sm: "none" },
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: theme.zIndex.appBar,
          borderTop: 1,
          borderColor: "divider",
          pb: "env(safe-area-inset-bottom, 0px)",
          bgcolor: "background.paper",
        })}
      >
        <BottomNavigation
          showLabels
          value={index === -1 ? false : index}
          sx={{ height: BOTTOM_NAV_HEIGHT, bgcolor: "transparent" }}
        >
          {destinations.map(({ label, path, icon: Icon }) => (
            <BottomNavigationAction
              key={path}
              component={RouterLink}
              to={path}
              label={label}
              icon={<Icon />}
              // 選中的是 color 以外還有字重加粗，色弱也看得出來。
              sx={{
                minWidth: 0,
                "&.Mui-selected": { color: "primary.main" },
                "&.Mui-selected .MuiBottomNavigationAction-label": { fontWeight: 700 },
                "& .MuiBottomNavigationAction-label": { fontSize: "0.75rem" },
              }}
            />
          ))}
        </BottomNavigation>
      </Paper>
    </>
  );
}
