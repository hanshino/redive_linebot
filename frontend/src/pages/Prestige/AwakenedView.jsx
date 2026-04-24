import { Box, Typography, Chip, useMediaQuery } from "@mui/material";
import { getStarConfig } from "./starColors";
import { getBlessingIcon } from "./blessingIcons";

// ─── Build detection ──────────────────────────────────────────────────────────

/**
 * Detects which build achievement tags apply to the given blessing id set.
 * Mirrors backend evaluateBuildAchievementKeys logic.
 */
function detectBuilds(blessingIds) {
  const set = new Set(blessingIds);
  const builds = [];
  if (set.has(2) && set.has(3)) builds.push({ key: "breeze", emoji: "🌬️", name: "疾風之道" });
  if (set.has(4) && set.has(5)) builds.push({ key: "torrent", emoji: "🌊", name: "洪流之道" });
  if (set.has(6) && set.has(7)) builds.push({ key: "temperature", emoji: "🌡️", name: "溫度兼融" });
  if (!set.has(6) && blessingIds.length >= 3)
    builds.push({ key: "solitude", emoji: "🏝️", name: "孤獨之道" });
  return builds;
}

// ─── AwakenedView ─────────────────────────────────────────────────────────────

export default function AwakenedView({ status }) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const passedTrials = status.passedTrials ?? [];
  const ownedBlessingDetails = status.ownedBlessingDetails ?? [];
  const ownedBlessingIds = status.ownedBlessings ?? [];

  const detectedBuilds = detectBuilds(ownedBlessingIds);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      {/* Gradient banner */}
      <Box
        sx={{
          background: reducedMotion
            ? "#6c5ce7"
            : "linear-gradient(135deg, #6c5ce7 0%, #d63384 100%)",
          color: "#fff",
          borderRadius: 2,
          p: 3,
          textAlign: "center",
        }}
      >
        <Typography variant="h4" component="div" fontWeight={800} sx={{ mb: 1 }}>
          ✨ 覺醒者 ✨
        </Typography>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          你已完成所有 5 道試煉
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.75, mt: 0.5 }}>
          並擇取了你的祝福 build
        </Typography>
      </Box>

      {/* Passed trials */}
      {passedTrials.length > 0 && (
        <Box
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, mb: 1.5, display: "block" }}
          >
            通過試煉
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {passedTrials.map(trial => {
              const { color, tierLabel } = getStarConfig(trial.star);
              return (
                <Chip
                  key={trial.id}
                  label={`★${trial.star} ${trial.displayName} · ${tierLabel}`}
                  size="small"
                  variant="outlined"
                  sx={{ color, borderColor: color, fontWeight: 600 }}
                />
              );
            })}
          </Box>
        </Box>
      )}

      {/* Owned blessings */}
      {ownedBlessingDetails.length > 0 && (
        <Box
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, mb: 1.5, display: "block" }}
          >
            永久祝福 ({ownedBlessingDetails.length})
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {ownedBlessingDetails.map(blessing => {
              const BlessingIcon = getBlessingIcon(blessing.slug);
              return (
                <Box key={blessing.id} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                  <BlessingIcon sx={{ fontSize: 20, color: "primary.main", flexShrink: 0 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      {blessing.displayName}
                    </Typography>
                    {blessing.description && (
                      <Typography variant="caption" color="text.secondary">
                        {blessing.description}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* Detected build achievements */}
      {detectedBuilds.length > 0 && (
        <Box
          sx={{
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
            p: 2,
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 700, mb: 1.5, display: "block" }}
          >
            解鎖 Build 成就
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {detectedBuilds.map(build => (
              <Chip
                key={build.key}
                label={`${build.emoji} ${build.name}`}
                size="small"
                color="secondary"
                variant="outlined"
                sx={{ fontWeight: 600 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Footer note */}
      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
        可繼續升等，但等級上限保持 Lv.100
      </Typography>
    </Box>
  );
}
