# LIFF OAuth Redirect Strips Custom Query Parameters

## The Insight
LINE's LIFF SDK OAuth redirect flow only preserves its own internal parameters (`code`, `state`, `liffClientId`, `liffRedirectUri`). Any custom query parameters (like `reactRedirectUri`) appended to the LIFF URL are silently dropped during the OAuth round-trip. The LIFF SDK uses `liff.state` to preserve **path segments** after the LIFF ID, but NOT arbitrary query params at the LIFF URL level.

## Why This Matters
If you pass custom data via query params on `https://liff.line.me/{id}?myParam=value`, after OAuth the user lands at the endpoint URL without `myParam`. This causes deep links from LINE Flex Messages to silently fail — users always end up at the home page instead of the intended target. The failure is invisible: no errors, no warnings, just wrong navigation.

## Recognition Pattern
- LIFF deep links from Flex Messages always land on the home page instead of the target
- Users report "it works if I close and reopen" (because second open skips OAuth, or they just accept the home page)
- HAR capture shows the OAuth callback URL has no custom query params
- `liff.init()` warns about URL not matching endpoint URL

## The Approach
1. **Never use query params on LIFF URLs for routing data.** Use path segments instead:
   - BAD: `https://liff.line.me/{id}?reactRedirectUri=/rankings`
   - GOOD: `https://liff.line.me/{id}/rankings`

2. **LIFF preserves path segments via `liff.state`** through the OAuth flow. After `liff.init()` processes the callback, the path is restored via `history.replaceState`.

3. **`liff.init()` should only be called on the LIFF endpoint URL** (`/liff/:size`). Calling it on other paths triggers a warning and may fail to process OAuth codes. Use localStorage to persist auth tokens for non-LIFF routes.

4. **`liff.login({ redirectUri })` controls where OAuth returns.** Use this to encode the user's current page path into the LIFF route so they return to the right place after login:
   ```js
   liff.login({ redirectUri: `${origin}/liff/${size}${pathname}` });
   ```

5. **Filter LIFF OAuth params** (`code`, `state`, `liffClientId`, `liffRedirectUri`, `liff.state`) when extracting the redirect target from the URL, so they don't leak into the app's visible URL.

## Key Files
- `frontend/src/context/LiffProvider.jsx` — LIFF SDK init and auth state management
- `frontend/src/layouts/LiffLayout.jsx` — LIFF entry route, extracts redirect path
- `app/src/templates/common/index.js` — `getLiffUri()` builds LIFF URLs for Flex Messages
- LIFF endpoint URL is registered in LINE Developer Console as `/liff/full`

## Debugging Technique
Export browser HAR from DevTools Network tab. Parse with Python to trace the full OAuth redirect chain. Look for the callback URL (the request back to your domain) and check which params survived.
