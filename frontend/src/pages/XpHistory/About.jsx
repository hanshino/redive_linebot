import { Link as RouterLink } from "react-router-dom";
import { Box, Container, Stack, Typography, Divider, Chip, Link, Paper } from "@mui/material";

function Section({ title, children }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        {title}
      </Typography>
      <Stack gap={1}>{children}</Stack>
    </Box>
  );
}

function Term({ name, children }) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "baseline" }}>
      <Box sx={{ minWidth: 90, fontWeight: 600 }}>{name}</Box>
      <Box sx={{ flex: 1, color: "text.secondary", fontSize: 14, lineHeight: 1.7 }}>{children}</Box>
    </Box>
  );
}

function Eq({ children }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.25,
        bgcolor: "#F8FAFB",
        fontFamily: "ui-monospace, Menlo, monospace",
        fontSize: 13,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    >
      {children}
    </Paper>
  );
}

function Row({ k, v, hint }) {
  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, fontSize: 13 }}>
      <Box sx={{ minWidth: 110, fontFamily: "ui-monospace, Menlo, monospace" }}>{k}</Box>
      <Box sx={{ minWidth: 70, fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 600 }}>
        {v}
      </Box>
      {hint && <Box sx={{ color: "text.secondary" }}>{hint}</Box>}
    </Box>
  );
}

export default function XpHistoryAbout() {
  return (
    <Container maxWidth="md" sx={{ py: 2 }}>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/xp-history" underline="hover" fontSize={14}>
          ← 經驗歷程
        </Link>
        <Typography variant="h6">名詞與計算說明</Typography>
      </Stack>

      <Section title="原始 XP 與實得 XP">
        <Term name="原始 XP">每則訊息的帳面值：基礎 90 點，再乘上冷卻、群組、暖流祝福。</Term>
        <Term name="實得 XP">
          實際入帳的 XP。原始 XP 經今日累積遞減後，再套上蜜月、試煉、永久加成。
        </Term>
        <Typography variant="caption" color="text.secondary">
          畫面上「原始 XP → 實得 XP」就是這條鏈。
        </Typography>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="原始 XP 計算（每則訊息）">
        <Eq>原始 = round( 基礎 × 冷卻 × 群組 × 暖流 )</Eq>
        <Term name="基礎">基礎 XP，預設 90（管理員可調整全域基礎 XP）。</Term>
        <Term name="冷卻">距上一則訊息的時間區間，下表查得。</Term>
        <Term name="群組">群組人數加成（5 人起算）。</Term>
        <Term name="暖流">祝福 #1「暖流」啟用時 ×1.08。</Term>
      </Section>

      <Section title="冷卻倍率表（基本規則）">
        <Stack gap={0.5}>
          <Row k="0–1 秒" v="×0" hint="連發完全不算" />
          <Row k="1–2 秒" v="×0.1" />
          <Row k="2–4 秒" v="×0.5" />
          <Row k="4–6 秒" v="×0.8" />
          <Row k="≥ 6 秒" v="×1.0" hint="滿速" />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          ★3 試煉中：所有時間區間延長為原來的 4/3。
        </Typography>
        <Typography variant="caption" color="text.secondary">
          祝福 #2 韻律：×0.5 改為 ×0.7、×0.8 改為 ×0.9。
        </Typography>
        <Typography variant="caption" color="text.secondary">
          祝福 #3 急流：×0、×0.1 改為 ×0.1、×0.3（連發也能拿一些）。
        </Typography>
      </Section>

      <Section title="群組加成">
        <Eq>
          {"人數 < 5  → ×1.0\n"}
          {"人數 ≥ 5  → 1 + (人數 − 5) × 0.02"}
        </Eq>
        <Term name="祝福 #6">每人加成從 0.02 → 0.025。</Term>
        <Term name="祝福 #7">人數 &lt; 10 時整體再 ×1.3（小群也能溫暖）。</Term>
        <Term name="★4 試煉">關閉群組加成（恆 ×1.0）。</Term>
      </Section>

      <Divider sx={{ my: 2 }} />

      <Section title="每日遞減階段（從原始 XP 換成實得 XP）">
        <Stack gap={0.5}>
          <Row k="0 ~ 400" v="×1.0" hint="第一階 · 滿速" />
          <Row k="400 ~ 1000" v="×0.3" hint="第二階 · 緩漲" />
          <Row k="≥ 1000" v="×0.03" hint="第三階 · 幾乎不漲" />
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          祝福 #4：第一階上限 400 → 600。
        </Typography>
        <Typography variant="caption" color="text.secondary">
          祝福 #5：第二階上限 1000 → 1200。
        </Typography>
        <Typography variant="caption" color="text.secondary">
          注意：每則訊息的遞減倍率是「分段套用」的；如果一則訊息跨過階段邊界，會分別吃前後段倍率，所以遞減倍率可能落在
          0.03 ~ 1.0 之間任意值。
        </Typography>
      </Section>

      <Section title="實得 XP 後續加成">
        <Term name="蜜月">
          轉生次數 = 0 時自動 ×1.2。轉生一次後解除（讓老玩家不會永遠領蜜月）。
        </Term>
        <Term name="試煉">進行 ★N 試煉時固定倍率：★2 ×0.7、★5 ×0.5；其他星等不影響實得 XP。</Term>
        <Term name="永久">轉生獎勵或活動發出的永久加成；可累加。</Term>
      </Section>

      <Section title="試煉 ★ 對照">
        <Stack gap={0.5}>
          <Row k="★2" v="實得 ×0.7" hint="所有 XP 打七折" />
          <Row k="★3" v="冷卻時間延長 4/3" hint="連發更難滿速" />
          <Row k="★4" v="關閉群組加成" />
          <Row k="★5" v="實得 ×0.5" hint="最艱難" />
        </Stack>
      </Section>

      <Section title="祝福清單（7 選 5）">
        <Stack gap={0.5}>
          <Row k="#1 暖流" v="原始 ×1.08" />
          <Row k="#2 韻律" v="冷卻寬鬆" hint="×0.5→×0.7、×0.8→×0.9" />
          <Row k="#3 急流" v="連發也算分" hint="0–1 秒 ×0.1、1–2 秒 ×0.3" />
          <Row k="#4 餘韻" v="第一階 → 600" />
          <Row k="#5 餘溫" v="第二階 → 1200" />
          <Row k="#6 共鳴" v="群組每人加成 0.025" />
          <Row k="#7 知音" v="小群 ×1.3" hint="人數 < 10 時" />
        </Stack>
      </Section>

      <Section title="完整公式（單則訊息）">
        <Eq>
          {"原始     = round(基礎 × 冷卻 × 群組 × 暖流)\n"}
          {"乘蜜月   = 原始 × 蜜月\n"}
          {"分段遞減 = 依今日已得分階套用倍率\n"}
          {"實得     = round(分段遞減 × 試煉 × 永久)"}
        </Eq>
        <Typography variant="caption" color="text.secondary">
          頁面上每筆紀錄的「原始 XP」就是公式第一行的結果；「實得
          XP」是最終值。中間乘數依上面順序逐項列出。
        </Typography>
      </Section>

      <Section title="保留期">
        <Term name="逐筆紀錄">
          <Chip size="small" label="30 天" sx={{ mr: 0.75 }} />
          每天凌晨 3 點清掉超過 30 天的事件，讓資料庫不會無限長大。
        </Term>
        <Term name="每日趨勢">
          <Chip size="small" label="長期保留" />
          以每日累計形式存放（一天一筆），不受 30 天限制。
        </Term>
      </Section>
    </Container>
  );
}
