---
version: 1
slug: "frontend-src-pages-home"
primary_target: "frontend/src/pages/Home"
related_targets: ["frontend/src/layouts/MainLayout.jsx"]
---

Scope: LIFF Home (`frontend/src/pages/Home/`) plus the shared app shell (AppBar / desktop nav in `frontend/src/layouts/MainLayout.jsx`). Mode: Operate (player-facing game hub). Admin/settings pages keep the existing Operate look.

Audience: PCR players opening LIFF from a LINE group on their phone. Job: see today's state, act on what is unfinished, jump into a game feature.

## Direction contract
THESIS: The player holds an adventurer card and features are collectible cards. Refuses the dashboard skeleton (hero banner + stat tiles + icon-square feature grid + permanent admin side drawer).
OWN-WORLD: Mist ground, Miyako cyan working color, caramel for 女神石. Collectible-card frames: player card carries the rarity ladder (common/rare/epic/legendary) with a holo foil band on legendary only; feature cards use one neutral cyan frame, stage cards (janken, world boss) use stage-night with amber hairline. Chakra Petch display for names and numbers, Noto Sans TC body, tabular numbers.
STORY: Player recognizes themself on the card, sees what is still unfinished today (lit until handled), taps a feature card to play.
FIRST VIEWPORT: Phone: adventurer card is the hero (large portrait top half, name plate on its lower edge, Lv/EXP/女神石/段位/連續簽到 below, 今日簽到 button), then the 今天未完成 strip. Desktop: top tabs (首頁/簽到/市場/排行榜) in the AppBar, no permanent drawer; left column sticky card + strip, right column card binder 3-4 cols.
FORM: Trading card binder, position 3 of 7 on the grounded list. seed:ab2e8e9f8b02da12
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Reference mockup: ~/open-design/.od/projects/home-aa13/liff-home.html (v2). Known fix: holo stripes must not appear on the 今日簽到 button.
