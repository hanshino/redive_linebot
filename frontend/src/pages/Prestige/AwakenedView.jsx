import { Box, Typography, Chip, Grid, useMediaQuery } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import { getStarConfig } from "./starColors";
import { getBlessingIcon } from "./blessingIcons";
import { getBuildIcon } from "./buildIcons";

// ─── Build detection ──────────────────────────────────────────────────────────

/**
 * Detects which build achievement tags apply to the given blessing id set.
 * Mirrors backend evaluateBuildAchievementKeys logic.
 */
function detectBuilds(blessingIds) {
  const set = new Set(blessingIds);
  const builds = [];
  if (set.has(2) && set.has(3)) builds.push({ key: "breeze", name: "疾風之道" });
  if (set.has(4) && set.has(5)) builds.push({ key: "torrent", name: "洪流之道" });
  if (set.has(6) && set.has(7)) builds.push({ key: "temperature", name: "溫度兼融" });
  if (!set.has(6)) builds.push({ key: "solitude", name: "孤獨之道" });
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
          p: { xs: 3, md: 5 },
          textAlign: "center",
        }}
      >
        <Box
          sx={{
            mb: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: { xs: 1, md: 1.5 },
          }}
        >
          <AutoAwesomeIcon sx={{ fontSize: { xs: "1.75rem", md: "2.25rem" } }} />
          <Typography
            component="div"
            fontWeight={800}
            sx={{ fontSize: { xs: "2rem", md: "2.75rem" }, lineHeight: 1 }}
          >
            覺醒者
          </Typography>
          <AutoAwesomeIcon sx={{ fontSize: { xs: "1.75rem", md: "2.25rem" } }} />
        </Box>
        <Typography variant="body1" sx={{ opacity: 0.9 }}>
          你已完成所有 5 道試煉
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.75, mt: 0.5 }}>
          並擇取了你的祝福 build
        </Typography>
      </Box>

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

      <Grid container spacing={2.5}>
        {ownedBlessingDetails.length > 0 && (
          <Grid size={{ xs: 12, md: detectedBuilds.length > 0 ? 7 : 12 }}>
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 2,
                height: "100%",
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
          </Grid>
        )}

        {detectedBuilds.length > 0 && (
          <Grid size={{ xs: 12, md: ownedBlessingDetails.length > 0 ? 5 : 12 }}>
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 2,
                height: "100%",
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
                {detectedBuilds.map(build => {
                  const BuildIcon = getBuildIcon(build.key);
                  return (
                    <Chip
                      key={build.key}
                      icon={BuildIcon ? <BuildIcon /> : undefined}
                      label={build.name}
                      size="small"
                      color="secondary"
                      variant="outlined"
                      sx={{ fontWeight: 600 }}
                    />
                  );
                })}
              </Box>
            </Box>
          </Grid>
        )}
      </Grid>

      <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
        可繼續升等，但等級上限保持 Lv.100
      </Typography>
    </Box>
  );
}
