/**
 * Duração em campo único no formato HH:MM:SS.
 * Aceita e converte valores antigos em texto ("3h 20min", "50s", "1s 60ms").
 * Mantido fora do componente para poder ser testado isoladamente.
 */

function pad(value) {
  return String(Math.max(0, Math.floor(Number(value) || 0))).padStart(2, "0");
}

/** Converte qualquer formato aceito em segundos totais (ou null se vazio). */
export function durationToSeconds(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;

  // Formato de relógio: HH:MM:SS ou MM:SS
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(raw)) {
    const parts = raw.split(":").map((part) => Number(part) || 0);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parts[0] * 60 + parts[1];
  }

  // Formato por unidades: 3h 20min, 50s, 1s 60ms
  const pattern = /(\d+)(ms|min|h|m|s|d)/g;
  let total = 0;
  let matched = false;
  let match = pattern.exec(raw.replace(/\s+/g, ""));
  while (match) {
    matched = true;
    const amount = Number(match[1]) || 0;
    const unit = match[2];
    if (unit === "d") total += amount * 86400;
    else if (unit === "h") total += amount * 3600;
    else if (unit === "min" || unit === "m") total += amount * 60;
    else if (unit === "s") total += amount;
    else if (unit === "ms") total += amount / 1000;
    match = pattern.exec(raw.replace(/\s+/g, ""));
  }
  return matched ? Math.round(total) : null;
}

/** Normaliza para HH:MM:SS, aceitando os formatos antigos. */
export function toClockValue(value) {
  const seconds = durationToSeconds(value);
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Texto curto para exibição/exportação: "3h 20min", "50s". */
export function humanizeDuration(value) {
  const seconds = durationToSeconds(value);
  if (seconds === null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h ? `${h}h` : "", m ? `${m}min` : "", s ? `${s}s` : ""].filter(Boolean).join(" ") || "0s";
}
