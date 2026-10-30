import { alpha, createTheme } from "@mui/material/styles";

// Miyako (宮子) inspired color palette
// Primary: Cyan/light blue — her hair color
// Secondary: Amber/caramel — pudding (布丁)
// Accent: Red — her eyes
// Decorative: Purple (scarf), Orange (skirt)

// 只有可點的卡片才有 hover 浮起：內含 CardActionArea，或自己標 data-interactive。
// 靜態資訊卡浮起會讓人以為能點。
const INTERACTIVE_CARD_HOVER = "&:has(> .MuiCardActionArea-root):hover, &[data-interactive]:hover";

// 卡面數字與名字用的展示字體（Chakra Petch 只有拉丁字，中文落回 Noto Sans TC）。
export const displayFont = ['"Chakra Petch"', '"Noto Sans TC"', "system-ui", "sans-serif"].join(
  ","
);

// 舞台卡（猜拳、世界王）：深夜底 + 琥珀細框，深淺模式都一樣。
const stageTokens = {
  stage: {
    bg: "#0A1A2A",
    panel: "#12243A",
    line: "#24364B",
    hairline: "#C98A12",
    accent: "#FBBF24",
    onAccent: "#1F1300",
    text: "#F3F7FA",
  },
};

// 功能卡插圖用色。插圖是畫，不跟著深淺模式換，只有底色與地面線換。
const artTokens = {
  paper: "#FFFFFF",
  ink: "#5A6B7F",
  skin: "#F6D9C4",
  cyan: "#007C89",
  cyanPale: "#CFEAEC",
  violet: "#5B4BC4",
  violetDeep: "#3E2F9B",
  violetPale: "#D9D3F6",
  caramel: "#B45309",
  caramelDeep: "#8A3F06",
  amber: "#F59E0B",
  cream: "#FFF7E6",
  gold: "#8A6100",
  goldDeep: "#6B4B00",
  pink: "#C2185B",
  pinkPale: "#FFE2EE",
  stageRing: "#1B3350",
  stageFloor: "#24405F",
  stageLight: "#E6EDF4",
  steel: "#C7D4E0",
  horn: "#D9E6F0",
  beast: "#2F6B4F",
  beastLight: "#3C8A63",
  beastMouth: "#17304A",
};

// 語意色：頁面不要再寫死 hex，從 theme.palette.<key> 取，深淺模式各自調過。
// rarity: 成就稀有度 0-3；medal: 排行前三名；currency: 女神石。
const lightTokens = {
  rarity: {
    0: { main: "#616161", bg: "#F5F5F5", label: "普通" },
    1: { main: "#5B4BC4", bg: "#EDE7F6", label: "稀有" },
    2: { main: "#8A6100", bg: "#FFF8E1", label: "史詩" },
    3: { main: "#C2185B", bg: "#FCE4EC", label: "傳說" },
  },
  medal: ["#FFD700", "#C0C0C0", "#CD7F32"],
  currency: { main: "#B45309", bg: "#FFF7E6" },
  surface: { subtle: "#F5F7FA", inset: "#EEF2F6" },
  // 首頁卡冊：功能卡的中性青框、名牌帶遮罩、傳說框的箔光。
  card: {
    frame: "#BBD6DA",
    scrim:
      "linear-gradient(to top, rgba(10,20,30,0.88) 0 42%, rgba(10,20,30,0.55) 70%, rgba(10,20,30,0))",
    onScrim: "#FFFFFF",
    onScrimMuted: "#D9E4EC",
    onScrimAccent: "#FFC4DA",
    foil: "linear-gradient(140deg,#F2A8C6 0%,#C2185B 22%,#7B1FA2 44%,#2F7FD1 60%,#C2185B 80%,#FFD08A 100%)",
    foilBands:
      "repeating-linear-gradient(112deg,rgba(255,0,128,0.35) 0 10px,rgba(255,193,7,0.32) 10px 20px,rgba(0,230,180,0.32) 20px 30px,rgba(80,120,255,0.35) 30px 40px)",
    sheen: "rgba(255,255,255,0.45)",
  },
  ...stageTokens,
  art: { ...artTokens, bg: "#EAF1F6", line: "#C3D2DE" },
};

