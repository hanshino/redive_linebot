import HomeIcon from "@mui/icons-material/Home";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import ShoppingBasketIcon from "@mui/icons-material/ShoppingBasket";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";

// 常用四個入口：手機底部導覽與桌機 AppBar 頂部分頁共用，入口與點亮規則保持一致。
export const destinations = [
  { label: "首頁", path: "/", icon: HomeIcon, match: p => p === "/" },
  { label: "簽到", path: "/signin", icon: EventAvailableIcon, match: p => p === "/signin" },
  {
    label: "市場",
    path: "/trade/market",
    icon: ShoppingBasketIcon,
    match: p => p.startsWith("/trade/"),
  },
  { label: "排行榜", path: "/rankings", icon: LeaderboardIcon, match: p => p === "/rankings" },
];
