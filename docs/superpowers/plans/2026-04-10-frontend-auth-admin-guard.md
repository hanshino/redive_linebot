# Frontend Auth & Admin Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix infinite reload loop on unauthorized admin page access by adding proper 401/403 HTTP semantics, auth context with admin info, route guards, and nav visibility control.

**Architecture:** Backend middleware returns 403 for authorization failures (was 401). Frontend LiffProvider calls `/api/me` on login to populate `isAdmin`. A `RequireAdmin` layout route guard protects admin routes. The axios interceptor handles 401 (clear token, redirect home) and 403 (fire event, redirect home) separately.

**Tech Stack:** Express middleware (backend), React 17+, react-router-dom v6, MUI Snackbar, axios interceptors, CustomEvent API.

**Spec:** `docs/superpowers/specs/2026-04-10-frontend-auth-admin-guard-design.md`

---

### Task 1: Backend — Return 403 for authorization failures

**Files:**
- Modify: `app/src/middleware/validation.js:70-96` (verifyAdmin, verifyPrivilege)
- Modify: `app/src/middleware/validation.js:141-143` (add Forbidden helper)

- [ ] **Step 1: Add `Forbidden` helper function**

At the bottom of `app/src/middleware/validation.js`, add the `Forbidden` helper next to the existing `Unauthorized`:

```js
function Forbidden(res) {
  res.status(403).json({ message: "forbidden" });
}
```

- [ ] **Step 2: Change `verifyAdmin` to return 403**

In `app/src/middleware/validation.js`, change line 75:

```js
// Before:
if (adminData === undefined) return Unauthorized(res);

// After:
if (adminData === undefined) return Forbidden(res);
```

- [ ] **Step 3: Change `verifyPrivilege` to return 403**

In `app/src/middleware/validation.js`, change line 91:

```js
// Before:
if (privilege < allow) {
  return Unauthorized(res);
}

// After:
if (privilege < allow) {
  return Forbidden(res);
}
```

- [ ] **Step 4: Verify `verifyToken` is unchanged**

Confirm `verifyToken` (lines 44-68) still calls `Unauthorized(res)` — this is correct because invalid/missing tokens are 401.

- [ ] **Step 5: Commit**

```bash
git add app/src/middleware/validation.js
git commit -m "fix(auth): return 403 for authorization failures instead of 401

verifyAdmin and verifyPrivilege now return 403 Forbidden when the user
is authenticated but lacks admin privileges. verifyToken remains 401
for invalid/missing tokens. This lets the frontend distinguish between
'not logged in' and 'not authorized'."
```

---

### Task 2: Frontend — Refactor API interceptor for 401/403

**Files:**
- Modify: `frontend/src/services/api.js:17-28`

- [ ] **Step 1: Replace the interceptor**

Replace the entire interceptor block in `frontend/src/services/api.js` (lines 17-28):

```js
// Before:
// Clear expired token and reload on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      clearAuthToken();
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

// After:
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;
    if (status === 401) {
      window.localStorage.removeItem(TOKEN_KEY);
      clearAuthToken();
      window.location.href = "/";
    } else if (status === 403) {
      window.dispatchEvent(new CustomEvent("auth:forbidden"));
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);
```

Key changes:
- 401: `window.location.reload()` → `window.location.href = "/"` (breaks the infinite loop)
- 403: new handler — dispatches `auth:forbidden` event, redirects home, does NOT clear token

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "fix(api): handle 401 and 403 separately in axios interceptor

