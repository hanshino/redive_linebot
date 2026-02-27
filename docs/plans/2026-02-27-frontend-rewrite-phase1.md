# Phase 1: Frontend Rewrite — Project Scaffold Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For Claude:** When working on theme/UI design tasks (Task 3), REQUIRED SUB-SKILL: Use ui-ux-pro-max:ui-ux-pro-max for visual design guidance.

**Goal:** Initialize a new Vite + React 19 + MUI v7 frontend in `frontend-next/` with game-themed styling, all routes as placeholders, and dev proxy to the existing backend.

**Architecture:** New SPA in `frontend-next/` alongside the existing `frontend/`. Uses Vite for build tooling, React 19 for UI, MUI v7 for component library, React Router v7 for routing. LIFF SDK loaded via script tag. Axios for API calls with LIFF token auth. The existing nginx proxy and backend API remain unchanged.

**Tech Stack:** Vite 6, React 19, MUI v7 (@mui/material), React Router v7, Recharts, axios, axios-hooks, socket.io-client, LIFF SDK v2

---

## Task 1: Initialize Vite + React 19 Project

**Files:**
- Create: `frontend-next/package.json`
- Create: `frontend-next/vite.config.js`
- Create: `frontend-next/index.html`
- Create: `frontend-next/src/main.jsx`
- Create: `frontend-next/src/App.jsx`

**Step 1: Scaffold Vite project**

```bash
cd /home/hanshino/workspace/redive_linebot
npm create vite@latest frontend-next -- --template react
```

This creates a minimal Vite + React project. The template uses React 19 by default.

**Step 2: Verify it runs**

```bash
cd /home/hanshino/workspace/redive_linebot/frontend-next
yarn install
yarn dev
```

Expected: Dev server starts on http://localhost:5173 with Vite + React landing page.

**Step 3: Clean up template files**

Remove default template content. Delete:
- `src/App.css`
- `src/assets/react.svg`
- `public/vite.svg`

Replace `src/App.jsx` with minimal content:

```jsx
export default function App() {
  return <div>frontend-next</div>;
}
```

Replace `src/main.jsx` with:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Clean up `index.html` — update title to `布丁機器人` and add LIFF SDK script:

```html
<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1a1a2e" />
    <meta name="description" content="公主連結Line機器人 - 非官方" />
    <title>布丁機器人</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" />
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons" />
    <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

**Step 4: Verify clean app runs**

```bash
yarn dev
```

Expected: Shows "frontend-next" text on page.

**Step 5: Commit**

```bash
git add frontend-next/
git commit -m "feat: scaffold Vite + React 19 project in frontend-next"
```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `frontend-next/package.json`

**Step 1: Install MUI v7 and core dependencies**

```bash
cd /home/hanshino/workspace/redive_linebot/frontend-next
yarn add @mui/material@^7 @emotion/react @emotion/styled @mui/icons-material@^7
```

**Step 2: Install routing**

```bash
yarn add react-router-dom@^7
```

**Step 3: Install data fetching and real-time**

```bash
yarn add axios axios-hooks socket.io-client
```

**Step 4: Install charts and utilities**

```bash
yarn add recharts lodash
```

**Step 5: Install MUI X DataGrid**

```bash
yarn add @mui/x-data-grid@^7
```

**Step 6: Verify build still works**

```bash
yarn dev
```

Expected: App still starts without errors.

**Step 7: Commit**

```bash
git add frontend-next/package.json frontend-next/yarn.lock
git commit -m "feat: install MUI v7, React Router v7, Recharts and dependencies"
```

---

## Task 3: Create Game Theme

> **For Claude:** Use ui-ux-pro-max:ui-ux-pro-max skill for this task to ensure quality visual design.

**Files:**
- Create: `frontend-next/src/theme/index.js`
- Create: `frontend-next/src/index.css`

**Context:** The theme should evoke Princess Connect RE:Dive's visual identity — blue-purple gradients, gold accents, dark backgrounds with luminous card panels. This is the design foundation for the entire rewrite.

**Step 1: Create the theme file**

Create `frontend-next/src/theme/index.js`:

```js
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#6C63FF",       // Blue-purple (game UI inspired)
      light: "#9D97FF",
      dark: "#4A42CC",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#FFB830",       // Gold/amber accent
      light: "#FFD06B",
      dark: "#CC9320",
      contrastText: "#1A1A2E",
    },
    background: {
      default: "#0F0F1A",    // Deep dark blue
      paper: "#1A1A2E",      // Card/panel background
    },
    text: {
      primary: "#E8E8F0",
      secondary: "#A0A0B8",
    },
    error: {
      main: "#FF6B6B",
    },
    warning: {
      main: "#FFB830",
    },
    success: {
      main: "#51CF66",
    },
    info: {
      main: "#74C0FC",
    },
    divider: "rgba(108, 99, 255, 0.15)",
  },
  typography: {
    fontFamily: '"Roboto", "Noto Sans TC", sans-serif',
    h4: {
      fontWeight: 700,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(108, 99, 255, 0.15)",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
          "&:hover": {
            borderColor: "rgba(108, 99, 255, 0.4)",
            boxShadow: "0 0 20px rgba(108, 99, 255, 0.1)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        contained: {
          textTransform: "none",
          fontWeight: 600,
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 0 16px rgba(108, 99, 255, 0.3)",
          },
        },
        outlined: {
          textTransform: "none",
          borderColor: "rgba(108, 99, 255, 0.4)",
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(15, 15, 26, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(108, 99, 255, 0.15)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
          backgroundColor: "#141425",
          borderRight: "1px solid rgba(108, 99, 255, 0.15)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
  },
});

