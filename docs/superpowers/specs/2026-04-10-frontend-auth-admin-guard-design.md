# Frontend Auth & Admin Guard Design

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Fix infinite reload loop on unauthorized admin page access; add proper auth/permission handling

---

## Problem

1. **NavDrawer** shows the admin section to all logged-in users (not just admins)
2. **Admin routes** have no frontend guard — any user can navigate directly via URL
3. **Axios 401 interceptor** does `window.location.reload()`, causing an infinite reload loop when a non-admin user lands on an admin page:
   - Non-admin visits `/admin/*` → API returns 401 → interceptor clears token + reloads → LIFF re-authenticates (user is valid, just not admin) → page reloads at same URL → API returns 401 again → infinite loop
4. **Backend** returns 401 for both "invalid token" and "insufficient privileges", making it impossible for the frontend to distinguish between the two cases

## Solution Overview

Six changes across backend and frontend to implement proper HTTP semantics and route-level protection.

---

## 1. Backend: Distinguish 401 vs 403

**File:** `app/src/middleware/validation.js`

### Current behavior

- `verifyToken`, `verifyAdmin`, and `verifyPrivilege` all return **401** on failure

### New behavior

| Middleware | Failure meaning | Status code |
|-----------|----------------|-------------|
| `verifyToken` | Token missing or invalid (not authenticated) | **401** (unchanged) |
| `verifyAdmin` | Valid token but user is not in Admin table | **403** |
| `verifyPrivilege` | Valid token + admin, but privilege level too low | **403** |

### Changes

- Add `Forbidden(res)` helper: returns `res.status(403).json({ message: "forbidden" })`
- `verifyAdmin`: change `Unauthorized(res)` → `Forbidden(res)`
- `verifyPrivilege`: change `Unauthorized(res)` → `Forbidden(res)`
- `verifyToken`: unchanged (remains 401)

### Socket.IO

- `socketVerifyAdmin`: change error message from generic to "forbidden" for consistency, but keep using `next(new Error(...))` pattern — socket auth failures are handled separately by the socket client

---

## 2. Frontend: Auth Context — Add Admin Info

**File:** `frontend/src/context/LiffProvider.jsx`

### Current state

- Context provides: `{ ready, loggedIn, liffContext, login, logout }`
- No knowledge of whether the user is an admin

### New behavior

- After setting the auth token (both fast-path and LIFF-path), call `GET /api/me`
- Extract admin status from the response (presence of `privilege` field)
- Context provides: `{ ready, loggedIn, isAdmin, profile, login, logout }`

### Details

- `isAdmin`: `true` if `/api/me` returns a `privilege` field, `false` otherwise
- `profile`: the full `/api/me` response (`userId`, `displayName`, `pictureUrl`, and optionally `privilege`)
- If `/api/me` fails (network error, 401), treat as not logged in — clear token, set `loggedIn = false`
- The `/api/me` call must complete before `ready` becomes `true`, so downstream components always have auth state available

---

## 3. Frontend: API Interceptor — Separate 401/403 Handling

**File:** `frontend/src/services/api.js`

### Current behavior

```js
if (err.response?.status === 401) {
  window.localStorage.removeItem(TOKEN_KEY);
  clearAuthToken();
  window.location.reload(); // causes infinite loop
}
```

### New behavior

- **401 (Unauthorized):** Token is invalid/expired. Clear token from localStorage, clear auth header, redirect to `"/"` (not reload).
- **403 (Forbidden):** User is authenticated but lacks permission. Do NOT clear token. Dispatch a `CustomEvent("auth:forbidden")` so the UI layer can show a notification. Redirect to `"/"`.

### Implementation

```js
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

### Why CustomEvent

- The interceptor is outside React's component tree (plain axios module)
- `CustomEvent` lets any React component subscribe via `useEffect` + `addEventListener`
- MainLayout listens for `auth:forbidden` and shows a Snackbar notification

---

## 4. Frontend: RequireAdmin Route Guard

**New file:** `frontend/src/components/RequireAdmin.jsx`

### Behavior

- Reads `loggedIn` and `isAdmin` from LiffContext
- If not logged in → `<Navigate to="/" replace />`
- If logged in but not admin → `<Navigate to="/" replace />`
- If logged in and admin → `<Outlet />` (render child routes)

### Implementation

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

Uses `<Outlet />` so it works as a layout route wrapper in react-router-dom v6.

---

## 5. Frontend: Wrap Admin Routes

**File:** `frontend/src/App.jsx`

### Current structure

```jsx
{/* Admin */}
<Route path="admin/gacha-pool" element={<AdminGachaPool />} />
<Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
...
```

### New structure

```jsx
{/* Admin — requires admin privilege */}
<Route element={<RequireAdmin />}>
  <Route path="admin/gacha-pool" element={<AdminGachaPool />} />
  <Route path="admin/gacha-pool/new" element={<AdminGachaPoolForm />} />
  ...all admin routes...
</Route>
```

All existing admin routes move inside the `<RequireAdmin />` layout route. No path changes needed.

---

## 6. Frontend: NavDrawer — Hide Admin for Non-Admins

**File:** `frontend/src/components/NavDrawer.jsx`

### Current (line 187)

```jsx
{loggedIn && (
  <NavSection title="管理員" items={adminItems} ... />
)}
```

### New

```jsx
{isAdmin && (
  <NavSection title="管理員" items={adminItems} ... />
)}
```

Where `isAdmin` comes from `useLiff()`.

---

## 7. Frontend: MainLayout — 403 Snackbar

**File:** `frontend/src/layouts/MainLayout.jsx`

- Add a `useEffect` listener for the `auth:forbidden` CustomEvent
- On event, show a Snackbar: "您沒有權限存取此頁面"
- Use existing Snackbar/HintSnackBar pattern from the project

---

## Files Changed

| File | Change type | Description |
|------|------------|-------------|
| `app/src/middleware/validation.js` | Modify | verifyAdmin/verifyPrivilege return 403 |
| `frontend/src/context/LiffProvider.jsx` | Modify | Call /api/me, expose isAdmin + profile |
| `frontend/src/services/api.js` | Modify | 401 redirect home, 403 event + redirect |
| `frontend/src/components/RequireAdmin.jsx` | **New** | Route guard component |
| `frontend/src/App.jsx` | Modify | Wrap admin routes with RequireAdmin |
| `frontend/src/components/NavDrawer.jsx` | Modify | loggedIn → isAdmin for admin section |
| `frontend/src/layouts/MainLayout.jsx` | Modify | Listen for auth:forbidden, show Snackbar |

## Out of Scope

- Granular per-privilege route guards (e.g., showing different admin pages based on privilege 1 vs 9) — can be added later if needed
- Refactoring other pages (Group, Trade, etc.) to use route guards for `loggedIn` — separate concern
- Backend returning 403 for non-admin socket.io connections — socket auth has its own error handling
