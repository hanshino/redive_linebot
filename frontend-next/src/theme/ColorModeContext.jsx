import { createContext, useContext, useMemo, useState, useEffect } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import useMediaQuery from "@mui/material/useMediaQuery";
import { lightTheme, darkTheme } from "./index";

const ColorModeContext = createContext({
  mode: "light",
  toggleColorMode: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

export function ColorModeProvider({ children }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem("color-mode");
    if (saved === "light" || saved === "dark") return saved;
    return prefersDark ? "dark" : "light";
  });

  useEffect(() => {
    const saved = localStorage.getItem("color-mode");
    if (!saved) {
      setMode(prefersDark ? "dark" : "light");
    }
  }, [prefersDark]);

  const toggleColorMode = () => {
    setMode((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("color-mode", next);
      return next;
    });
  };

  const theme = useMemo(() => (mode === "dark" ? darkTheme : lightTheme), [mode]);

  const value = useMemo(() => ({ mode, toggleColorMode }), [mode]);

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}
