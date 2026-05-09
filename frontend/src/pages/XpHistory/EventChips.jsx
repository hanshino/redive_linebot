import { Box, Stack } from "@mui/material";

const STYLES = {
  honeymoon: { bg: "#E8F9EF", fg: "#15803D" },
  trial: { bg: "#FFF7E6", fg: "#B45309" },
  blessing: { bg: "#E0F7FA", fg: "#00838F" },
  group: { bg: "#E0F7FA", fg: "#00838F" },
  dim2: { bg: "#FFF7E6", fg: "#B45309" },
  dim3: { bg: "#FDECEC", fg: "#B91C1C", border: "#DC2626" },
  perm: { bg: "#F3E8FF", fg: "#6B21A8" },
};

export function EventChip({ kind, label, value }) {
  const s = STYLES[kind] || STYLES.group;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: "2px",
        borderRadius: 999,
        bgcolor: s.bg,
        color: s.fg,
        border: s.border ? `1px solid ${s.border}` : "none",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {value && (
        <Box
          component="span"
          sx={{
            fontFamily: "ui-monospace, Menlo, monospace",
            fontWeight: 600,
            opacity: 0.85,
          }}
        >
          {value}
        </Box>
      )}
    </Box>
  );
}

export function EventChipRow({ chips }) {
  if (!chips?.length) return null;
  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap" alignItems="center">
      {chips.map((c, i) => (
        <EventChip key={i} {...c} />
      ))}
    </Stack>
  );
}
