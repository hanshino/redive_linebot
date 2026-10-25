import { createElement } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";
import { motion, useReducedMotion } from "framer-motion";
import { getBlessingIcon } from "./blessingIcons";

const MAX_STARS = 5;

/**
 * 無障礙：Dialog 會把背景設成 aria-hidden，所以不另外放 aria-live 區塊；
 * 螢幕閱讀器靠 aria-labelledby（標題）+ aria-describedby（說明）在對話框開啟時唸出，
 * 焦點落在「繼續」按鈕。
 *
 * 轉生完成的那一刻。只有這個里程碑值得停下來：整個轉生週期（升到 Lv.100、過試煉）
 * 的終點，而且之後等級歸零，玩家需要一個清楚的「我完成了」。
 *
 * 唯一的動畫：新增的那顆星彈出一次，旁邊一圈宮子青光暈跟著展開。
 * prefers-reduced-motion 時整段改成靜態，內容與按鈕完全相同。
 *
 * moment: { count: 轉生後次數, blessingName, blessingSlug, awakened }
 */
export default function PrestigeMoment({ open, moment, onClose }) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const reduced = useReducedMotion();

  if (!moment) return null;

  const { count, blessingName, blessingSlug, awakened } = moment;
  const stars = Math.min(count, MAX_STARS);
  const title = awakened ? "覺醒完成" : `第 ${count} 次轉生完成`;
  const line = awakened
    ? "5 個祝福已永久鎖定，你現在是覺醒者。"
    : "祝福永久生效，等級從 Lv.1 重新開始。";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="xs"
      fullWidth
      aria-labelledby="prestige-moment-title"
      aria-describedby="prestige-moment-line"
    >
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 2.5,
          py: 5,
        }}
      >
        <Box
          aria-hidden
          sx={{ position: "relative", display: "flex", alignItems: "center", gap: 0.5, py: 2 }}
        >
          {/* 光暈：跟著最新一顆星，只展開一次 */}
          <motion.span
            initial={reduced ? false : { opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
            style={{
              position: "absolute",
              left: `calc(${(stars - 0.5) / MAX_STARS} * 100%)`,
              top: "50%",
              width: 96,
              height: 96,
              marginLeft: -48,
              marginTop: -48,
              borderRadius: "50%",
              background: alpha(theme.palette.primary.light, 0.18),
            }}
          />
          {Array.from({ length: MAX_STARS }, (_, i) => {
            const filled = i < stars;
            const isNewest = i === stars - 1;
            const Icon = filled ? StarRoundedIcon : StarBorderRoundedIcon;
            return (
              <motion.span
                key={i}
                initial={reduced || !isNewest ? false : { scale: 0.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.2 }}
                style={{ display: "inline-flex", position: "relative" }}
              >
                <Icon
                  sx={{
                    fontSize: { xs: 44, sm: 48 },
                    color: filled ? "secondary.light" : "text.disabled",
                  }}
                />
              </motion.span>
            );
          })}
        </Box>

        <Box>
          <Typography
            id="prestige-moment-title"
            variant="h5"
            component="h2"
            sx={{ fontWeight: 700 }}
          >
            {title}
          </Typography>
          <Typography
            id="prestige-moment-line"
            variant="body1"
            sx={{ color: "text.secondary", mt: 0.75 }}
          >
            {line}
          </Typography>
        </Box>

        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 1.25,
            px: 2,
            py: 1.25,
            borderRadius: 2,
            border: 1,
            borderColor: "divider",
            bgcolor: "surface.subtle",
            maxWidth: "100%",
          }}
        >
          {createElement(getBlessingIcon(blessingSlug), {
            sx: { fontSize: 24, color: "primary.main", flexShrink: 0 },
          })}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            祝福「{blessingName}」
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, justifyContent: "center" }}>
        <Button
          variant="contained"
          size="large"
          onClick={onClose}
          autoFocus
          sx={{ minHeight: 48, minWidth: 160 }}
        >
          繼續
        </Button>
      </DialogActions>
    </Dialog>
  );
}
