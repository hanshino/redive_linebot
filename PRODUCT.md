# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** Princess Connect Re:Dive players inside LINE groups, on their phones. They interact through group text commands and LINE Flex cards, and open LIFF pages (inside the LINE webview) for anything personal or detailed: bag, achievements, XP history, trade, settings.
- **Secondary:** group admins and the bot owner, who configure per-group features, custom commands, gacha pools and other back-office settings through the same LIFF frontend.

## Product Purpose

布丁機器人 turns a LINE group into a shared game space. Chatting earns EXP and levels; members play janken duels and arenas, fight world bosses together, bet on races, trade in a player market, and collect characters through simulated gacha. Game-data lookup (characters, gacha simulation, guild battle coordination) and Gemini-backed conversation support that core. Success means groups keep coming back to play together, and each player can see their own progress privately.

## Positioning

Group-level social gamification: the group is the unit of play, not the individual lookup. Shared, persistent group games (chat levels, rankings, world boss, janken, race, market) built on top of a PCR-themed bot, rather than a game-data reference tool.

## Operating Context

- Everything happens inside LINE: group chat for commands and public cards, LIFF webview for pages. Phone-first; desktop is incidental.
- Copy is zh-TW and addresses the player as 你.
- Two UI surfaces share one identity: LINE Flex Message cards (built in `app/src/templates/`) and the LIFF React frontend (`frontend/`).
- Background jobs (auto-gacha, EXP aggregation, achievement evaluation, race lifecycle) run on a cron worker and can produce delayed group announcements.

## Capabilities and Constraints

- Features: gacha and exchange shop (女神石), chat levels and sign-in, rankings, janken arena with ranks, world boss raids with equipment, horse race, trade market and transfers, bag and equipment, guild battle tools, achievements and prestige, group custom commands and feature toggles, AI conversation.
- **Public vs personal:** messages sent into a group are shared public UI. Classify every field as public state or personal state before designing; do not mix both in one group card. Personal quotas, progress, EXP, rewards, ledgers and history belong in LIFF or an explicitly private context. Existing exceptions are recorded in `.impeccable/critique/ignore.md`.
- **Group noise:** frequent group actions prefer silent handling, throttling, aggregation or milestone-only announcements over one reply per action.
- **Delivery:** delayed group announcements use the reply-token queue (`replyTokenQueue` + `broadcastQueue`), never LINE Push.
- **Secrecy:** achievement and reward unlock conditions are confidential. Players read the codebase, so UI must not reveal unlock conditions beyond what is intended, and condition SQL is never committed.

## Evidence on Hand

- Game data and character assets: `app/assets/redive_tw.db`, served images under `/bot-assets`.
- No testimonials, user counts or usage metrics are recorded; do not fabricate them.

## Product Principles

1. The group plays together: shared state is the product, and group messages stay objective and public.
2. Personal progress is private by default and lives in LIFF.
3. Respect the chat: fewer, better group messages beat one reply per action.
4. Hidden rules stay hidden: never leak achievement or reward conditions.
5. Honest state: failure, empty and loading are always distinguishable.

## Accessibility & Inclusion

Touch targets at least 44px and text at least 12px (Flex: at least `xs`), since all use is on phones inside the LINE webview.
