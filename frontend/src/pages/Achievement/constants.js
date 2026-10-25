// Shared achievement display maps. Kept out of index.jsx because a page file
// may only export components (react-refresh/only-export-components) — pages
// other than Achievement (e.g. Signin's unlock toast) render the same icons.
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutlined";
import CatchingPokemonIcon from "@mui/icons-material/CatchingPokemon";
import GavelIcon from "@mui/icons-material/Gavel";
import ShieldIcon from "@mui/icons-material/Shield";
import PeopleIcon from "@mui/icons-material/People";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import SportsScoreIcon from "@mui/icons-material/SportsScore";
import StorefrontIcon from "@mui/icons-material/Storefront";

// 稀有度顏色與名稱在 theme.palette.rarity[0..3]（{ main, bg, label }，深淺模式各自調過），
// 不要在頁面裡再寫死 hex。未知稀有度退回「普通」。
export function getRarity(theme, rarity) {
  return theme.palette.rarity[rarity] ?? theme.palette.rarity[0];
}

// Category-level fallback, keyed by `category_key`. Signin achievement keys are
// deliberately absent from ACHIEVEMENT_ICONS (they are not committed), so they
// resolve here — a new signin achievement needs no frontend change.
export const CATEGORY_ICONS = {
  chat: ChatBubbleOutlineIcon,
  gacha: CatchingPokemonIcon,
  janken: GavelIcon,
  world_boss: ShieldIcon,
  social: PeopleIcon,
  subscribe: CardGiftcardIcon,
  signin: CalendarMonthIcon,
  race: SportsScoreIcon,
  market: StorefrontIcon,
};
