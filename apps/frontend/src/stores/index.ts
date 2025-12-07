import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * App Store - Global application state
 * Contains shared state that persists across sessions
 */
interface AppState {
  // Theme preference
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Sidebar state (for future dashboard)
  sidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        theme: "system",
        setTheme: (theme) => set({ theme }),
        sidebarOpen: true,
        toggleSidebar: () =>
          set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      }),
      {
        name: "app-store",
      }
    )
  )
);

/**
 * User Store - User authentication and profile state
 */
interface UserState {
  isAuthenticated: boolean;
  user: {
    id: string;
    name: string;
  } | null;
  setUser: (user: UserState["user"]) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>()(
  devtools((set) => ({
    isAuthenticated: false,
    user: null,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    logout: () => set({ user: null, isAuthenticated: false }),
  }))
);
