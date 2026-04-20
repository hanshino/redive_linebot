import { useState, useEffect, useRef } from "react";
import { Box, Card, Typography, Skeleton, useMediaQuery } from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";

const BORDER_COLORS = {
  normal: "primary.main",
  streakBroken: "error.main",
  highStakes: "warning.main",
  draw: "grey.500",
};

function getCardType(match) {
  if (match.streakBroken) return "streakBroken";
  if (match.betAmount >= 10000) return "highStakes";
  if (match.player1.result === "draw") return "draw";
  return "normal";
}

function getResultText(match) {
  const { player1, player2 } = match;

  if (player1.result === "draw") {
    return `${player1.displayName} ${player1.choice} vs ${player2.choice} ${player2.displayName}｜平手`;
  }

  const winner = player1.result === "win" ? player1 : player2;
  const loser = player1.result === "win" ? player2 : player1;

  let text = `${winner.displayName} ${winner.choice} vs ${loser.choice} ${loser.displayName}｜${winner.displayName} 勝`;

  if (match.eloChange) {
    text += `｜+${match.eloChange} 分`;
  }

  return text;
}

function getSubText(match) {
  if (match.streakBroken) {
    return `終結 ${match.streakBroken} 連勝！獵殺懸賞 ${match.bountyWon?.toLocaleString() || 0}`;
  }
  if (match.betAmount > 0 && match.player1.result !== "draw") {
    const winnerGets = Math.floor(match.betAmount * 2 * 0.9);
    return `贏得 ${winnerGets.toLocaleString()} 女神石`;
  }
  return null;
}

const rollVariants = {
  enter: {
    rotateX: 90,
    opacity: 0,
    y: -20,
    transition: { duration: 0.4, ease: "easeOut" },
  },
  center: {
    rotateX: 0,
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut" },
  },
  exit: {
    rotateX: -90,
    opacity: 0,
    y: 20,
    transition: { duration: 0.3, ease: "easeIn" },
  },
};

const MotionCard = motion.create(Card);

export default function BattleFeed({ matches, loading }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const timerRef = useRef(null);
  const prefersReducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  // Reset index when matches data changes
  useEffect(() => {
    setCurrentIndex(0);
  }, [matches]);

  useEffect(() => {
    if (!matches || matches.length === 0) return;
    if (prefersReducedMotion) return;

    timerRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % matches.length);
    }, 3500);

    return () => clearInterval(timerRef.current);
  }, [matches, prefersReducedMotion]);

  if (loading) {
    return <Skeleton variant="rounded" height={80} sx={{ mb: 3 }} />;
  }

  if (!matches || matches.length === 0) {
    return (
      <Card sx={{ p: 2, mb: 3, textAlign: "center" }}>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
          }}
        >
          尚無對戰紀錄
        </Typography>
      </Card>
    );
  }

  const safeIndex = currentIndex < matches.length ? currentIndex : 0;
  const match = matches[safeIndex];
  const cardType = getCardType(match);
  const subText = getSubText(match);

  return (
    <Box sx={{ mb: 3 }}>
      <Typography
        variant="subtitle2"
        sx={{
          color: "text.secondary",
          mb: 1,
        }}
      >
        戰況播報
      </Typography>
      <Box sx={{ perspective: 600, minHeight: 72 }}>
        <AnimatePresence mode="wait">
          <MotionCard
            key={safeIndex}
            variants={prefersReducedMotion ? undefined : rollVariants}
            initial={prefersReducedMotion ? undefined : "enter"}
            animate={prefersReducedMotion ? undefined : "center"}
            exit={prefersReducedMotion ? undefined : "exit"}
            aria-live="polite"
            aria-atomic="true"
            sx={{
              p: 2,
              borderLeft: 4,
              borderColor: BORDER_COLORS[cardType],
              transformOrigin: "center bottom",
              backfaceVisibility: "hidden",
            }}
          >
            <Typography
              variant="body2"
              sx={{
                fontWeight: cardType === "draw" ? 400 : 600,
                color: cardType === "draw" ? "text.secondary" : "text.primary",
              }}
            >
              {getResultText(match)}
            </Typography>
            {subText && (
              <Typography
                variant="caption"
                sx={{
                  color: cardType === "streakBroken" ? "error.main" : "text.secondary",
                  fontWeight: cardType === "streakBroken" ? 600 : 400,
                  mt: 0.5,
                  display: "block",
                }}
              >
                {subText}
              </Typography>
            )}
          </MotionCard>
        </AnimatePresence>
      </Box>
    </Box>
  );
}
