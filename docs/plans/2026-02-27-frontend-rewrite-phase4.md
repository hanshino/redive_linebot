# Phase 4: Page Migration Plan

## Overview
Migrate all ~30 existing frontend pages from `frontend/` to `frontend-next/`, replacing placeholder components with functional implementations.

## Migration Patterns
| Old | New |
|-----|-----|
| `makeStyles` | `sx` prop |
| `@material-ui/core` | `@mui/material` (v7) |
| `material-table` | `@mui/x-data-grid` |
| DevExpress charts | Recharts |
| `primaryTypographyProps` | `slotProps.primary` |
| `useHistory()` | `useNavigate()` |
| `Switch/Route` (v5) | `Routes/Route` (v7) |
| `withStyles` | `styled()` or `sx` |
| `Grid item xs={6}` | `Grid size={{ xs: 6 }}` |

## Dependencies to Install
- `react-copy-to-clipboard` (Panel pages)

## Task Breakdown

### Task 1: Shared Components & Hooks
Create reusable components that many pages depend on:
- `components/Loading.jsx` — CirclesLoading, DotsLoading, etc. (CSS spinners with Backdrop)
- `components/AlertLogin.jsx` — Login warning alert
- `components/AlertDialog.jsx` + `hooks/useAlertDialog.js`
- `components/HintSnackBar.jsx` + `hooks/useHintBar.js`
- `components/OrderDialog.jsx` — Order create/edit dialog
- `hooks/useLiff.js` — useSendMessage hook
- `hooks/useQuery.js` — URL query params hook
- `flex/TradeNotify.js` — LINE Flex Message template

### Task 2: Rankings Page (3 DataGrid charts)
- `pages/Rankings/index.jsx` — Container with 3 chart sections
- `pages/Rankings/ChatLevelChart.jsx` — DataGrid table (already uses @mui/x-data-grid)
- `pages/Rankings/GachaRankChart.jsx` — DataGrid table
- `pages/Rankings/GodStoneChart.jsx` — DataGrid table

### Task 3: Bot Pages
- `pages/Bot/Binding.jsx` — Simple LIFF login status page
- `pages/Bot/Notify.jsx` — Notification subscription management

### Task 4: Bag + Gacha Exchange + ScratchCard
- `pages/Bag/index.jsx` — User inventory with character cards
- `pages/Gacha/Exchange.jsx` — God stone shop (purchase items)
- `pages/ScratchCard/index.jsx` — Scratch card list
- `pages/ScratchCard/Detail.jsx` — Single scratch card detail
- `pages/ScratchCard/Exchange.jsx` — Prize exchange
- `components/CharacterCard.jsx` — Reusable character display card

### Task 5: Trade Pages (4 files)
- `pages/Trade/Order.jsx` — Create trade order (LIFF + share)
- `pages/Trade/Manage.jsx` — DataGrid trade list with pagination
- `pages/Trade/Detail.jsx` — Trade detail + cancel/share actions
- `pages/Trade/Transaction.jsx` — Accept/deny transaction flow

### Task 6: Panel + Tools Pages
- `pages/Panel/Manual.jsx` — Tab-based command reference (LIFF send)
- `pages/Panel/BattleControl.jsx` — Accordion battle commands (useReducer)
- `pages/Panel/BattleSign.jsx` — Battle sign-up form with slider
- `pages/Tools/BattleTime.jsx` — Timeline parser + compensated attack calculator
- Install `react-copy-to-clipboard`

### Task 7: Group Pages
- `pages/Group/Battle.jsx` — Tab routing (SigninTable + ConfigPage)
- `components/GroupBattle/SigninTable.jsx` — material-table → DataGrid
- `components/GroupBattle/ConfigPage.jsx` — Config wrapper
- `components/GroupBattle/SignMessage.jsx` — Sign message settings
- `components/GroupBattle/NotifyConfig.jsx` — Notify config
- `pages/Group/Config.jsx` — Group settings dashboard
- `components/GroupConfig/ConfigCard.jsx` — Feature toggle card
- `components/GroupConfig/SenderInput.jsx` — Bot sender customization
- `pages/Group/Record.jsx` — DevExpress pie → Recharts PieChart

### Task 8: Equipment + CustomerOrder
- `pages/Equipment/index.jsx` — Equipment management (529 lines, complex)
- `pages/CustomerOrder/index.jsx` — Custom command management

### Task 9: Admin Pages (Simple)
- `pages/Admin/GachaPool.jsx` — Pool list + action dialog (material-table → DataGrid)
- `pages/Admin/GachaShop.jsx` — God stone shop management (material-table → DataGrid)
- `pages/Admin/GlobalOrder.jsx` — Global order management (reuses OrderDialog)
- `pages/Admin/ScratchCard.jsx` — Scratch card generation tool

### Task 10: Admin Pages (Complex)
- `pages/Admin/Worldboss.jsx` — World boss CRUD with image upload
- `pages/Admin/WorldbossEvent.jsx` — Event schedule (material-table → DataGrid)
- `pages/Admin/WorldbossMessage.jsx` — Message list (DataGrid)
- `pages/Admin/WorldbossMessageCreate.jsx` — Create message form
- `pages/Admin/WorldbossMessageUpdate.jsx` — Update message form
- `pages/Admin/Messages.jsx` — Real-time Socket.IO message monitor

## Execution Strategy
- Use subagent-driven development (1 task per subagent)
- Each task gets a git commit
- Tasks 1 must complete first (shared deps), rest can proceed in order
- Focus on functional parity, not pixel-perfect matching
- Use MUI v7 `sx` prop throughout, no makeStyles
