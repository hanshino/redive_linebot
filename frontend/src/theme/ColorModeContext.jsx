import { useMemo, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import useMediaQuery from "@mui/material/useMediaQuery";
import { lightTheme, darkTheme } from "./index";
import { ColorModeContext } from "./useColorMode";

export function ColorModeProvider({ children }) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  // ponytail: 只把「使用者明確選過的偏好」放進 state，沒選過就直接由 prefersDark 推導，
  // 免掉一個 setState-in-effect 的同步。
  const [override, setOverride] = useState(() => {
    const saved = localStorage.getItem("color-mode");
    return saved === "light" || saved === "dark" ? saved : null;
  });

  const mode = override ?? (prefersDark ? "dark" : "light");

  const toggleColorMode = () => {
    const next = mode === "dark" ? "light" : "dark";
    localStorage.setItem("color-mode", next);
    setOverride(next);
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
