# Frontend Rewrite Design

Date: 2026-02-27

## Overview

Full rewrite of the frontend admin dashboard for the Princess Connect RE:Dive LINE bot. The current frontend uses React 17, MUI v4/v5 混用, CRA, and makeStyles — all of which are outdated. This rewrite modernizes the entire stack and introduces a game-themed visual design.

## Goals

1. Modernize tech stack to current standards
2. Create a game-themed visual design inspired by Princess Connect RE:Dive
3. Improve overall UX: layout, color, content presentation
4. Maintain all existing functionality (no feature removal)
5. Enable side-by-side development with the existing frontend

## Tech Stack

| Item | Current | New |
|------|---------|-----|
| Build tool | Create React App | **Vite** |
| React | 17 | **19** |
| UI Framework | MUI v4 + v5 mixed | **MUI v7** |
| Styling | makeStyles (JSS) | **sx prop + styled API (Emotion)** |
| Routing | react-router-dom v5 | **React Router v7** |
| Charts | DevExpress | **Recharts** |
| Data Grid | @material-table + MUI X DataGrid v5 | **MUI X DataGrid v7** |
| HTTP | axios | **axios** (unchanged) |
| Real-time | Socket.IO | **Socket.IO** (unchanged) |
| LINE Integration | LIFF SDK | **LIFF SDK** (unchanged) |

## Visual Design: Game Theme

### Color Palette

- **Primary**: Blue-purple gradient (inspired by the game's UI tones)
- **Accent**: Gold/amber (game highlight color for important elements)
- **Background**: Dark blue-gray base + slightly lighter card panels (semi-dark theme)
- **Text**: Light primary text, gold/bright accent for emphasis
- **Status colors**: Green (success), Red (error), Amber (warning)

### Homepage Layout

```
┌─────────────────────────────────────┐
│  NavBar (transparent/semi-transparent│
│  with game-style logo)              │
├─────────────────────────────────────┤
│  Hero Banner                        │
│  ┌───────────────────────────────┐  │
│  │  Welcome message + Bot status │  │
│  │  Quick stats (users/groups/.) │  │
│  └───────────────────────────────┘  │
├──────────┬──────────┬───────────────┤
│ Stat Card│ Stat Card│  Stat Card    │
│ (w/icon) │ (w/icon) │  (w/icon)     │
├──────────┴──────────┴───────────────┤
│  Announcements (game bulletin style)│
├─────────────────────────────────────┤
│  Feature shortcuts (icon grid,      │
│  game-style buttons)                │
├─────────────────────────────────────┤
│  Activity / Charts area             │
└─────────────────────────────────────┘
```

### Component Style

- Cards with subtle glow/border effects
- Buttons with game-style rounded corners and gradients
- Animated number counters for statistics
- Game-related iconography where appropriate
- Smooth transitions and micro-interactions

## Project Structure

New project lives in `frontend-next/` alongside existing `frontend/`. After full verification, `frontend/` is deleted and `frontend-next/` is renamed to `frontend/`.

```
frontend-next/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.jsx                  # Entry point
│   ├── App.jsx                   # Route definitions
│   ├── theme/
│   │   └── index.js              # MUI v7 game theme
│   ├── layouts/
│   │   ├── MainLayout.jsx        # NavBar + Content container
│   │   └── LiffLayout.jsx        # LINE LIFF layout
│   ├── pages/
│   │   ├── Home/                 # Homepage
│   │   ├── Rankings/             # Ranking charts
│   │   ├── Gacha/                # Gacha simulation
│   │   ├── ScratchCard/          # Scratch cards
│   │   ├── Bag/                  # Inventory
│   │   ├── Equipment/            # Equipment management
│   │   ├── Trade/                # Trading system
│   │   ├── Bot/                  # Bot feature settings
│   │   ├── Group/                # Guild/Group management
│   │   ├── Panel/                # Control panels
│   │   ├── Admin/                # Admin panel
│   │   └── Tools/                # Utility tools
│   ├── components/               # Shared components
│   │   ├── StatsCard.jsx
│   │   ├── GameButton.jsx
│   │   ├── AnnouncementBoard.jsx
│   │   └── ...
│   ├── hooks/                    # Custom hooks
│   ├── services/                 # API calls (axios)
│   ├── contexts/                 # React Context providers
│   └── utils/                    # Utility functions
```

## Pages / Routes (all preserved)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Dashboard with stats, announcements, feature shortcuts |
| `/Rankings` | Rankings | Ranking charts and leaderboards |
| `/ScratchCard/*` | ScratchCard | Scratch card feature |
| `/Gacha/*` | Gacha | Gacha simulation |
| `/Bag` | Bag | User inventory |
| `/Equipment` | Equipment | Equipment management |
| `/Trade/*` | Trade | Trading system |
| `/Bot/*` | Bot | Bot feature configuration |
| `/Group/*` | Group | Guild/group management |
| `/Panel/*` | Panel | Control panels |
| `/Admin/*` | Admin | Admin panel |
| `/Tools/*` | Tools | Utility tools |
| `/liff/*` | LIFF pages | LINE LIFF integration |

## Phase Plan

### Phase 1: Project Scaffold

- Initialize Vite + React 19 project in `frontend-next/`
- Install MUI v7, React Router v7, Recharts, axios, Socket.IO client
- Create game theme (colors, typography, component overrides)
- Set up route skeleton with placeholder pages
- Configure dev proxy to backend API (port 5000)
- **Deliverable**: Running app shell with all routes showing placeholders

### Phase 2: Homepage

- Build Hero Banner component (welcome + bot status + quick stats)
- Build StatsCard components with animated counters
- Build Announcement board (game bulletin style)
- Build feature shortcut grid (game-style icon buttons)
- Build activity/chart section with Recharts
- Connect to existing API endpoints
- **Deliverable**: Fully functional new homepage

### Phase 3: Navigation & Layout

- Build MainLayout with responsive NavBar
- Implement side drawer with game-themed menu items
- Build LiffLayout for LINE LIFF pages
- Mobile responsive design
- **Deliverable**: Complete navigation system

### Phase 4: Page Migration

Migrate each page from old frontend to new, one at a time:

1. Rankings (chart-heavy, good test for Recharts)
2. Gacha (interactive, tests user interaction patterns)
3. ScratchCard
4. Bag & Equipment
5. Trade
6. Bot settings
7. Group management
8. Panel & Admin
9. Tools
10. LIFF pages

Each page: rewrite with MUI v7 + game theme, connect to same API endpoints, verify feature parity.

- **Deliverable**: All pages migrated and functional

### Phase 5: Cutover

- Final side-by-side testing
- Remove `frontend/`
- Rename `frontend-next/` → `frontend/`
- Update Docker configuration
- Update nginx config if needed
- **Deliverable**: New frontend in production

## API Compatibility

The backend API (`/api/*`) remains unchanged. The new frontend will consume the exact same endpoints. No backend changes needed.

## Risk Mitigation

- **Side-by-side development**: Old frontend untouched until full verification
- **Same API**: No backend changes reduce risk
- **Phase-by-phase**: Each phase is independently testable
- **Feature parity checklist**: Each migrated page verified against original