export default theme;
```

**Step 2: Create global CSS**

Create `frontend-next/src/index.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  background-color: #0F0F1A;
  color: #E8E8F0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: #0F0F1A;
}

::-webkit-scrollbar-thumb {
  background: rgba(108, 99, 255, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(108, 99, 255, 0.5);
}
```

**Step 3: Wire theme into App**

Update `frontend-next/src/main.jsx`:

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "./theme";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

Update `frontend-next/src/App.jsx` to show theme is working:

```jsx
import { Box, Typography, Button, Card, CardContent } from "@mui/material";

export default function App() {
  return (
    <Box sx={{ p: 4, minHeight: "100vh" }}>
      <Typography variant="h4" gutterBottom>
        布丁機器人
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Princess Connect RE:Dive LINE Bot Dashboard
      </Typography>
      <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
        <Button variant="contained">Primary Button</Button>
        <Button variant="contained" color="secondary">Gold Accent</Button>
        <Button variant="outlined">Outlined</Button>
      </Box>
      <Card sx={{ maxWidth: 400 }}>
        <CardContent>
          <Typography variant="h6">Theme Preview</Typography>
          <Typography variant="body2" color="text.secondary">
            Game-themed dark UI with blue-purple and gold accents.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
```

**Step 4: Verify theme renders correctly**

```bash
yarn dev
```

Expected: Dark background, blue-purple buttons, gold accent button, card with subtle border glow on hover.

**Step 5: Commit**

```bash
git add frontend-next/src/theme/ frontend-next/src/index.css frontend-next/src/main.jsx frontend-next/src/App.jsx
git commit -m "feat: create game-themed MUI v7 dark theme with blue-purple and gold accents"
```

---

## Task 4: Set Up Route Skeleton

**Files:**
- Modify: `frontend-next/src/App.jsx`
- Create: `frontend-next/src/layouts/MainLayout.jsx`
- Create: `frontend-next/src/layouts/LiffLayout.jsx`
- Create: `frontend-next/src/pages/Home/index.jsx`
- Create: `frontend-next/src/pages/Rankings/index.jsx`
- Create: `frontend-next/src/pages/Gacha/index.jsx`
- Create: `frontend-next/src/pages/Gacha/Exchange.jsx`
- Create: `frontend-next/src/pages/ScratchCard/index.jsx`
- Create: `frontend-next/src/pages/ScratchCard/Detail.jsx`
- Create: `frontend-next/src/pages/ScratchCard/Exchange.jsx`
- Create: `frontend-next/src/pages/Bag/index.jsx`
- Create: `frontend-next/src/pages/Equipment/index.jsx`
- Create: `frontend-next/src/pages/Trade/index.jsx`
- Create: `frontend-next/src/pages/Trade/Order.jsx`
- Create: `frontend-next/src/pages/Trade/Manage.jsx`
- Create: `frontend-next/src/pages/Trade/Detail.jsx`
- Create: `frontend-next/src/pages/Trade/Transaction.jsx`
- Create: `frontend-next/src/pages/Bot/Notify.jsx`
- Create: `frontend-next/src/pages/Bot/Binding.jsx`
- Create: `frontend-next/src/pages/Group/Record.jsx`
- Create: `frontend-next/src/pages/Group/Config.jsx`
- Create: `frontend-next/src/pages/Group/Battle.jsx`
- Create: `frontend-next/src/pages/Panel/Manual.jsx`
- Create: `frontend-next/src/pages/Panel/BattleControl.jsx`
- Create: `frontend-next/src/pages/Panel/BattleSign.jsx`
- Create: `frontend-next/src/pages/Admin/GachaPool.jsx`
- Create: `frontend-next/src/pages/Admin/GachaShop.jsx`
- Create: `frontend-next/src/pages/Admin/GlobalOrder.jsx`
- Create: `frontend-next/src/pages/Admin/Messages.jsx`
- Create: `frontend-next/src/pages/Admin/Worldboss.jsx`
- Create: `frontend-next/src/pages/Admin/WorldbossEvent.jsx`
- Create: `frontend-next/src/pages/Admin/WorldbossMessage.jsx`
- Create: `frontend-next/src/pages/Admin/WorldbossMessageCreate.jsx`
- Create: `frontend-next/src/pages/Admin/WorldbossMessageUpdate.jsx`
- Create: `frontend-next/src/pages/Admin/ScratchCard.jsx`
- Create: `frontend-next/src/pages/Tools/BattleTime.jsx`
- Create: `frontend-next/src/pages/CustomerOrder/index.jsx`
- Create: `frontend-next/src/components/PlaceholderPage.jsx`

**Step 1: Create the PlaceholderPage component**

This component will be used by all pages during Phase 1 to show a consistent placeholder with the page name.

Create `frontend-next/src/components/PlaceholderPage.jsx`:

```jsx
import { Box, Typography, Chip } from "@mui/material";
import ConstructionIcon from "@mui/icons-material/Construction";

export default function PlaceholderPage({ title }) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 2,
      }}
    >
      <ConstructionIcon sx={{ fontSize: 48, color: "secondary.main" }} />
      <Typography variant="h5">{title}</Typography>
      <Chip label="Phase 1 — Placeholder" color="primary" variant="outlined" />
    </Box>
  );
}
```

**Step 2: Create all placeholder page files**

Each page file follows this pattern (example for Home):

`frontend-next/src/pages/Home/index.jsx`:
```jsx
import PlaceholderPage from "../../components/PlaceholderPage";

