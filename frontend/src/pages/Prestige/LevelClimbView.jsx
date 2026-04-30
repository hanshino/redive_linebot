import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

// ─── Constants ────────────────────────────────────────────────────────────────

// Lv.100 cumulative XP under the current curve (round(13 * level^2) at level 100).
const APPROX_MAX_EXP = 130_000;

const FAQ_ITEMS = [
  {
    q: "轉生會失去什麼？",
    a: "等級歸零，但祝福永久保留；通過的試煉也保留。女神石、成就、道具皆不影響。",
  },
  {
    q: "試煉失敗了會怎樣？",
    a: "60 天期限內未達標視為失敗。當次累積的 XP 保留在等級，可再次挑戰同一試煉。",
  },
  {
    q: "為什麼要轉生？",
    a: "每次轉生可挑選一個祝福，獲得永久的 XP 或冷卻加成。5 次轉生後達成覺醒終態。",
  },
];

// ─── LevelClimbView ───────────────────────────────────────────────────────────

export default function LevelClimbView({ status }) {
  const { currentLevel, currentExp, prestigeCount } = status;

  const remaining = Math.max(APPROX_MAX_EXP - currentExp, 0);
  const showOnboarding = prestigeCount === 0 && currentLevel === 0;

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        p: 2.5,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      {/* Distance to Lv.100 */}
      <Box>
        <Typography variant="h6" component="div" fontWeight={700}>
          距離 Lv.100 還需約 {remaining.toLocaleString()} XP
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          目前 Lv.{currentLevel}，累積 {currentExp.toLocaleString()} XP
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          可在下方選擇試煉開始挑戰，期間 XP 同時計入等級與試煉條件。
        </Typography>
      </Box>

      {showOnboarding && (
        <Grid container spacing={{ xs: 1.5, md: 3 }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              首次指南
            </Typography>
            <Box
              component="ol"
              sx={{ m: 0, pl: 2.5, display: "flex", flexDirection: "column", gap: 0.75 }}
            >
              <Typography component="li" variant="body2">
                從下方選一道試煉開始挑戰（不需等到 Lv.100）
              </Typography>
              <Typography component="li" variant="body2">
                試煉期間發話 XP 同時計入等級與試煉條件，60 天為期
              </Typography>
              <Typography component="li" variant="body2">
                試煉通過、Lv.100 達成後即可選祝福完成轉生，等級歸零
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              常見問題
            </Typography>
            <Box>
              {FAQ_ITEMS.map((item, idx) => (
                <Accordion
                  key={idx}
                  disableGutters
                  elevation={0}
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: "8px !important",
                    mb: 1,
                    "&:before": { display: "none" },
                  }}
                >
                  <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 44 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {item.q}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ pt: 0 }}>
                    <Typography variant="body2" color="text.secondary">
                      {item.a}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
