---
name: mui-main-layout-mobile-overflow
description: MUI Box with padding as main layout causes mobile horizontal overflow without maxWidth/overflowX constraints
triggers:
  - mobile horizontal scroll
  - viewport overflow
  - page wider than screen
  - pinch to zoom
  - main layout padding overflow
  - scrollWidth greater than clientWidth
---

# MUI MainLayout Padding Causes Mobile Viewport Overflow

## The Insight
When a MUI `<Box component="main">` uses `p: { xs: 2 }` (16px padding) without width constraints, the padding is added OUTSIDE the viewport width on mobile. The element's `offsetWidth` becomes `viewportWidth + paddingLeft + paddingRight`, causing the entire page to be horizontally scrollable. This is invisible on desktop but immediately noticeable on mobile — users must pinch-zoom inward to fit the page.

The root cause: `<Box>` defaults to `display: block` with `width: auto`, which means it takes the full width of its parent. But padding is added ON TOP of that width (since default `box-sizing` in MUI's CssBaseline is `border-box` on `*` but the computed layout still overflows when the parent chain doesn't constrain).

## Why This Matters
Every page rendered inside `<Outlet />` inherits this overflow. The symptom is subtle — no errors, no broken layout on desktop. On mobile, the page loads slightly zoomed out and users must pinch to fit. This affects ALL pages, not just the one you're working on. If a child page also adds its own Container/padding, the overflow compounds.

## Recognition Pattern
- User reports needing to pinch-zoom inward on mobile to fit the page
- `document.documentElement.scrollWidth > document.documentElement.clientWidth`
- `<main>` element's `offsetWidth` exceeds viewport width
- The overflow is at the `<main>` level, not in any child component
- Happens on ALL pages, not just one specific page

## The Approach
1. **Diagnose**: In browser console, check `document.documentElement.scrollWidth` vs `clientWidth`. If scrollWidth is larger, walk the DOM tree to find which element first exceeds viewport width.

2. **Fix at the layout level**, not per-page:
   ```jsx
   <Box
     component="main"
     sx={{
       flexGrow: 1,
       p: { xs: 2, md: 3 },
       maxWidth: "100vw",      // ← prevents expanding beyond viewport
       overflowX: "hidden",    // ← clips any child overflow
     }}
   >
     <Outlet />
   </Box>
   ```

3. **Caveat**: `overflowX: "hidden"` on `<main>` means child pages that intentionally need horizontal scroll (e.g., horizontal carousels) must add `overflow-x: auto` on their own inner container.

4. **Avoid double padding**: If the layout's `<main>` already has padding, child pages should use plain `<Box>` instead of `<Container>`, which adds its own padding. Double padding wastes mobile screen real estate (e.g., 16px + 24px = 40px per side on a 375px screen leaves only 295px for content).

## Key Files
- `frontend/src/layouts/MainLayout.jsx` — The `<Box component="main">` at line ~132
- Any page using `<Container>` inside MainLayout gets double padding

## Debugging Technique
```js
// Run in browser console at mobile viewport to find overflow source
(() => {
  const vw = document.documentElement.clientWidth;
  const root = document.getElementById('root');
  let el = root;
  while (el.firstElementChild) {
    const child = el.firstElementChild;
    if (child.scrollWidth > vw || child.offsetWidth > vw) {
      console.log(child.tagName, child.className, {
        scrollWidth: child.scrollWidth,
        offsetWidth: child.offsetWidth,
        padding: getComputedStyle(child).padding,
      });
    }
    el = child;
  }
})();
```