export default function Home() {
  return <PlaceholderPage title="首頁" />;
}
```

Create all page files listed above with their respective titles. Full list of titles:

| File | Title |
|------|-------|
| `pages/Home/index.jsx` | 首頁 |
| `pages/Rankings/index.jsx` | 排行榜 |
| `pages/Gacha/index.jsx` | 轉蛋 (unused route placeholder) |
| `pages/Gacha/Exchange.jsx` | 轉蛋商店 |
| `pages/ScratchCard/index.jsx` | 刮刮卡 |
| `pages/ScratchCard/Detail.jsx` | 刮刮卡詳情 |
| `pages/ScratchCard/Exchange.jsx` | 刮刮卡兌獎 |
| `pages/Bag/index.jsx` | 背包 |
| `pages/Equipment/index.jsx` | 裝備管理 |
| `pages/Trade/index.jsx` | 交易 (unused route placeholder) |
| `pages/Trade/Order.jsx` | 交易訂單 |
| `pages/Trade/Manage.jsx` | 交易管理 |
| `pages/Trade/Detail.jsx` | 交易詳情 |
| `pages/Trade/Transaction.jsx` | 交易紀錄 |
| `pages/Bot/Notify.jsx` | 訂閱通知 |
| `pages/Bot/Binding.jsx` | 通知綁定 |
| `pages/Group/Record.jsx` | 群組紀錄 |
| `pages/Group/Config.jsx` | 群組設定 |
| `pages/Group/Battle.jsx` | 公會戰 |
| `pages/Panel/Manual.jsx` | 使用手冊 |
| `pages/Panel/BattleControl.jsx` | 公會戰控制 |
| `pages/Panel/BattleSign.jsx` | 公會戰報名 |
| `pages/Admin/GachaPool.jsx` | 轉蛋管理 |
| `pages/Admin/GachaShop.jsx` | 女神石商店 |
| `pages/Admin/GlobalOrder.jsx` | 全群指令管理 |
| `pages/Admin/Messages.jsx` | 訊息實況 |
| `pages/Admin/Worldboss.jsx` | 世界王設定 |
| `pages/Admin/WorldbossEvent.jsx` | 世界王活動設定 |
| `pages/Admin/WorldbossMessage.jsx` | 世界王特色訊息 |
| `pages/Admin/WorldbossMessageCreate.jsx` | 新增世界王訊息 |
| `pages/Admin/WorldbossMessageUpdate.jsx` | 編輯世界王訊息 |
| `pages/Admin/ScratchCard.jsx` | 刮刮卡管理 |
| `pages/Tools/BattleTime.jsx` | 補償刀軸換算 |
| `pages/CustomerOrder/index.jsx` | 自訂指令 |

**Step 3: Create MainLayout**

Create `frontend-next/src/layouts/MainLayout.jsx`:

```jsx
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
```

**Step 4: Create LiffLayout**

Create `frontend-next/src/layouts/LiffLayout.jsx`:

```jsx
import { useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";

export default function LiffLayout() {
  const { size } = useParams();

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        LIFF Size: {size}
      </Typography>
      {/* LIFF initialization will be wired in Phase 2/3 */}
    </Box>
  );
}
```

**Step 5: Wire up all routes in App.jsx**

Replace `frontend-next/src/App.jsx`:

```jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import LiffLayout from "./layouts/LiffLayout";

