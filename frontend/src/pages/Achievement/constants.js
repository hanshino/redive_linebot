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

export const RARITY_CONFIG = {
  0: { label: "普通", color: "#757575", bg: "#f5f5f5" },
  1: { label: "稀有", color: "#6c5ce7", bg: "#ede7f6" },
  2: { label: "史詩", color: "#b8860b", bg: "#fff8e1" },
  3: { label: "傳說", color: "#d63384", bg: "#fce4ec" },
};

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
