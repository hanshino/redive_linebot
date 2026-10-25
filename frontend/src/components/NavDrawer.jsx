import { useState } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
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
import useLiff from "../context/useLiff";
import HomeIcon from "@mui/icons-material/Home";
import EqualizerIcon from "@mui/icons-material/Equalizer";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import StorefrontIcon from "@mui/icons-material/Storefront";
import ShoppingBasketIcon from "@mui/icons-material/ShoppingBasket";
import SellIcon from "@mui/icons-material/Sell";
import LocalMallIcon from "@mui/icons-material/LocalMall";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import GroupsIcon from "@mui/icons-material/Groups";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import SportsMmaIcon from "@mui/icons-material/SportsMma";
import MessageIcon from "@mui/icons-material/Message";
import ForumIcon from "@mui/icons-material/Forum";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import MilitaryTechIcon from "@mui/icons-material/MilitaryTech";
import BackHandIcon from "@mui/icons-material/BackHand";
import WhatshotIcon from "@mui/icons-material/Whatshot";
import GitHubIcon from "@mui/icons-material/GitHub";
import FacebookIcon from "@mui/icons-material/Facebook";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LoginIcon from "@mui/icons-material/Login";
import CelebrationIcon from "@mui/icons-material/Celebration";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggest";
import HistoryIcon from "@mui/icons-material/History";
import InsightsIcon from "@mui/icons-material/Insights";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import BubbleChartIcon from "@mui/icons-material/BubbleChart";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";

// 沒有分組、永遠顯示的項目。使用手冊原本獨佔一個「機器人功能」分組，併進來當說明入口。
const mainItems = [
  { label: "首頁", path: "/", icon: HomeIcon },
  { label: "排行榜", path: "/rankings", icon: EqualizerIcon },
  { label: "使用手冊", path: "/panel/manual", icon: MenuBookIcon },
];

// `also`：該項目底下的子頁（詳情、編輯…）路徑前綴，讓子頁也能點亮父項目。
const sections = [
  {
    key: "chatLevel",
    title: "聊天等級",
    auth: "user",
    items: [
      { label: "簽到月曆", path: "/signin", icon: EventAvailableIcon },
      { label: "成就系統", path: "/achievements", icon: MilitaryTechIcon },
      { label: "轉生之路", path: "/prestige", icon: AutoAwesomeIcon },
      { label: "經驗歷程", path: "/xp-history", icon: InsightsIcon },
    ],
  },
  {
    key: "princess",
    title: "公主連結",
    auth: "user",
    items: [
      { label: "轉蛋商店", path: "/gacha/exchange", icon: StorefrontIcon },
      { label: "轉蛋包包", path: "/bag", icon: LocalMallIcon },
      { label: "裝備管理", path: "/equipment", icon: FitnessCenterIcon },
    ],
  },
  {
    key: "arena",
    title: "競技場",
    items: [
      { label: "猜拳競技場", path: "/janken", icon: BackHandIcon },
      { label: "世界王", path: "/worldboss", icon: WhatshotIcon },
      { label: "蘭德索爾盃", path: "/race", icon: EmojiEventsIcon },
    ],
  },
  {
    key: "trade",
    title: "交易",
    auth: "user",
    items: [
      {
        label: "角色交易所",
        path: "/trade/market",
        icon: ShoppingBasketIcon,
        also: ["/trade/listings", "/trade/buy"],
      },
      { label: "我的掛單", path: "/trade/my-listings", icon: SellIcon, also: ["/trade/sell"] },
    ],
  },
  {
    key: "auto",
    title: "自動化",
    auth: "user",
    items: [
      { label: "自動設定", path: "/auto/settings", icon: SettingsSuggestIcon },
      { label: "今日自動配對", path: "/auto/match", icon: SportsMmaIcon },
      { label: "自動行為紀錄", path: "/auto/history", icon: HistoryIcon },
    ],
  },
  {
    key: "groups",
    title: "群組與聊天",
    auth: "user",
    items: [
      { label: "我的群組", path: "/groups", icon: GroupsIcon, also: ["/group/"] },
      { label: "聊天文字雲", path: "/topics", icon: BubbleChartIcon },
    ],
  },
  {
    key: "admin",
    title: "管理員",
    auth: "admin",
    items: [
      { label: "角色卡池", path: "/admin/gacha-pool", icon: SportsEsportsIcon },
      { label: "轉蛋活動", path: "/admin/gacha-banner", icon: CelebrationIcon },
      { label: "女神石商店", path: "/admin/gacha-shop", icon: StorefrontIcon },
      { label: "全群指令管理", path: "/admin/global-order", icon: MessageIcon },
      { label: "訊息實況", path: "/admin/messages", icon: ForumIcon },
      { label: "優惠券管理", path: "/admin/coupons", icon: ConfirmationNumberIcon },
      { label: "世界王管理", path: "/admin/worldboss", icon: AdminPanelSettingsIcon },
    ],
  },
  {
    key: "owner",
    title: "站務",
    auth: "owner",
    items: [{ label: "贊助管理", path: "/owner/sponsorships", icon: VolunteerActivismIcon }],
  },
  {
    key: "links",
    title: "相關連結",
    items: [
      {
        label: "巴哈更新串",
        url: "https://forum.gamer.com.tw/C.php?bsn=30861&snA=12030",
        icon: NewspaperIcon,
      },
      {
        label: "FB 粉絲團",
        url: "https://www.facebook.com/LINE%E5%B8%83%E4%B8%81%E6%A9%9F%E5%99%A8%E4%BA%BA-107652374176498",
        icon: FacebookIcon,
      },
      {
        label: "GitHub 原始碼",
        url: "https://github.com/hanshino/redive_linebot",
        icon: GitHubIcon,
      },
    ],
  },
];

