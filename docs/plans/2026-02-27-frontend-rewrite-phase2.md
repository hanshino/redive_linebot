# Phase 2: Homepage Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> **For Claude:** Use ui-ux-pro-max guidelines: dark mode OLED style, skeleton loading, 150-300ms transitions, ease-out easing, prefers-reduced-motion support, no emojis as icons.

**Goal:** Build the new homepage with Hero Banner, Stats Cards, Announcements, Feature Shortcuts, and connect to existing API endpoints.

**Architecture:** Homepage composed of 5 sections as separate components, fetching data from `/api/Pudding/Statistics` and `/api/Announcement/1`. Uses MUI v7 sx prop for styling. Animated number counters via CSS transitions.

**Tech Stack:** React 19, MUI v7, Recharts, axios (via services layer from Phase 1)

---

## Task 1: Create HeroBanner Component

**Files:**
- Create: `frontend-next/src/pages/Home/HeroBanner.jsx`

**Step 1: Create HeroBanner**

This is the top section of the homepage — a visually striking banner with welcome text and bot status.

Create `frontend-next/src/pages/Home/HeroBanner.jsx`:

```jsx
import { Box, Typography, Chip } from "@mui/material";
import SmartToyIcon from "@mui/icons-material/SmartToy";

export default function HeroBanner() {
  return (
    <Box
      sx={{
        position: "relative",
        borderRadius: 3,
        p: { xs: 3, md: 5 },
        mb: 3,
        background: "linear-gradient(135deg, rgba(108, 99, 255, 0.15) 0%, rgba(255, 184, 48, 0.08) 100%)",
        border: "1px solid rgba(108, 99, 255, 0.2)",
        overflow: "hidden",
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "radial-gradient(ellipse at 20% 50%, rgba(108, 99, 255, 0.1) 0%, transparent 70%)",
          pointerEvents: "none",
        },
      }}
    >
      <Box sx={{ position: "relative", zIndex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
          <SmartToyIcon sx={{ fontSize: 32, color: "secondary.main" }} />
          <Typography variant="h4" component="h1">
            布丁機器人
          </Typography>
        </Box>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2, maxWidth: 600 }}>
          Princess Connect RE:Dive LINE Bot Dashboard
        </Typography>
        <Chip
          label="Bot Online"
          color="success"
          size="small"
          sx={{ fontWeight: 600 }}
        />
      </Box>
    </Box>
  );
}
```

**Step 2: Verify it renders**

Temporarily import in Home/index.jsx and check in browser.

**Step 3: Commit**

```bash
git add frontend-next/src/pages/Home/HeroBanner.jsx
git commit -m "feat: add HeroBanner component for homepage"
```

---

## Task 2: Create StatsCard and StatsGrid Components

**Files:**
- Create: `frontend-next/src/pages/Home/StatsCard.jsx`
- Create: `frontend-next/src/pages/Home/StatsGrid.jsx`

**Step 1: Create StatsCard**

A single stat card with icon, label, value, and animated counter effect. Uses MUI Skeleton for loading state.

Create `frontend-next/src/pages/Home/StatsCard.jsx`:

```jsx
import { Card, CardContent, Box, Typography, Skeleton } from "@mui/material";

export default function StatsCard({ icon: Icon, label, value, loading }) {
  return (
    <Card
      sx={{
        height: "100%",
        cursor: "default",
        transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out",
      }}
    >
      <CardContent sx={{ display: "flex", alignItems: "center", gap: 2, p: 2.5 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 2,
            bgcolor: "rgba(108, 99, 255, 0.1)",
            color: "primary.main",
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 28 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          {loading ? (
            <Skeleton width={80} height={32} />
          ) : (
            <Typography variant="h5" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {typeof value === "number" ? value.toLocaleString() : value ?? "—"}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Create StatsGrid**

Fetches data from `/api/Pudding/Statistics` and renders 6 StatsCards in a responsive grid.

Create `frontend-next/src/pages/Home/StatsGrid.jsx`:

```jsx
import { useState, useEffect } from "react";
import { Grid } from "@mui/material";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import PeopleIcon from "@mui/icons-material/People";
import TextsmsIcon from "@mui/icons-material/Textsms";
import InsertEmoticonIcon from "@mui/icons-material/InsertEmoticon";
import DirectionsRunIcon from "@mui/icons-material/DirectionsRun";
import CommentIcon from "@mui/icons-material/Comment";
import StatsCard from "./StatsCard";
import { getLineBotData } from "../../services/statistics";