401 clears token and redirects to home (not reload, which caused
infinite loops). 403 dispatches auth:forbidden event for UI notification
and redirects to home without clearing the token."
```

---

### Task 3: Frontend — Add admin info to LiffProvider context

**Files:**
- Modify: `frontend/src/context/LiffProvider.jsx`

- [ ] **Step 1: Add `isAdmin` and `profile` state**

In `LiffProvider.jsx`, add new state variables after the existing ones (after line 34):

```js
const [profile, setProfile] = useState(null);
const [isAdmin, setIsAdmin] = useState(false);
```

- [ ] **Step 2: Create `fetchProfile` helper**

Add a helper function inside `LiffProvider` (before the `useEffect`), that calls `/api/me` and populates admin state:

```js
const fetchProfile = useCallback(async () => {
  try {
    const { data } = await api.get("/api/me");
    setProfile(data);
    setIsAdmin(data.privilege !== undefined);
  } catch {
    // Token invalid or network error — treat as not logged in
    window.localStorage.removeItem(TOKEN_KEY);
    clearAuthToken();
    setLoggedIn(false);
    setProfile(null);
    setIsAdmin(false);
  }
}, []);
```

Add `useCallback` to the import from "react" if not already present.

- [ ] **Step 3: Call `fetchProfile` in the fast-path (stored token)**

Replace the fast-path block (lines 42-47) to call `fetchProfile` before setting `ready`:

```js
// Before:
if (!isLiffRoute && storedToken) {
  setAuthToken(storedToken);
  setLoggedIn(true);
  setReady(true);
  return;
}

// After:
if (!isLiffRoute && storedToken) {
  setAuthToken(storedToken);
  setLoggedIn(true);
  fetchProfile().finally(() => setReady(true));
  return;
}
```

This ensures `isAdmin` and `profile` are populated before `ready` becomes `true`.

- [ ] **Step 4: Call `fetchProfile` in the LIFF-path**

In the LIFF route block (lines 50-67), add `fetchProfile()` after setting the token. Replace the `.then` chain:

```js
// Before:
if (isLiffRoute) {
  initPromiseRef.current = initLiffSdk()
    .then(() => {
      if (liff.isLoggedIn()) {
        const token = liff.getAccessToken();
        window.localStorage.setItem(TOKEN_KEY, token);
        setAuthToken(token);
        setLoggedIn(true);
        try {
          setLiffCtx(liff.getContext() || {});
        } catch (err) {
          console.warn("Failed to get LIFF context:", err);
        }
      }
    })
    .catch(err => console.warn("LIFF init failed:", err))
    .finally(() => setReady(true));
  return;
}

// After:
if (isLiffRoute) {
  initPromiseRef.current = initLiffSdk()
    .then(async () => {
      if (liff.isLoggedIn()) {
        const token = liff.getAccessToken();
        window.localStorage.setItem(TOKEN_KEY, token);
        setAuthToken(token);
        setLoggedIn(true);
        try {
          setLiffCtx(liff.getContext() || {});
        } catch (err) {
          console.warn("Failed to get LIFF context:", err);
        }
        await fetchProfile();
      }
    })
    .catch(err => console.warn("LIFF init failed:", err))
    .finally(() => setReady(true));
  return;
}
```

- [ ] **Step 5: Update `logout` to clear new state**

In the `logout` callback (lines 90-99), add cleanup for the new state:

```js
const logout = useCallback(() => {
  window.localStorage.removeItem(TOKEN_KEY);
  clearAuthToken();
  setProfile(null);
  setIsAdmin(false);
  try {
    liff.logout();
  } catch {
    // SDK not initialized, nothing to clean up
  }
  window.location.reload();
}, []);
```

- [ ] **Step 6: Update context value**

Update the `useMemo` value (lines 101-104) to include the new fields:

```js
// Before:
const value = useMemo(
  () => ({ ready, loggedIn, liffContext: liffCtx, login, logout }),
  [ready, loggedIn, liffCtx, login, logout]
);

// After:
const value = useMemo(
  () => ({ ready, loggedIn, isAdmin, profile, liffContext: liffCtx, login, logout }),
  [ready, loggedIn, isAdmin, profile, liffCtx, login, logout]
);
```

- [ ] **Step 7: Update `LiffContext` default value**

Update the `createContext` default (lines 10-16) to include the new fields:

```js
export const LiffContext = createContext({
  ready: false,
  loggedIn: false,
  isAdmin: false,
  profile: null,
  liffContext: {},
  login: () => {},
  logout: () => {},
});
```

- [ ] **Step 8: Commit**

```bash
git add frontend/src/context/LiffProvider.jsx
git commit -m "feat(auth): add isAdmin and profile to LiffProvider context

