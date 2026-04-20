import { createContext, useContext } from "react";

export const ColorModeContext = createContext({
  mode: "light",
  toggleColorMode: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}
