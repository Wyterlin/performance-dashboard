/**
 * Conversão entre texto de duração ("3h 20min", "1s 60ms") e suas partes.
 * Mantido fora do componente para poder ser testado isoladamente.
 */

export const DURATION_UNITS = [
  { key: "h", label: "h", max: 999 },
  { key: "min", label: "min", max: 59 },
  { key: "s", label: "s", max: 59 },
  { key: "ms", label: "ms", max: 999 },
];

export function parseDuration(value) {
  const raw = String(value || "").toLowerCase().replace(/\s+/g, "");
  const parts = { h: "", min: "", s: "", ms: "" };
  if (!raw) return parts;

  // A ordem do alternador importa: "ms" antes de "m"/"s" e "min" antes de "m".
  const pattern = /(\d+)(ms|min|h|m|s|d)/g;
  let match = pattern.exec(raw);
  while (match) {
    const amount = match[1];
    const unit = match[2];
    if (unit === "h") parts.h = amount;
    else if (unit === "min" || unit === "m") parts.min = amount;
    else if (unit === "s") parts.s = amount;
    else if (unit === "ms") parts.ms = amount;
    else if (unit === "d") parts.h = String(Number(amount) * 24);
    match = pattern.exec(raw);
  }
  return parts;
}

export function formatDuration(parts) {
  return DURATION_UNITS.map(({ key, label }) => {
    const amount = String(parts?.[key] || "").trim();
    if (!amount || Number(amount) === 0) return "";
    return `${Number(amount)}${label}`;
  })
    .filter(Boolean)
    .join(" ");
}
