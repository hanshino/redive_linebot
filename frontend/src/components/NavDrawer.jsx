import { useLocation, useNavigate } from "react-router-dom";
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  Divider,
} from "@mui/material";
import { useState } from "react";
import useLiff from "../context/useLiff";
import HomeIcon from "@mui/icons-material/Home";
import EqualizerIcon from "@mui/icons-material/Equalizer";
import MoneyIcon from "@mui/icons-material/Money";
import LoopIcon from "@mui/icons-material/Loop";
import StorefrontIcon from "@mui/icons-material/Storefront";
import LibraryBooksIcon from "@mui/icons-material/LibraryBooks";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import ShoppingBasketIcon from "@mui/icons-material/ShoppingBasket";
import LocalMallIcon from "@mui/icons-material/LocalMall";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import MessageIcon from "@mui/icons-material/Message";
import PetsIcon from "@mui/icons-material/Pets";
import SportsHandballIcon from "@mui/icons-material/SportsHandball";
import GitHubIcon from "@mui/icons-material/GitHub";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import LinkIcon from "@mui/icons-material/Link";

const mainItems = [
  { label: "首頁", path: "/", icon: HomeIcon },
  { label: "排行榜", path: "/rankings", icon: EqualizerIcon },
  { label: "刮刮卡", path: "/scratch-card", icon: MoneyIcon },
];

const princessItems = [
  { label: "補償刀軸換算", path: "/tools/battle-time", icon: LoopIcon },
  { label: "轉蛋商店", path: "/gacha/exchange", icon: StorefrontIcon },
];

const botItems = [
  { label: "使用手冊", path: "/panel/manual", icon: LibraryBooksIcon },
  { label: "訂閱通知", path: "/bot/notify", icon: NotificationsActiveIcon },
];

const personalItems = [
  { label: "交易管理", path: "/trade/manage", icon: ShoppingBasketIcon },
  { label: "轉蛋包包", path: "/bag", icon: LocalMallIcon },
  { label: "裝備管理", path: "/equipment", icon: FitnessCenterIcon },
  { label: "刮刮卡兌獎", path: "/scratch-card/exchange", icon: MoneyIcon },
];

const adminItems = [
  { label: "轉蛋管理", path: "/admin/gacha-pool", icon: SportsEsportsIcon },
  { label: "女神石商店", path: "/admin/gacha-shop", icon: StorefrontIcon },
  { label: "全群指令管理", path: "/admin/global-order", icon: MessageIcon },
  { label: "訊息實況", path: "/admin/messages", icon: MessageIcon },
  { label: "世界王設定", path: "/admin/worldboss", icon: PetsIcon },
  { label: "世界王活動", path: "/admin/worldboss-event", icon: SportsHandballIcon },
  { label: "世界王訊息", path: "/admin/worldboss-message", icon: FitnessCenterIcon },
  { label: "刮刮卡管理", path: "/admin/scratch-card", icon: MoneyIcon },
];

const linkItems = [
  { label: "巴哈更新串", url: "https://forum.gamer.com.tw/C.php?bsn=30861&snA=12030", icon: LinkIcon },
  { label: "FB 粉絲團", url: "https://www.facebook.com/LINE%E5%B8%83%E4%B8%81%E6%A9%9F%E5%99%A8%E4%BA%BA-107652374176498", icon: LinkIcon },
  { label: "GitHub 原始碼", url: "https://github.com/hanshino/redive_linebot", icon: GitHubIcon },
];

function NavSection({ title, items, open, onToggle, onNavigate, currentPath }) {
  return (
    <>
      <ListItemButton onClick={onToggle}>
        <ListItemText
          primary={title}
          slotProps={{ primary: { variant: "caption", sx: { fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 1 } } }}
        />
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <List disablePadding>
          {items.map(({ label, path, url, icon: Icon }) => (
            <ListItem key={label} disablePadding>
              <ListItemButton
                selected={path && currentPath === path}
                onClick={() => (url ? window.open(url, "_blank") : onNavigate(path))}
                sx={{ pl: 3 }}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={label} slotProps={{ primary: { variant: "body2" } }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Collapse>
    </>
  );
}

export default function NavDrawer({ onClose }) {
  const { loggedIn } = useLiff();
  const location = useLocation();
  const navigate = useNavigate();
  const [openSections, setOpenSections] = useState({
    princess: false,
    bot: false,
    personal: false,
    admin: false,
    links: false,
  });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleNavigate = (path) => {
    navigate(path);
    onClose?.();
  };

  return (
    <Box sx={{ width: 260, pt: 1 }}>
      <List>
        {mainItems.map(({ label, path, icon: Icon }) => (
          <ListItem key={label} disablePadding>
            <ListItemButton
              selected={location.pathname === path}
              onClick={() => handleNavigate(path)}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={label} slotProps={{ primary: { variant: "body2" } }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      <NavSection
        title="公主連結"
        items={princessItems}
        open={openSections.princess}
        onToggle={() => toggleSection("princess")}
        onNavigate={handleNavigate}
        currentPath={location.pathname}
      />
      <NavSection
        title="機器人功能"
        items={botItems}
        open={openSections.bot}
        onToggle={() => toggleSection("bot")}
        onNavigate={handleNavigate}
        currentPath={location.pathname}
      />
      <NavSection
        title="個人功能"
        items={personalItems}
        open={openSections.personal}
        onToggle={() => toggleSection("personal")}
        onNavigate={handleNavigate}
        currentPath={location.pathname}
      />
      {loggedIn && (
        <NavSection
          title="管理員"
          items={adminItems}
          open={openSections.admin}
          onToggle={() => toggleSection("admin")}
          onNavigate={handleNavigate}
          currentPath={location.pathname}
        />
      )}

      <Divider sx={{ my: 1 }} />

      <NavSection
        title="相關連結"
        items={linkItems}
        open={openSections.links}
        onToggle={() => toggleSection("links")}
        onNavigate={handleNavigate}
        currentPath={location.pathname}
      />
    </Box>
  );
}
