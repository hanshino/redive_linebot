import { useTheme } from "@mui/material/styles";

// 功能卡插圖。純裝飾（卡名就在下方），所以 aria-hidden。
// 顏色全部來自 theme.palette.art / stage，插圖不跟深淺模式換色，只換底色。
const drawings = {
  janken: (a, s) => (
    <>
      <rect width="160" height="120" fill={s.panel} />
      <circle cx="80" cy="58" r="34" fill={a.stageRing} />
      <path
        d="M46 70c-4-6-2-13 4-15l12-4c3-1 6 1 7 4l3 10c1 5-2 9-7 10l-10 2c-4 1-7-3-9-7z"
        fill={s.accent}
      />
      <path
        d="M114 70c4-6 2-13-4-15l-12-4c-3-1-6 1-7 4l-3 10c-1 5 2 9 7 10l10 2c4 1 7-3 9-7z"
        fill={a.stageLight}
      />
      <path d="M74 34h12l-3 14h-6z" fill={s.accent} />
      <rect x="52" y="92" width="56" height="6" rx="3" fill={a.stageFloor} />
    </>
  ),
  worldboss: (a, s) => (
    <>
      <rect width="160" height="120" fill={s.panel} />
      <path d="M44 96c0-24 16-40 36-40s36 16 36 40z" fill={a.beast} />
      <circle cx="80" cy="50" r="24" fill={a.beastLight} />
      <path d="M56 40L46 24l16 6zM104 40l10-16-16 6z" fill={a.horn} />
      <circle cx="71" cy="48" r="4" fill={s.accent} />
      <circle cx="89" cy="48" r="4" fill={s.accent} />
      <path d="M70 62h20l-4 6H74z" fill={a.beastMouth} />
      <path d="M118 96l14-46 6 2-12 44z" fill={a.steel} />
    </>
  ),
  race: a => (
    <>
      <rect width="160" height="120" fill={a.bg} />
      <path d="M26 92h108" stroke={a.line} strokeWidth="6" strokeLinecap="round" />
      <path
        d="M58 90c-6-6-10-14-8-24 2-11 12-18 24-18 6 0 10-3 13-8l9 6-5 9 14 8c6 3 8 10 5 16l-7 11z"
        fill={a.violet}
      />
      <path d="M96 40l10-10 5 10-9 7z" fill={a.violetDeep} />
      <circle cx="101" cy="46" r="3" fill={a.paper} />
      <path
        d="M62 90l-4 14M78 92l-2 12M98 90l4 14"
        stroke={a.violetDeep}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="M34 36v44" stroke={a.caramel} strokeWidth="4" strokeLinecap="round" />
      <path d="M36 36h20v14H36z" fill={a.amber} />
    </>
  ),
  gacha: a => (
    <>
      <rect width="160" height="120" fill={a.bg} />
      <rect x="46" y="58" width="68" height="50" rx="8" fill={a.gold} />
      <path d="M46 68h68v8H46z" fill={a.goldDeep} />
      <circle cx="80" cy="44" r="28" fill={a.paper} />
      <circle cx="80" cy="44" r="24" fill={a.pinkPale} />
      <circle cx="70" cy="38" r="7" fill={a.pink} />
      <circle cx="88" cy="44" r="8" fill={a.violet} />
      <circle cx="76" cy="54" r="6" fill={a.cyan} />
      <rect x="70" y="84" width="20" height="14" rx="4" fill={a.cream} />
      <circle cx="104" cy="90" r="5" fill={a.amber} />
    </>
  ),
  trade: a => (
    <>
      <rect width="160" height="120" fill={a.bg} />
      <rect x="28" y="42" width="42" height="56" rx="6" fill={a.violet} />
      <circle cx="49" cy="62" r="9" fill={a.skin} />
      <path d="M36 92c2-10 6-15 13-15s11 5 13 15z" fill={a.violetPale} />
      <rect x="90" y="42" width="42" height="56" rx="6" fill={a.cyan} />
      <circle cx="111" cy="62" r="9" fill={a.skin} />
      <path d="M98 92c2-10 6-15 13-15s11 5 13 15z" fill={a.cyanPale} />
      <path d="M72 56h16l-5-6 11 9-11 9 5-6H72z" fill={a.caramel} />
      <path d="M88 86H72l5 6-11-9 11-9-5 6h16z" fill={a.caramel} />
    </>
  ),
  bag: a => (
    <>
      <rect width="160" height="120" fill={a.bg} />
      <path
        d="M62 44a18 18 0 0136 0"
        fill="none"
        stroke={a.ink}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="42" y="42" width="76" height="62" rx="12" fill={a.caramel} />
      <rect x="42" y="62" width="76" height="12" fill={a.caramelDeep} />
      <rect x="70" y="56" width="20" height="24" rx="5" fill={a.cream} />
      <circle cx="80" cy="68" r="3.5" fill={a.caramel} />
    </>
  ),
  achievement: a => (
    <>
      <rect width="160" height="120" fill={a.bg} />
      <path d="M56 24h48v26a24 24 0 01-48 0z" fill={a.amber} />
      <path
        d="M56 30H42v8c0 9 6 14 14 15zM104 30h14v8c0 9-6 14-14 15z"
        fill="none"
        stroke={a.caramel}
        strokeWidth="6"
      />
      <rect x="72" y="74" width="16" height="16" fill={a.caramel} />
      <rect x="54" y="90" width="52" height="12" rx="4" fill={a.ink} />
      <path d="M80 36l4 8 9 1-6.5 6 1.5 9-8-4.5-8 4.5 1.5-9-6.5-6 9-1z" fill={a.cream} />
    </>
  ),
  rankings: a => (
    <>
      <rect width="160" height="120" fill={a.bg} />
      <path
        d="M34 34h74a8 8 0 018 8v34a8 8 0 01-8 8H66l-18 14V84h-14a8 8 0 01-8-8V42a8 8 0 018-8z"
        fill={a.cyan}
      />
      <rect x="46" y="48" width="50" height="7" rx="3.5" fill={a.cyanPale} />
      <rect x="46" y="62" width="34" height="7" rx="3.5" fill={a.cyanPale} />
      <path d="M118 30l5 10 11 1.5-8 8 2 11-10-5.5-10 5.5 2-11-8-8 11-1.5z" fill={a.amber} />
    </>
  ),
};

export default function FeatureArt({ name }) {
  const { art, stage } = useTheme().palette;
  return (
    <svg
      viewBox="0 0 160 120"
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {drawings[name](art, stage)}
    </svg>
  );
}
