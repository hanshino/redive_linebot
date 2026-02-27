import { createTheme } from "@mui/material/styles";

// Miyako (宮子) inspired color palette
// Primary: Cyan/light blue — her hair color
// Secondary: Amber/caramel — pudding (布丁)
// Accent: Red — her eyes
// Decorative: Purple (scarf), Orange (skirt)

const shared = {
  typography: {
    fontFamily: [
      "Roboto",
      '"Noto Sans TC"',
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
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
    primary: {
      main: "#00ACC1",
      light: "#26C6DA",
      dark: "#00838F",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#F59E0B",
      light: "#FBBF24",
      dark: "#D97706",
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
    error: { main: "#EF4444" },
    warning: { main: "#F59E0B" },
    success: { main: "#22C55E" },
    info: { main: "#00ACC1" },
    divider: "rgba(0, 172, 193, 0.12)",
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(0, 172, 193, 0.12)",
          transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out",
          "&:hover": {
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
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(38, 198, 218, 0.15)",
          transition: "border-color 0.2s ease-out, box-shadow 0.2s ease-out",
          "&:hover": {
            borderColor: "rgba(38, 198, 218, 0.35)",
            boxShadow: "0 0 20px rgba(38, 198, 218, 0.1)",
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
  },
});