const ROW_MIN_HEIGHT = 44;

function isActive(pathname, { path, also = [] }) {
  if (!path) return false;
  if (path === "/") return pathname === "/";
  return [path, ...also].some(p =>
    p.endsWith("/") ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)
  );
}

// 目前路由落在哪個分組裡；進頁面時自動展開，使用者不用自己找。
function findActiveSectionKey(pathname) {
  return sections.find(s => s.items.some(item => isActive(pathname, item)))?.key;
}

function NavRow({ item, active, indent, onNavigate }) {
  const { label, path, url, icon: Icon } = item;
  // 內部連結用真的 <a>（可長按、可在新分頁開）；外部連結 target=_blank 並標示。
  const linkProps = url
    ? { component: "a", href: url, target: "_blank", rel: "noopener noreferrer" }
    : { component: RouterLink, to: path, onClick: onNavigate };

  return (
    <ListItem disablePadding>
      <ListItemButton
        {...linkProps}
        selected={active}
        aria-current={active ? "page" : undefined}
        sx={{ minHeight: ROW_MIN_HEIGHT, pl: indent ? 3 : 2 }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Icon fontSize="small" />
        </ListItemIcon>
        <ListItemText primary={label} slotProps={{ primary: { variant: "body2" } }} />
        {url && <OpenInNewIcon fontSize="inherit" titleAccess="另開新視窗" sx={{ opacity: 0.6 }} />}
      </ListItemButton>
    </ListItem>
  );
}

function NavSection({ id, title, items, open, onToggle, onNavigate, currentPath }) {
  const panelId = `nav-section-${id}`;
  return (
    <>
      <ListItemButton
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        sx={{ minHeight: ROW_MIN_HEIGHT }}
      >
        <ListItemText
          primary={title}
          slotProps={{
            primary: {
              variant: "caption",
              sx: { fontWeight: 700, color: "text.secondary", letterSpacing: 1 },
            },
          }}
        />
        {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
      </ListItemButton>
      <Collapse in={open} timeout="auto" unmountOnExit id={panelId}>
        <List disablePadding>
          {items.map(item => (
            <NavRow
              key={item.label}
              item={item}
              indent
              active={isActive(currentPath, item)}
              onNavigate={onNavigate}
            />
          ))}
        </List>
      </Collapse>
    </>
  );
}

export default function NavDrawer({ onClose }) {
  const { loggedIn, isAdmin, profile, login } = useLiff();
  const canManageSponsorship = profile?.canManageSponsorship === true;
  const { pathname } = useLocation();

  const [openSections, setOpenSections] = useState(() => {
    const activeKey = findActiveSectionKey(pathname);
    return activeKey ? { [activeKey]: true } : {};
  });

  // 路由變了就把所屬分組展開（只加不收，使用者自己開的分組不動）。
  // 用「渲染中比對上一次 pathname」而不是 effect，避免多一次渲染閃爍。
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    const activeKey = findActiveSectionKey(pathname);
    if (activeKey && !openSections[activeKey]) {
      setOpenSections(prev => ({ ...prev, [activeKey]: true }));
    }
  }

  const toggleSection = key => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const canSee = auth => {
    if (auth === "user") return loggedIn;
    if (auth === "admin") return isAdmin;
    if (auth === "owner") return canManageSponsorship;
    return true;
  };

  const visibleSections = sections.filter(s => s.key !== "links" && canSee(s.auth));
  const linkSection = sections.find(s => s.key === "links");

  const renderSection = s => (
    <NavSection
      key={s.key}
      id={s.key}
      title={s.title}
      items={s.items}
      open={Boolean(openSections[s.key])}
      onToggle={() => toggleSection(s.key)}
      onNavigate={onClose}
      currentPath={pathname}
    />
  );

  return (
    <Box component="nav" aria-label="主選單" sx={{ width: "100%", pt: 1, overflowX: "hidden" }}>
      <List>
        {mainItems.map(item => (
          <NavRow
            key={item.label}
            item={item}
            active={isActive(pathname, item)}
            onNavigate={onClose}
          />
        ))}
      </List>

      <Divider />

      {visibleSections.map(renderSection)}

      {/* 登出時被隱藏的分組不要憑空消失：留一列說明並直接給登入。 */}
      {!loggedIn && (
        <ListItem disablePadding>
          <ListItemButton onClick={login} sx={{ minHeight: ROW_MIN_HEIGHT }}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LoginIcon fontSize="small" color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="登入後可使用更多功能"
              slotProps={{
                primary: { variant: "body2", sx: { color: "primary.main", fontWeight: 600 } },
              }}
            />
          </ListItemButton>
        </ListItem>
      )}

      <Divider sx={{ my: 1 }} />

      {renderSection(linkSection)}
    </Box>
  );
}