const statsConfig = [
  { key: "CustomerOrderCount", label: "自訂指令", icon: LibraryBooksIcon },
  { key: "GuildCount", label: "群組數", icon: PeopleIcon },
  { key: "TotalSpeakTimes", label: "訊息紀錄", icon: TextsmsIcon },
  { key: "UserCount", label: "用戶數", icon: InsertEmoticonIcon },
  { key: "onlineCount", label: "線上人數", icon: DirectionsRunIcon },
  { key: "speakTimes", label: "即時訊息數", icon: CommentIcon },
];

export default function StatsGrid() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLineBotData()
      .then(setData)
      .catch(() => setData({}))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {statsConfig.map(({ key, label, icon }) => (
        <Grid size={{ xs: 6, sm: 4, md: 2 }} key={key}>
          <StatsCard icon={icon} label={label} value={data[key]} loading={loading} />
        </Grid>
      ))}
    </Grid>
  );
}
```

Note: MUI v7 Grid uses `size` prop instead of `item xs={6}`.

**Step 3: Verify StatsGrid renders with loading skeletons**

Import in Home/index.jsx temporarily.

**Step 4: Commit**

```bash
git add frontend-next/src/pages/Home/StatsCard.jsx frontend-next/src/pages/Home/StatsGrid.jsx
git commit -m "feat: add StatsCard and StatsGrid with API integration"
```

---

## Task 3: Create AnnouncementBoard Component

**Files:**
- Create: `frontend-next/src/pages/Home/AnnouncementBoard.jsx`

**Step 1: Create AnnouncementBoard**

Game bulletin-style announcement section. Fetches from `/api/Announcement/1`.

Create `frontend-next/src/pages/Home/AnnouncementBoard.jsx`:

```jsx
import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Skeleton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CampaignIcon from "@mui/icons-material/Campaign";
import api from "../../services/api";

