import { createTheme } from "@mui/material/styles";

// Princess Connect RE:Dive inspired color palette
const palette = {
  primary: {
    main: "#6C63FF",
    light: "#8B83FF",
    dark: "#4A42D9",
    contrastText: "#FFFFFF",
  },
  secondary: {
    main: "#FFB830",
    light: "#FFCF6B",
    dark: "#D99A1A",
    contrastText: "#1A1A2E",
  },
  background: {
    default: "#0F0F1A",
    paper: "#1A1A2E",
  },
  text: {
    primary: "#E8E8F0",
    secondary: "#A0A0B8",
  },
  error: {
    main: "#FF5C6C",
    light: "#FF8A95",
    dark: "#D93D4C",
  },
  warning: {
    main: "#FFB830",
    light: "#FFCF6B",
    dark: "#D99A1A",
  },
  success: {
    main: "#4ADE80",
    light: "#86EFAC",
    dark: "#22C55E",
  },
  info: {
    main: "#60A5FA",
    light: "#93C5FD",
    dark: "#3B82F6",
  },
  divider: "rgba(108, 99, 255, 0.12)",
};

const theme = createTheme({
  palette: {
    mode: "dark",
    ...palette,
  },
  typography: {
    fontFamily: [
      "Roboto",
      '"Noto Sans TC"',
      '"Helvetica Neue"',
      "Arial",
      "sans-serif",
    ].join(","),
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
          backgroundColor: palette.background.paper,
          border: "1px solid rgba(108, 99, 255, 0.15)",
          transition: "border-color 0.25s ease, box-shadow 0.25s ease",
          "&:hover": {
            borderColor: "rgba(108, 99, 255, 0.4)",
            boxShadow: "0 0 20px rgba(108, 99, 255, 0.15)",
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          transition:
            "background-color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        },
        containedPrimary: {
          "&:hover": {
            boxShadow: "0 0 16px rgba(108, 99, 255, 0.4)",
          },
        },
        containedSecondary: {
          "&:hover": {
            boxShadow: "0 0 16px rgba(255, 184, 48, 0.4)",
          },
        },
        outlinedPrimary: {
          borderColor: "rgba(108, 99, 255, 0.5)",
          "&:hover": {
            borderColor: "#6C63FF",
            boxShadow: "0 0 12px rgba(108, 99, 255, 0.25)",
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          backgroundColor: "rgba(15, 15, 26, 0.8)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(108, 99, 255, 0.12)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#12121F",
          backgroundImage: "none",
          borderRight: "1px solid rgba(108, 99, 255, 0.12)",
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