const darkTokens = {
  rarity: {
    0: { main: "#BDBDBD", bg: "rgba(189, 189, 189, 0.12)", label: "普通" },
    1: { main: "#B3A8FF", bg: "rgba(179, 168, 255, 0.14)", label: "稀有" },
    2: { main: "#F2C14E", bg: "rgba(242, 193, 78, 0.14)", label: "史詩" },
    3: { main: "#FF8FB8", bg: "rgba(255, 143, 184, 0.14)", label: "傳說" },
  },
  medal: ["#D4AF37", "#A8A8A8", "#A05A2C"],
  currency: { main: "#FBBF24", bg: "rgba(251, 191, 36, 0.12)" },
  surface: { subtle: "#0E1E30", inset: "#173049" },
  card: {
    frame: "#2E4D55",
    scrim:
      "linear-gradient(to top, rgba(4,10,18,0.9) 0 42%, rgba(4,10,18,0.55) 70%, rgba(4,10,18,0))",
    onScrim: "#FFFFFF",
    onScrimMuted: "#D9E4EC",
    onScrimAccent: "#FFC4DA",
    foil: "linear-gradient(140deg,#F2A8C6 0%,#C2185B 22%,#7B1FA2 44%,#2F7FD1 60%,#C2185B 80%,#FFD08A 100%)",
    foilBands:
      "repeating-linear-gradient(112deg,rgba(255,0,128,0.35) 0 10px,rgba(255,193,7,0.32) 10px 20px,rgba(0,230,180,0.32) 20px 30px,rgba(80,120,255,0.35) 30px 40px)",
    sheen: "rgba(255,255,255,0.3)",
  },
  ...stageTokens,
  art: { ...artTokens, bg: "#173049", line: "#2B4560" },
};

const shared = {
  typography: {
    fontFamily: ["Roboto", '"Noto Sans TC"', '"Helvetica Neue"', "Arial", "sans-serif"].join(","),
    h4: { fontWeight: 700 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: {
    borderRadius: 12,
  },
};

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: "light",
    // main 是給「文字、連結、實心按鈕底色」用的，必須在白底與 #F5F7FA 都達 4.5:1。
    // 宮子髮色的亮青 #00ACC1 降為 light，只用在大面積裝飾、圖表、邊框。
    primary: {
      main: "#007C89",
      light: "#00ACC1",
      dark: "#005F69",
      contrastText: "#FFFFFF",
    },
    // 布丁的焦糖層：main 用焦糖色才能當文字與白字按鈕底；亮琥珀留給 light。
    secondary: {
      main: "#B45309",
      light: "#F59E0B",
      dark: "#92400E",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#F5F7FA",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#1A2332",
      secondary: "#5A6B7F",
    },
    error: { main: "#DC2626" },
    warning: { main: "#B45309" },
    success: { main: "#15803D" },
    info: { main: "#007C89" },
    divider: "rgba(0, 172, 193, 0.12)",
    ...lightTokens,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "::selection": { backgroundColor: "rgba(0, 172, 193, 0.25)" },
        body: { caretColor: "#007C89" },
        ":focus-visible": { outline: "2px solid #007C89", outlineOffset: 2 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(0, 172, 193, 0.12)",
          transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out",
          [INTERACTIVE_CARD_HOVER]: {
            borderColor: "rgba(0, 172, 193, 0.3)",
            boxShadow: "0 4px 20px rgba(0, 172, 193, 0.1)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0, 172, 193, 0.12)",
          color: "#1A2332",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: "1px solid rgba(0, 172, 193, 0.12)",
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: "dark",
    primary: {
      main: "#26C6DA",
      light: "#4DD0E1",
      dark: "#00ACC1",
      contrastText: "#0A1A2A",
    },
    secondary: {
      main: "#FBBF24",
      light: "#FCD34D",
      dark: "#F59E0B",
      contrastText: "#1A1A2E",
    },
    background: {
      default: "#0A1A2A",
      paper: "#12243A",
    },
    text: {
      primary: "#E8EEF4",
      secondary: "#8DA4BE",
    },
    error: { main: "#F87171" },
    warning: { main: "#FBBF24" },
    success: { main: "#4ADE80" },
    info: { main: "#4DD0E1" },
    divider: "rgba(38, 198, 218, 0.12)",
    ...darkTokens,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "::selection": { backgroundColor: "rgba(38, 198, 218, 0.3)" },
        body: { caretColor: "#26C6DA" },
        ":focus-visible": { outline: "2px solid #26C6DA", outlineOffset: 2 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(38, 198, 218, 0.15)",
          transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out",
          [INTERACTIVE_CARD_HOVER]: {
            borderColor: "rgba(38, 198, 218, 0.35)",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.35)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
        },
        containedPrimary: {
          "&:hover": {
            boxShadow: "0 0 16px rgba(38, 198, 218, 0.35)",
          },
        },
        containedSecondary: {
          "&:hover": {
            boxShadow: "0 0 16px rgba(251, 191, 36, 0.35)",
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(10, 26, 42, 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(38, 198, 218, 0.12)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: "none",
          backgroundColor: "#0E1E30",
          borderRight: "1px solid rgba(38, 198, 218, 0.12)",
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
    // MUI 深色預設的提示條底色是 darken(main, 0.6)，info 青色會變成接近純黑、看不出是資訊。
    // 改成該語意色的低透明度淡底，文字維持主文字色，圖示保留語意色。
    MuiAlert: {
      styleOverrides: {
        standard: ({ theme, ownerState }) => {
          const tone = theme.palette[ownerState.color ?? ownerState.severity ?? "success"];
          return {
            backgroundColor: alpha(tone.main, 0.14),
            color: theme.palette.text.primary,
          };
        },
      },
    },
  },
});
