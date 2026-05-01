import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import BreakdownRow from "./BreakdownRow";
import { foldEvents } from "./foldEvents";
import { tierAccentFromFactor } from "./diminishTier";

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function localHHMM(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "--:--" : TIME_FMT.format(d);
}

function accentFor(folded) {
  return tierAccentFromFactor(folded.events[0].diminish_factor, { degraded: folded.degraded });
}

export default function EventList({ events, showAll, groupLabel }) {
  const folded = useMemo(() => foldEvents(events || []), [events]);
  const [expanded, setExpanded] = useState(new Set());

  const toggle = key =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (folded.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
        沒有資料
      </Typography>
    );
  }

  return (
    <Stack gap={1}>
      {folded.map(f => {
        const isOpen = expanded.has(f.key);
        return (
          <Box
            key={f.key}
            sx={{
              bgcolor: "background.paper",
              borderRadius: 1.5,
              overflow: "hidden",
              border: 1,
              borderColor: "divider",
              display: "flex",
            }}
          >
            <Box sx={{ width: 4, bgcolor: accentFor(f), flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                onClick={() => toggle(f.key)}
                sx={{
                  p: 1.5,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.25,
                }}
              >
                <Box
                  sx={{
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: 13,
                    fontWeight: 700,
                    minWidth: 42,
                  }}
                >
                  {localHHMM(f.ts)}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {groupLabel(f.group_id)}
                    {f.count > 1 && (
                      <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}>
                        {" "}
                        · ×{f.count}
                      </Box>
                    )}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <Typography
                    sx={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 11,
                      color: "text.secondary",
                    }}
                  >
                    {f.raw_total > 0 ? `${f.raw_total} →` : "→"}
                  </Typography>
                  <Typography
                    sx={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 18,
                      fontWeight: 700,
                      color:
                        f.eff_total === 0
                          ? "error.main"
                          : f.eff_total < f.raw_total / 2
                            ? "warning.main"
                            : "text.primary",
                      lineHeight: 1,
                    }}
                  >
                    {f.eff_total}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    color: "text.disabled",
                    fontSize: 12,
                    transform: isOpen ? "rotate(90deg)" : "none",
                    transition: "transform 0.15s",
                  }}
                >
                  ›
                </Box>
              </Box>
              {isOpen && (
                <Stack gap={1} sx={{ px: 1.5, pb: 1.5 }}>
                  {f.events.map(ev => (
                    <BreakdownRow key={ev.id} ev={ev} showAll={showAll} />
                  ))}
                </Stack>
              )}
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}