Call GET /api/me after login to fetch admin status. Context now provides
isAdmin (boolean) and profile (user data). If /api/me fails, user is
treated as not logged in. The /api/me call completes before ready=true
so downstream components always have auth state."
```

---

### Task 4: Frontend — Create RequireAdmin route guard

**Files:**
- Create: `frontend/src/components/RequireAdmin.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/RequireAdmin.jsx`:

```jsx
import { Navigate, Outlet } from "react-router-dom";
import useLiff from "../context/useLiff";

export default function RequireAdmin() {
  const { loggedIn, isAdmin } = useLiff();

  if (!loggedIn || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/RequireAdmin.jsx
git commit -m "feat(auth): add RequireAdmin route guard component

Layout route that checks loggedIn and isAdmin from LiffContext.
Redirects to home if either check fails. Uses Outlet for child routes."
```

---

### Task 5: Frontend — Wrap admin routes with RequireAdmin

**Files:**
- Modify: `frontend/src/App.jsx:1-109`

- [ ] **Step 1: Add import**

Add the import at the top of `frontend/src/App.jsx`, after the other component imports (after line 38):

```js
import RequireAdmin from "./components/RequireAdmin";
```

- [ ] **Step 2: Wrap admin routes**

Replace the admin routes block (lines 84-101) with a nested layout route:

```jsx
// Before:
          {/* Admin */}
          <Route path="admin/gacha-pool" element={<AdminGachaPool />} />
          <Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
          <Route path="admin/gacha-pool/:id/edit" element={<AdminGachaPoolForm />} />
          <Route path="admin/gacha-banner" element={<AdminGachaBanner />} />
          <Route path="admin/gacha-banner/new" element={<AdminGachaBannerForm />} />
          <Route path="admin/gacha-banner/:id/edit" element={<AdminGachaBannerForm />} />
          <Route path="admin/gacha-shop" element={<AdminGachaShop />} />
          <Route path="admin/global-order" element={<AdminGlobalOrder />} />
          <Route path="admin/messages" element={<AdminMessages />} />
          <Route path="admin/worldboss" element={<AdminWorldboss />} />
          <Route path="admin/worldboss-event" element={<AdminWorldbossEvent />} />
          <Route path="admin/worldboss-message" element={<AdminWorldbossMessage />} />
          <Route path="admin/worldboss-message/create" element={<AdminWorldbossMessageCreate />} />
          <Route
            path="admin/worldboss-message/update/:id"
            element={<AdminWorldbossMessageUpdate />}
          />

// After:
          {/* Admin — requires admin privilege */}
          <Route element={<RequireAdmin />}>
            <Route path="admin/gacha-pool" element={<AdminGachaPool />} />
            <Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
            <Route path="admin/gacha-pool/:id/edit" element={<AdminGachaPoolForm />} />
            <Route path="admin/gacha-banner" element={<AdminGachaBanner />} />
            <Route path="admin/gacha-banner/new" element={<AdminGachaBannerForm />} />
            <Route path="admin/gacha-banner/:id/edit" element={<AdminGachaBannerForm />} />
            <Route path="admin/gacha-shop" element={<AdminGachaShop />} />
            <Route path="admin/global-order" element={<AdminGlobalOrder />} />
            <Route path="admin/messages" element={<AdminMessages />} />
            <Route path="admin/worldboss" element={<AdminWorldboss />} />
            <Route path="admin/worldboss-event" element={<AdminWorldbossEvent />} />
            <Route path="admin/worldboss-message" element={<AdminWorldbossMessage />} />
            <Route path="admin/worldboss-message/create" element={<AdminWorldbossMessageCreate />} />
            <Route
              path="admin/worldboss-message/update/:id"
              element={<AdminWorldbossMessageUpdate />}
            />
          </Route>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(auth): protect admin routes with RequireAdmin guard

All /admin/* routes now wrapped in RequireAdmin layout route. Non-admin
users are redirected to home before any admin page component mounts."
```

---

### Task 6: Frontend — Hide admin nav for non-admins

**Files:**
- Modify: `frontend/src/components/NavDrawer.jsx:122-123,187`

- [ ] **Step 1: Destructure `isAdmin` from context**

In `frontend/src/components/NavDrawer.jsx`, update the `useLiff()` call (line 123):

```js
// Before:
const { loggedIn } = useLiff();

// After:
const { isAdmin } = useLiff();
```

- [ ] **Step 2: Change admin section visibility condition**

Update line 187:

```jsx
// Before:
      {loggedIn && (
        <NavSection

// After:
      {isAdmin && (
        <NavSection
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/NavDrawer.jsx
git commit -m "fix(nav): hide admin section for non-admin users

Admin nav group now checks isAdmin (from /api/me) instead of loggedIn.
Non-admin users no longer see the admin menu items."
```

---

### Task 7: Frontend — Add 403 Snackbar notification in MainLayout

**Files:**
- Modify: `frontend/src/layouts/MainLayout.jsx`

- [ ] **Step 1: Add imports**

Update the imports at the top of `frontend/src/layouts/MainLayout.jsx`:

```js
// Add useEffect to the react import (line 1):
import { useState, useEffect } from "react";

// Add Snackbar and Alert to the MUI import (lines 2-13):
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Divider,
  Drawer,
  Tooltip,
  Snackbar,
  Alert,
  useMediaQuery,
  useTheme,
} from "@mui/material";
```

- [ ] **Step 2: Add forbidden state and event listener**

Inside the `MainLayout` component, after the existing state declarations (after line 31), add:

```js
const [forbiddenOpen, setForbiddenOpen] = useState(false);

useEffect(() => {
  const handleForbidden = () => setForbiddenOpen(true);
  window.addEventListener("auth:forbidden", handleForbidden);
  return () => window.removeEventListener("auth:forbidden", handleForbidden);
}, []);
```

- [ ] **Step 3: Add Snackbar JSX**

Add the Snackbar at the end of the root `<Box>`, just before the closing `</Box>` (before line 128):

```jsx
      <Snackbar
        open={forbiddenOpen}
        autoHideDuration={3000}
        onClose={() => setForbiddenOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setForbiddenOpen(false)}
          severity="warning"
          variant="filled"
          sx={{ width: "100%" }}
        >
          您沒有權限存取此頁面
        </Alert>
      </Snackbar>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/layouts/MainLayout.jsx
git commit -m "feat(auth): show snackbar notification on 403 forbidden

MainLayout listens for auth:forbidden CustomEvent dispatched by the
axios interceptor. Shows a warning snackbar with '您沒有權限存取此頁面'."
```

---

### Task 8: Verify — Build and manual smoke test

- [ ] **Step 1: Run frontend build**

```bash
cd frontend && yarn build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Run backend lint**

```bash
cd app && yarn lint
```

Expected: No new lint errors.

- [ ] **Step 3: Manual verification checklist**

Verify these scenarios work correctly:

1. **Non-admin logged in:** Nav does NOT show admin section
2. **Non-admin direct URL:** Navigating to `/admin/gacha-pool` redirects to `/` immediately (no API call, no reload loop)
3. **Admin logged in:** Nav shows admin section, admin pages load normally
4. **Token expired:** Any API call returns 401 → token cleared, redirected to `/`, no loop
5. **Backend 403:** If an admin with insufficient privilege tries a high-privilege action, they see the warning snackbar and get redirected

- [ ] **Step 4: Final commit (if any lint/build fixes needed)**

```bash
git add -A
git commit -m "fix: address lint/build issues from auth guard implementation"
```
