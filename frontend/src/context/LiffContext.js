import { createContext } from "react";

export const LiffContext = createContext({
  ready: false,
  loggedIn: false,
  isAdmin: false,
  profile: null,
  liffContext: {},
  login: () => {},
  logout: () => {},
});
