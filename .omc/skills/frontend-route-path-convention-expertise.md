---
name: frontend-route-path-convention
description: Frontend routes in this repo use lowercase kebab-case + feature namespace, NOT PascalCase matching page component names. Backend LIFF URIs must match exactly.
triggers:
  - new LIFF page
  - new frontend route
  - getLiffUri
  - App.jsx Route path
  - frontend/src/pages
  - AutoSettings path
  - PascalCase route
---

# Frontend Route Path Convention

## The Insight

Page **component names** are PascalCase (e.g. `AutoSettings`), but **URL path segments** in `frontend/src/App.jsx` are lowercase — either kebab-case (`race/bet`, `gacha/exchange`, `tools/battle-time`) or colon-style params within a lowercase namespace (`group/:groupId/record`, `trade/:marketId/detail`, `admin/worldboss-message/update/:id`).

When adding a new LIFF-facing page, the path you pick appears in three coupled places:

1. `frontend/src/App.jsx` — `<Route path="..." element={<X />} />`
2. Backend controller that generates the LINE bubble URI — `commonTemplate.getLiffUri(size, "/...")` (e.g. `app/src/controller/application/AutoPreferenceController.js:203`)
3. Tests that assert the bubble URI — `expect(bubble.body.action.uri).toContain("/...")`

All three must use the **exact same string**. If you pick `"/AutoSettings"` in the controller but the route is `"auto/settings"` in App.jsx, the LIFF will 404 in production even though every unit test passes.

## Why This Matters

Mimicking the component name for the URL feels natural, but produces inconsistencies the reviewer will catch and reject:

- `race/bet`, `trade/order`, `panel/manual`, `admin/gacha-pool`, `tools/battle-time` — every existing route is lowercase
- Case-sensitive routing means `/AutoSettings` and `/autosettings` are different paths, so a convention drift causes real URL breakage, not just style drift
- `getLiffUri` does not normalize the path — whatever string you pass is what LINE clients will open

Drift here is also expensive to repair: it's three files plus the deployed LIFF endpoint configuration, and any scheduled LINE Flex messages already delivered will keep pointing at the wrong URL.

## Recognition Pattern

You're touching this when:

- Adding a new `Route` to `frontend/src/App.jsx`
- Adding or modifying any `getLiffUri(size, "/...")` call in an `app/src/controller/` file
- The component file sits under `frontend/src/pages/<PascalCaseName>/index.jsx`
- A LINE bot command handler returns a Flex bubble whose button opens a LIFF page

## The Approach

Before writing the route string, grep the existing routes:

```bash
grep -n "<Route path=" frontend/src/App.jsx
```

Then choose by counting segments in the feature:

- **Single page for a feature** → kebab-case (`auto-settings` if you had only one page)
- **Feature group with 2+ pages** → lowercase namespace + child (`auto/settings`, `auto/history`) matching the `trade/*`, `group/*`, `panel/*`, `admin/*` pattern
- Never echo the PascalCase component name into the path, even when the component is the only consumer

Then wire all three coupled sites in the same commit:

1. `<Route path="auto/settings" element={<AutoSettings />} />`
2. `commonTemplate.getLiffUri("tall", "/auto/settings")`
3. Test assertion `toContain("/auto/settings")`

Run the controller test after editing to catch mismatches before push.

## Example

Wrong (what you'd write if you mirror the component name):

```jsx
// frontend/src/App.jsx
<Route path="AutoSettings" element={<AutoSettings />} />
```

```js
// app/src/controller/application/AutoPreferenceController.js
const uri = commonTemplate.getLiffUri("tall", "/AutoSettings");
```

Right (matches `trade/order`, `panel/manual`, `admin/gacha-pool`):

```jsx
<Route path="auto/settings" element={<AutoSettings />} />
<Route path="auto/history" element={<AutoHistory />} />
```

```js
const uri = commonTemplate.getLiffUri("tall", "/auto/settings");
```