export default function AnnouncementBoard() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/Announcement/1")
      .then((r) => setAnnouncements(r.data || []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoading(false));
  }, []);

  const breakingNews = announcements[0];
  const otherNews = announcements.slice(1, 4);

  if (loading) {
    return (
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Skeleton height={32} width={120} sx={{ mb: 2 }} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <CampaignIcon sx={{ color: "secondary.main" }} />
          <Typography variant="h6">公告欄</Typography>
        </Box>

        {breakingNews ? (
          <Alert
            severity={breakingNews.severity || "info"}
            sx={{ mb: otherNews.length > 0 ? 2 : 0 }}
          >
            <Typography variant="subtitle2">{breakingNews.title}</Typography>
            {breakingNews.content && (
              <Typography variant="body2">{breakingNews.content}</Typography>
            )}
          </Alert>
        ) : (
          <Typography variant="body2" color="text.secondary">
            目前沒有公告
          </Typography>
        )}

        {otherNews.map((news, index) => (
          <Accordion
            key={index}
            disableGutters
            sx={{
              bgcolor: "transparent",
              "&::before": { display: "none" },
              boxShadow: "none",
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">{news.title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary">
                {news.content}
              </Typography>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add frontend-next/src/pages/Home/AnnouncementBoard.jsx
git commit -m "feat: add AnnouncementBoard component with API integration"
```

---

## Task 4: Create FeatureGrid Component

**Files:**
- Create: `frontend-next/src/pages/Home/FeatureGrid.jsx`

**Step 1: Create FeatureGrid**

Grid of game-style shortcut buttons linking to main features.

Create `frontend-next/src/pages/Home/FeatureGrid.jsx`:

```jsx
import { useNavigate } from "react-router-dom";
import { Grid, Card, CardActionArea, CardContent, Box, Typography } from "@mui/material";
import HowToVoteIcon from "@mui/icons-material/HowToVote";
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver";
import GroupIcon from "@mui/icons-material/Group";
import LocalLibraryIcon from "@mui/icons-material/LocalLibrary";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import StorefrontIcon from "@mui/icons-material/Storefront";
import CasinoIcon from "@mui/icons-material/Casino";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";

const features = [
  { icon: HowToVoteIcon, label: "專屬指令", description: "自訂群組指令", path: null, color: "#6C63FF" },
  { icon: RecordVoiceOverIcon, label: "幹話等級", description: "聊天經驗排行", path: "/rankings", color: "#FFB830" },
  { icon: GroupIcon, label: "公會管理", description: "群組設定管理", path: null, color: "#51CF66" },
  { icon: LocalLibraryIcon, label: "遊戲查詢", description: "角色與裝備資訊", path: null, color: "#74C0FC" },
  { icon: EmojiEventsIcon, label: "公會戰", description: "報刀與戰績", path: null, color: "#FF6B6B" },
  { icon: StorefrontIcon, label: "轉蛋商店", description: "女神石兌換", path: "/gacha/exchange", color: "#E599F7" },
  { icon: CasinoIcon, label: "刮刮卡", description: "試試手氣", path: "/scratch-card", color: "#FFB830" },
  { icon: FitnessCenterIcon, label: "裝備管理", description: "查看我的裝備", path: "/equipment", color: "#FF6B6B" },
];

export default function FeatureGrid() {
  const navigate = useNavigate();

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        功能一覽
      </Typography>
      <Grid container spacing={2}>
        {features.map(({ icon: Icon, label, description, path, color }) => (
          <Grid size={{ xs: 6, sm: 4, md: 3 }} key={label}>
            <Card
              sx={{
                height: "100%",
                transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out, transform 0.2s ease-out",
                "&:hover": {
                  transform: "translateY(-2px)",
                },
              }}
            >
              <CardActionArea
                onClick={() => path && navigate(path)}
                disabled={!path}
                sx={{ height: "100%", p: 2 }}
              >
                <CardContent sx={{ textAlign: "center", p: 0 }}>
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 56,
                      height: 56,
                      borderRadius: 2,
                      bgcolor: `${color}15`,
                      mb: 1.5,
                    }}
                  >
                    <Icon sx={{ fontSize: 32, color }} />
                  </Box>
                  <Typography variant="subtitle2" gutterBottom>
                    {label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {description}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add frontend-next/src/pages/Home/FeatureGrid.jsx
git commit -m "feat: add FeatureGrid component with game-style feature shortcuts"
```

---

## Task 5: Assemble Homepage

**Files:**
- Modify: `frontend-next/src/pages/Home/index.jsx`

**Step 1: Assemble all components into the Home page**

Replace `frontend-next/src/pages/Home/index.jsx`:

```jsx
import { useEffect } from "react";
import { Box } from "@mui/material";
import HeroBanner from "./HeroBanner";
import StatsGrid from "./StatsGrid";
import AnnouncementBoard from "./AnnouncementBoard";
import FeatureGrid from "./FeatureGrid";

export default function Home() {
  useEffect(() => {
    document.title = "布丁機器人";
  }, []);

  return (
    <Box sx={{ maxWidth: 1200, mx: "auto" }}>
      <HeroBanner />
      <StatsGrid />
      <AnnouncementBoard />
      <FeatureGrid />
    </Box>
  );
}
```

**Step 2: Verify homepage renders all sections**

```bash
cd /home/hanshino/workspace/redive_linebot/frontend-next && yarn dev
```

Navigate to `/` and verify:
- Hero banner with gradient background, bot icon, title, online chip
- 6 stat cards in a grid (will show loading skeletons if no backend)
- Announcement board (will show "目前沒有公告" if no backend)
- 8 feature shortcut cards in grid

**Step 3: Verify production build**

```bash
yarn build
```

**Step 4: Commit**

```bash
git add frontend-next/src/pages/Home/index.jsx
git commit -m "feat: assemble homepage with HeroBanner, StatsGrid, AnnouncementBoard, FeatureGrid"
```

---

## Summary

After completing all 5 tasks:
1. HeroBanner — gradient banner with bot status
2. StatsGrid — 6 stat cards connected to `/api/Pudding/Statistics`
3. AnnouncementBoard — bulletin board connected to `/api/Announcement/1`
4. FeatureGrid — 8 game-style feature shortcut cards
5. Home page assembles all components

**Next:** Phase 3 will implement the NavBar and MainLayout with responsive drawer navigation.
