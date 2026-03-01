# Gacha Pool Admin Page Redesign

## Context

The `/admin/gacha-pool` page manages 200-300 gacha pool characters (CRUD). The current implementation uses a basic MUI DataGrid + Dialog pattern. The goal is to modernize the UI/UX while keeping the same functionality and backend API.

## Constraints

- Admins use both desktop and mobile to edit
- 200-300 character records — need efficient browsing
- Backend API unchanged
- `services/gachaPool.js` unchanged (just fixed the PUT payload bug)

## Design Decisions

- **Table-based list** over cards — better information density for 200+ records
- **Full-screen form page** over Dialog/Drawer — best mobile editing experience
- **Two-route architecture** — list page + form page via react-router
- **Client-side search/filter** — data volume is small enough to load all at once
- **Basic CRUD + beautification only** — no stats summary, no batch operations

## Architecture

### Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/admin/gacha-pool` | List page | Browse, search, filter, delete characters |
| `/admin/gacha-pool/new` | Form page | Create new character |
| `/admin/gacha-pool/:id/edit` | Form page | Edit existing character |

### File Structure

```
frontend/src/pages/Admin/
  GachaPool/
    index.jsx            ← List page (replaces old GachaPool.jsx)
    GachaPoolForm.jsx    ← Shared create/edit form page
```

Old file `frontend/src/pages/Admin/GachaPool.jsx` will be deleted.

### List Page

- Header: title + "add character" button
- Search bar: filters by character name (client-side)
- Star filter chips: All / SSR / SR / R
- DataGrid columns: Avatar, Name, Star (colored Chip), Rate (%), Princess flag, Actions (edit/delete IconButton)
- Mobile: hide secondary columns (princess, tag), pin avatar+name
- Delete: confirmation AlertDialog then API call + refresh
- Pagination: default 10 rows per page

### Form Page (Create / Edit)

- Top: back arrow navigates to list page
- Image preview: loads from URL in real-time, placeholder on error
- Fields: name, imageUrl, star (select), rate (number), isPrincess (select), tag (text)
- Desktop: star+rate and princess+tag side-by-side (2 columns)
- Mobile: all fields stacked full-width (1 column)
- Save button: sticky at bottom for mobile accessibility
- Edit mode: loads existing data from route param id
- Create mode: blank form, star defaults to SSR

### Data Flow

1. List page mounts → `fetchData()` loads all characters
2. Search/filter are pure frontend operations
3. Click edit → navigate to `/admin/gacha-pool/:id/edit` → fetch or pass character data
4. Save → API call → navigate back to list + success Snackbar
5. Delete → confirm dialog → API call → refresh list

### Field Mapping (frontend ↔ backend)

| Frontend | Backend | Type |
|----------|---------|------|
| name | name | string |
| imageUrl | headImage_url | string |
| star | star | int (1/2/3) |
| rate | rate | float |
| isPrincess | is_princess | int (0/1) |
| tag | tag | string |

### Existing Dependencies Used

- `@mui/material` v7 — Box, Button, TextField, Avatar, Chip, Typography, Snackbar, etc.
- `@mui/x-data-grid` v8 — DataGrid
- `@mui/icons-material` v7 — icons
- `react-router-dom` v7 — routing, useParams, useNavigate
- Custom hooks: `useHintBar`, `useAlertDialog`
- Custom components: `FullPageLoading`, `HintSnackBar`, `AlertDialog`