// Pages
import Home from "./pages/Home";
import Rankings from "./pages/Rankings";
import GachaExchange from "./pages/Gacha/Exchange";
import ScratchCard from "./pages/ScratchCard";
import ScratchCardDetail from "./pages/ScratchCard/Detail";
import ScratchCardExchange from "./pages/ScratchCard/Exchange";
import Bag from "./pages/Bag";
import Equipment from "./pages/Equipment";
import TradeOrder from "./pages/Trade/Order";
import TradeManage from "./pages/Trade/Manage";
import TradeDetail from "./pages/Trade/Detail";
import TradeTransaction from "./pages/Trade/Transaction";
import BotNotify from "./pages/Bot/Notify";
import BotBinding from "./pages/Bot/Binding";
import GroupRecord from "./pages/Group/Record";
import GroupConfig from "./pages/Group/Config";
import GroupBattle from "./pages/Group/Battle";
import PanelManual from "./pages/Panel/Manual";
import BattleControl from "./pages/Panel/BattleControl";
import BattleSign from "./pages/Panel/BattleSign";
import CustomerOrder from "./pages/CustomerOrder";
import AdminGachaPool from "./pages/Admin/GachaPool";
import AdminGachaShop from "./pages/Admin/GachaShop";
import AdminGlobalOrder from "./pages/Admin/GlobalOrder";
import AdminMessages from "./pages/Admin/Messages";
import AdminWorldboss from "./pages/Admin/Worldboss";
import AdminWorldbossEvent from "./pages/Admin/WorldbossEvent";
import AdminWorldbossMessage from "./pages/Admin/WorldbossMessage";
import AdminWorldbossMessageCreate from "./pages/Admin/WorldbossMessageCreate";
import AdminWorldbossMessageUpdate from "./pages/Admin/WorldbossMessageUpdate";
import AdminScratchCard from "./pages/Admin/ScratchCard";
import ToolsBattleTime from "./pages/Tools/BattleTime";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* LIFF routes */}
        <Route path="/liff/:size" element={<LiffLayout />} />

        {/* Main routes */}
        <Route element={<MainLayout />}>
          <Route index element={<Home />} />
          <Route path="Rankings" element={<Rankings />} />

          {/* Gacha */}
          <Route path="Gacha/Exchange" element={<GachaExchange />} />

          {/* ScratchCard */}
          <Route path="ScratchCard" element={<ScratchCard />} />
          <Route path="ScratchCard/Exchange" element={<ScratchCardExchange />} />
          <Route path="ScratchCard/:id" element={<ScratchCardDetail />} />

          {/* Inventory */}
          <Route path="Bag" element={<Bag />} />
          <Route path="Equipment" element={<Equipment />} />

          {/* Trade */}
          <Route path="Trade/Order" element={<TradeOrder />} />
          <Route path="Trade/Manage" element={<TradeManage />} />
          <Route path="Trade/:marketId/Detail" element={<TradeDetail />} />
          <Route path="Trade/:marketId/Transaction" element={<TradeTransaction />} />

          {/* Bot */}
          <Route path="Bot/Notify" element={<BotNotify />} />
          <Route path="Bot/Notify/Binding" element={<BotBinding />} />

          {/* Group */}
          <Route path="Group/:groupId/Record" element={<GroupRecord />} />
          <Route path="Group/:groupId/Config" element={<GroupConfig />} />
          <Route path="Group/:groupId/Battle" element={<GroupBattle />} />

          {/* Panel */}
          <Route path="Panel/Manual" element={<PanelManual />} />
          <Route path="Panel/Group/Battle/Control" element={<BattleControl />} />
          <Route path="Panel/Group/Battle/:week?/:boss?" element={<BattleSign />} />

          {/* Customer Order */}
          <Route path="Source/:sourceId/Customer/Orders" element={<CustomerOrder />} />

          {/* Admin */}
          <Route path="Admin/GachaPool" element={<AdminGachaPool />} />
          <Route path="Admin/GachaShop" element={<AdminGachaShop />} />
          <Route path="Admin/GlobalOrder" element={<AdminGlobalOrder />} />
          <Route path="Admin/Messages" element={<AdminMessages />} />
          <Route path="Admin/Worldboss" element={<AdminWorldboss />} />
          <Route path="Admin/WorldbossEvent" element={<AdminWorldbossEvent />} />
          <Route path="Admin/WorldbossMessage" element={<AdminWorldbossMessage />} />
          <Route path="Admin/WorldbossMessage/Create" element={<AdminWorldbossMessageCreate />} />
          <Route path="Admin/WorldbossMessage/Update/:id" element={<AdminWorldbossMessageUpdate />} />
          <Route path="Admin/ScratchCard" element={<AdminScratchCard />} />

          {/* Tools */}
          <Route path="Tools/BattleTime" element={<ToolsBattleTime />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

**Step 6: Verify routing works**

```bash
yarn dev
```

Navigate to:
- `http://localhost:5173/` → Shows "首頁" placeholder
- `http://localhost:5173/Rankings` → Shows "排行榜" placeholder
- `http://localhost:5173/Admin/GachaPool` → Shows "轉蛋管理" placeholder
- `http://localhost:5173/liff/full` → Shows LIFF layout

Expected: All routes render with game-themed placeholder (construction icon + gold accent + page title).

**Step 7: Commit**

```bash
git add frontend-next/src/
git commit -m "feat: set up React Router v7 route skeleton with all placeholder pages"
```

---

## Task 5: Configure Vite Dev Proxy

**Files:**
- Modify: `frontend-next/vite.config.js`

**Step 1: Configure proxy for API and WebSocket**

Replace `frontend-next/vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
```

Note: Using port 3001 to avoid conflict with the existing frontend on port 3000.

**Step 2: Verify proxy works**

```bash
yarn dev
```

If the backend is running, test the proxy:
- Open browser dev tools → Network tab
- Navigate to `http://localhost:3001/`
- In console: `fetch("/api/Pudding/Statistics").then(r => r.json()).then(console.log)`

Expected: Returns statistics JSON from the backend (or connection refused if backend isn't running, which is fine — the proxy config is correct).

**Step 3: Commit**

```bash
git add frontend-next/vite.config.js
git commit -m "feat: configure Vite dev proxy for API and WebSocket"
```

---

## Task 6: Set Up API Service Layer

**Files:**
- Create: `frontend-next/src/services/api.js`
- Create: `frontend-next/src/services/statistics.js`
- Create: `frontend-next/src/services/group.js`
- Create: `frontend-next/src/services/princess.js`
- Create: `frontend-next/src/services/customerOrder.js`
- Create: `frontend-next/src/services/globalOrder.js`
- Create: `frontend-next/src/services/gachaPool.js`
- Create: `frontend-next/src/services/notify.js`

**Step 1: Create axios instance**

Create `frontend-next/src/services/api.js`:

```js
import axios from "axios";

const api = axios.create({
  timeout: 10000,
});

export function setAuthToken(token) {
  api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
}

export function clearAuthToken() {
  delete api.defaults.headers.common["Authorization"];
}

export default api;
```

**Step 2: Create service modules**

Mirror the existing API structure. Each service file exports functions that use the shared axios instance.

`frontend-next/src/services/statistics.js`:
```js
import api from "./api";

export const getLineBotData = () => api.get("/api/Pudding/Statistics").then(r => r.data);
export const getEuropeRankData = () => api.get("/api/Gacha/Rank/0").then(r => r.data);
export const getAfricaRankData = () => api.get("/api/Gacha/Rank/1").then(r => r.data);
export const getUserData = () => api.get("/api/My/Statistics").then(r => r.data);
```

`frontend-next/src/services/group.js`:
```js
import api from "./api";

export const fetchGroupSpeakRank = (groupId) =>
  api.get(`/api/Group/${groupId}/Speak/Rank`).then(r => r.data);
export const fetchGroupConfig = (groupId) =>
  api.get(`/api/Group/${groupId}/Config`).then(r => r.data);
export const fetchGroupConfigData = () =>
  api.get("/api/GroupConfig").then(r => r.data);
export const switchGroupConfig = (groupId, name, status) =>
  api.put(`/api/Group/${groupId}/Name/${name}/${status}`).then(r => r.data);
export const setDiscordWebhook = (groupId, webhook) =>
  api.post(`/api/Group/${groupId}/Discord/Webhook`, { webhook }).then(r => r.data);
export const removeDiscordWebhook = (groupId) =>
  api.delete(`/api/Group/${groupId}/Discord/Webhook`).then(r => r.data);
export const testDiscordWebhook = (webhook) =>
  api.post("/api/Discord/Webhook", { webhook }).then(r => r.data);
export const setWelcomeMessage = (groupId, message) =>
  api.post(`/api/Group/${groupId}/WelcomeMessage`, { message }).then(r => r.data);
export const fetchGroupSummarys = () =>
  api.get("/api/Guild/Summarys").then(r => r.data);
export const getGroupInfo = (groupId) =>
  api.get(`/api/Guild/${groupId}/Summary`).then(r => r.data);
export const setSender = (groupId, sender) =>
  api.put(`/api/Group/${groupId}/Sender`, { sender }).then(r => r.data);
export const getSignList = (groupId, month) =>
  api.get(`/api/Guild/${groupId}/Battle/Sign/List/Month/${month}`).then(r => r.data);
```

`frontend-next/src/services/princess.js`:
```js
import api from "./api";

export const getCharacterImages = () =>
  api.get("/api/Princess/Character/Images").then(r => r.data);
```

`frontend-next/src/services/customerOrder.js`:
```js
import api from "./api";

export const fetchOrders = (sourceId) =>
  api.get(`/api/Source/${sourceId}/Customer/Orders`).then(r => r.data);
export const updateOrder = (sourceId, orderData) =>
  api.put(`/api/Source/${sourceId}/Customer/Orders`, orderData).then(r => r.data);
export const insertOrder = (sourceId, orderData) =>
  api.post(`/api/Source/${sourceId}/Customer/Orders`, orderData).then(r => r.data);
export const setOrderStatus = (sourceId, orderKey, status) =>
  api.put(`/api/Source/${sourceId}/Customer/Orders/${orderKey}/${status}`).then(r => r.data);
```

`frontend-next/src/services/globalOrder.js`:
```js
import api from "./api";

export const fetchDatas = () =>
  api.get("/api/Admin/GlobalOrders/Data").then(r => r.data);
export const insertData = (objData) =>
  api.post("/api/Admin/GlobalOrders/Data", objData).then(r => r.data);
export const updateData = (objData) =>
  api.put("/api/Admin/GlobalOrders/Data", objData).then(r => r.data);
export const deleteData = (orderKey) =>
  api.delete(`/api/Admin/GlobalOrders/Data/${orderKey}`).then(r => r.data);
```

`frontend-next/src/services/gachaPool.js`:
```js
import api from "./api";

export const fetchData = () =>
  api.get("/api/Admin/GachaPool/Data").then(r => r.data);
export const updateData = (id, data) =>
  api.put("/api/Admin/GachaPool/Data", { id, ...data }).then(r => r.data);
export const insertData = (data) =>
  api.post("/api/Admin/GachaPool/Data", data).then(r => r.data);
export const deleteData = (id) =>
  api.delete(`/api/Admin/GachaPool/Data/${id}`).then(r => r.data);
```

`frontend-next/src/services/notify.js`:
```js
import api from "./api";

export const getNotifyData = () =>
  api.get("/api/Bot/Notify/Data").then(r => r.data);
export const setStatus = (key, status) =>
  api.put(`/api/Bot/Notify/${key}/${status}`).then(r => r.data);
export const notifyTest = () =>
  api.post("/api/Bot/Notify/Test").then(r => r.data);
export const revokeNotify = () =>
  api.delete("/api/Bot/Notify/Binding").then(r => r.data);
```

**Step 3: Verify no import errors**

```bash
yarn dev
```

Expected: App still runs without errors.

**Step 4: Commit**

```bash
git add frontend-next/src/services/
git commit -m "feat: set up API service layer mirroring existing endpoints"
```

---

## Task 7: Create Dockerfile for frontend-next

**Files:**
- Create: `frontend-next/Dockerfile`
- Create: `frontend-next/Dockerfile.dev`
- Create: `frontend-next/.dockerignore`

**Step 1: Create production Dockerfile**

Create `frontend-next/Dockerfile`:

```dockerfile
# build environment
FROM node:lts AS build
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# production environment
FROM nginx:1-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

Note: Vite outputs to `dist/` (not `build/` like CRA).

**Step 2: Create dev Dockerfile**

Create `frontend-next/Dockerfile.dev`:

```dockerfile
FROM node:lts
WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH
CMD ["yarn", "dev", "--host"]
EXPOSE 3001
```

**Step 3: Create .dockerignore**

Create `frontend-next/.dockerignore`:

```
node_modules
dist
.git
.DS_Store
*.log
Dockerfile*
docker-compose*
.dockerignore
.gitignore
```

**Step 4: Verify production build works locally**

```bash
cd /home/hanshino/workspace/redive_linebot/frontend-next
yarn build
```

Expected: Build output in `frontend-next/dist/` with no errors.

**Step 5: Commit**

```bash
git add frontend-next/Dockerfile frontend-next/Dockerfile.dev frontend-next/.dockerignore
git commit -m "feat: add Docker configuration for frontend-next"
```

---

## Task 8: Final Verification

**Step 1: Verify all routes work**

```bash
cd /home/hanshino/workspace/redive_linebot/frontend-next
yarn dev
```

Manually navigate to each major route group and verify the placeholder renders:
- `/` — 首頁
- `/Rankings` — 排行榜
- `/Gacha/Exchange` — 轉蛋商店
- `/ScratchCard` — 刮刮卡
- `/Bag` — 背包
- `/Equipment` — 裝備管理
- `/Trade/Manage` — 交易管理
- `/Bot/Notify` — 訂閱通知
- `/Panel/Manual` — 使用手冊
- `/Admin/GachaPool` — 轉蛋管理
- `/Tools/BattleTime` — 補償刀軸換算

Expected: All routes show the themed placeholder page with correct title.

**Step 2: Verify production build**

```bash
yarn build
```

Expected: Clean build with no errors or warnings.

**Step 3: Verify old frontend still works**

```bash
cd /home/hanshino/workspace/redive_linebot/frontend
yarn start
```

Expected: Old frontend runs on port 3000 exactly as before — completely unaffected.

**Step 4: Commit and tag**

```bash
cd /home/hanshino/workspace/redive_linebot
git add -A
git commit -m "feat: complete Phase 1 — frontend-next scaffold with Vite, React 19, MUI v7"
```

---

## Summary

After completing all 8 tasks, you will have:

1. A running `frontend-next/` Vite + React 19 app
2. MUI v7 with a game-themed dark UI (blue-purple + gold)
3. All routes from the original frontend defined with placeholder pages
4. API service layer ready to connect to the existing backend
5. Vite dev proxy configured for `/api` and `/socket.io`
6. Docker configuration for both dev and production
7. The original `frontend/` completely untouched

**Next:** Phase 2 will implement the homepage (Hero + Stats + Announcements + Feature shortcuts).
