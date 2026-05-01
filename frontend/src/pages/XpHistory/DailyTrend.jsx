import { useState } from "react";
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

const COLORS = {
  amber: "#FBBF24",
  amberDeep: "#F59E0B",
  divider: "#E5E7EB",
  muted: "#94A3B8",
  loss: "rgba(148,163,184,0.45)",
  text: "#3A2800",
};

export default function DailyTrend({ days, range, onRangeChange }) {
  const W = 320;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 12;
  const PAD_B = 56;
  const H = 240;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const sliced = (days || []).slice(-range);
  const maxRaw = Math.max(...sliced.map(d => d.raw_exp || 0), 100);
  const barW = sliced.length > 0 ? innerW / sliced.length : 0;
  const gap = Math.min(2, barW * 0.15);

  const [picked, setPicked] = useState(null);

  return (
    <Stack gap={1.5}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range}
        onChange={(_, v) => v && onRangeChange(v)}
        fullWidth
      >
        {[7, 30, 90, 365].map(r => (
          <ToggleButton key={r} value={r} sx={{ fontFamily: "ui-monospace, Menlo, monospace" }}>
            {r === 365 ? "1y" : `${r}d`}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Box
        sx={{
          bgcolor: "background.paper",
          borderRadius: 1.5,
          border: 1,
          borderColor: "divider",
          p: 1.5,
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1 }}>
          <Typography sx={{ fontWeight: 700, color: COLORS.text }}>raw vs effective</Typography>
          <Typography
            variant="caption"
            sx={{ fontFamily: "ui-monospace, Menlo, monospace", color: COLORS.muted }}
          >
            最近 {range === 365 ? "一年" : `${range} 天`}
          </Typography>
        </Stack>

        <Box
          component="svg"
          viewBox={`0 0 ${W} ${H}`}
          sx={{ width: "100%", display: "block", touchAction: "manipulation" }}
          onClick={e => {
            // click on empty area deselects
            if (e.target.tagName === "svg") setPicked(null);
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map(p => (
            <line
              key={p}
              x1={PAD_L}
              x2={W - PAD_R}
              y1={PAD_T + innerH * (1 - p)}
              y2={PAD_T + innerH * (1 - p)}
              stroke={COLORS.divider}
              strokeWidth="1"
              strokeDasharray={p === 0 ? "" : "2 3"}
            />
          ))}
          {[0, 0.5, 1].map(p => (
            <text
              key={p}
              x={PAD_L - 4}
              y={PAD_T + innerH * (1 - p) + 3}
              textAnchor="end"
              fontSize="9"
              fill={COLORS.muted}
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {Math.round(maxRaw * p)}
            </text>
          ))}

          {sliced.map((d, i) => {
            const x = PAD_L + i * barW + gap / 2;
            const w = Math.max(1, barW - gap);
            const effH = ((d.effective_exp || 0) / maxRaw) * innerH;
            const lossH =
              (Math.max(0, (d.raw_exp || 0) - (d.effective_exp || 0)) / maxRaw) * innerH;
            const yLoss = PAD_T + innerH - effH - lossH;
            const yEff = PAD_T + innerH - effH;
            const isPicked = picked && picked.date === d.date;
            return (
              <g
                key={d.date}
                onClick={e => {
                  e.stopPropagation();
                  setPicked(prev => (prev?.date === d.date ? null : d));
                }}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={yLoss} width={w} height={lossH} fill={COLORS.loss} />
                <rect
                  x={x}
                  y={yEff}
                  width={w}
                  height={effH}
                  fill={isPicked ? COLORS.amberDeep : COLORS.amber}
                />
                {d.honeymoon_active && (
                  <text
                    x={x + w / 2}
                    y={PAD_T + innerH + 12}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#15803D"
                  >
                    🌱
                  </text>
                )}
                {d.trial_id && (
                  <text
                    x={x + w / 2}
                    y={PAD_T + innerH + (d.honeymoon_active ? 24 : 12)}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#B45309"
                  >
                    ⚔★{d.trial_star ?? ""}
                  </text>
                )}
                {i % Math.max(1, Math.floor(sliced.length / 6)) === 0 && (
                  <text
                    x={x + w / 2}
                    y={
                      PAD_T +
                      innerH +
                      (d.honeymoon_active && d.trial_id
                        ? 38
                        : d.honeymoon_active || d.trial_id
                          ? 26
                          : 14)
                    }
                    textAnchor="middle"
                    fontSize="9"
                    fill={COLORS.muted}
                    fontFamily="ui-monospace, Menlo, monospace"
                  >
                    {d.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}

          {picked &&
            (() => {
              const i = sliced.findIndex(d => d.date === picked.date);
              if (i < 0) return null;
              const x = PAD_L + i * barW + barW / 2;
              return (
                <line
                  x1={x}
                  x2={x}
                  y1={PAD_T}
                  y2={PAD_T + innerH}
                  stroke={COLORS.text}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.35"
                />
              );
            })()}
        </Box>

        <Box
          sx={{
            mt: 1,
            p: "6px 8px",
            bgcolor: "#F8FAFB",
            borderRadius: 0.75,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11,
            color: "text.secondary",
            minHeight: 40,
          }}
        >
          {picked ? (
            <>
              <Box sx={{ color: COLORS.text, fontWeight: 700 }}>{picked.date}</Box>
              <Box>
                raw{" "}
                <Box component="span" sx={{ color: COLORS.muted }}>
                  {picked.raw_exp}
                </Box>{" "}
                · eff{" "}
                <Box component="span" sx={{ color: COLORS.amberDeep, fontWeight: 700 }}>
                  {picked.effective_exp}
                </Box>{" "}
                · 訊息 {picked.msg_count}
              </Box>
            </>
          ) : (
            <Box sx={{ color: COLORS.muted }}>點選長條看單日數字</Box>
          )}
        </Box>

        <Stack
          direction="row"
          gap={1.5}
          sx={{
            mt: 1,
            fontSize: 10,
            color: "text.secondary",
            fontFamily: "ui-monospace, Menlo, monospace",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: COLORS.amber, borderRadius: 0.25 }} />
            effective
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, bgcolor: COLORS.loss, borderRadius: 0.25 }} />
            loss
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>🌱 蜜月</Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>⚔★ 試煉</Box>
        </Stack>
      </Box>
    </Stack>
  );
}
