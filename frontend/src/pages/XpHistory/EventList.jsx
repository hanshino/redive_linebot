import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import BreakdownRow from "./BreakdownRow";
import { foldEvents } from "./foldEvents";
import { tierAccentFromFactor } from "./diminishTier";
import { EventChipRow } from "./EventChips";
import { chipsFromEvent } from "./chipsFromEvent";
import { addDaysTpe, todayTpe, tpeDate } from "./dateTpe";

const TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const DETAIL_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function localHHMM(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "--:--" : TIME_FMT.format(d);
}

function localHHMMSS(ts) {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "--:--:--" : DETAIL_TIME_FMT.format(d);
}

function dateHeading(date, today, yesterday) {
  if (date === today) return "今天";
  if (date === yesterday) return "昨天";
  return date.slice(5);
}

function accentFor(folded) {
  return tierAccentFromFactor(folded.events[0].diminish_factor, { degraded: folded.degraded });
}

function effTotalColor(eff, raw) {
  if (eff === 0) return "error.main";
  if (eff < raw / 2) return "warning.main";
  return "text.primary";
}

export default function EventList({ events, showAll, groupLabel, defaultExpanded = "first" }) {
  const folded = useMemo(() => foldEvents(events || []), [events]);
  const [expanded, setExpanded] = useState(() => initialExpanded(folded, defaultExpanded));

  const grouped = useMemo(() => {
    const today = todayTpe();
    const yesterday = addDaysTpe(today, -1);
    const byDate = new Map();
    folded.forEach(f => {
      const date = tpeDate(f.ts) || f.minute.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(f);
    });
    const dates = [...byDate.keys()].sort().reverse();
    return { today, yesterday, byDate, dates };
  }, [folded]);

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

  const { today, yesterday, byDate, dates } = grouped;

  return (
    <Stack gap={2}>
      {dates.map(date => (
        <Stack key={date} gap={1}>
          <Typography
            sx={{
              fontFamily: "ui-monospace, Menlo, monospace",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "text.disabled",
              pl: 0.5,
            }}
          >
            {dateHeading(date, today, yesterday)} · {date}
          </Typography>
          {byDate.get(date).map(f => (
            <FoldedRow
              key={f.key}
              folded={f}
              expanded={expanded.has(f.key)}
              onToggle={() => toggle(f.key)}
              showAll={showAll}
              groupLabel={groupLabel}
            />
          ))}
        </Stack>
      ))}
    </Stack>
  );
}

function initialExpanded(folded, mode) {
  if (mode === "all") return new Set(folded.map(f => f.key));
  if (mode === "first" && folded.length > 0) return new Set([folded[0].key]);
  return new Set();
}

function FoldedRow({ folded, expanded, onToggle, showAll, groupLabel }) {
  const chips = useMemo(() => chipsFromEvent(folded.events[0]), [folded]);
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderRadius: 1.5,
        overflow: "hidden",
        border: 1,
        borderColor: "divider",
        display: "flex",
      }}
    >
      <Box sx={{ width: 4, bgcolor: accentFor(folded), flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          onClick={onToggle}
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
            {localHHMM(folded.ts)}
          </Box>
          <Stack sx={{ flex: 1, minWidth: 0 }} gap={0.5}>
            <Typography
              sx={{
                fontSize: 12,
                color: "text.secondary",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {groupLabel(folded.group_id)}
              {folded.count > 1 && (
                <Box component="span" sx={{ color: "warning.main", fontWeight: 700 }}>
                  {" "}
                  · ×{folded.count}
                </Box>
              )}
            </Typography>
            <EventChipRow chips={chips} />
          </Stack>
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <Typography
              sx={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 11,
                color: "text.secondary",
              }}
            >
              {folded.raw_total > 0 ? `${folded.raw_total} →` : "→"}
            </Typography>
            <Typography
              sx={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 18,
                fontWeight: 700,
                color: effTotalColor(folded.eff_total, folded.raw_total),
                lineHeight: 1,
              }}
            >
              {folded.eff_total}
            </Typography>
          </Box>
          <Box
            sx={{
              color: "text.disabled",
              fontSize: 12,
              transform: expanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s",
            }}
          >
            ›
          </Box>
        </Box>
        {expanded && (
          <Stack gap={1} sx={{ px: 1.5, pb: 1.5 }}>
            {folded.events.map(ev => (
              <Box key={ev.id}>
                {folded.events.length > 1 && (
                  <Typography
                    sx={{
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: 11,
                      color: "text.disabled",
                      mb: 0.5,
                      pl: 0.25,
                    }}
                  >
                    #{ev.id} · {localHHMMSS(ev.ts)}
                  </Typography>
                )}
                <BreakdownRow ev={ev} showAll={showAll} />
              </Box>
            ))}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
