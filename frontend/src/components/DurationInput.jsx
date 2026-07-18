import { DURATION_UNITS, formatDuration, parseDuration } from "../utils/duration";

/**
 * Campo de duração estruturado (h / min / s / ms) no lugar de texto livre.
 * Guarda uma string normalizada, ex.: "3h 20min" ou "1s 60ms", e reabre
 * corretamente valores antigos digitados à mão.
 */
export default function DurationInput({ label, value, onChange, units = ["h", "min"], hint }) {
  const parts = parseDuration(value);
  const active = DURATION_UNITS.filter((unit) => units.includes(unit.key));

  function handlePartChange(key, raw) {
    const digits = String(raw || "").replace(/\D+/g, "").slice(0, 3);
    onChange(formatDuration({ ...parts, [key]: digits }));
  }

  return (
    <div className="duration-field">
      <span className="duration-label">{label}</span>
      <div className="duration-inputs">
        {active.map((unit) => (
          <div className="duration-part" key={unit.key}>
            <input
              type="number"
              min="0"
              max={unit.max}
              inputMode="numeric"
              value={parts[unit.key] || ""}
              onChange={(event) => handlePartChange(unit.key, event.target.value)}
              aria-label={`${label} — ${unit.label}`}
              placeholder="0"
            />
            <span className="duration-unit">{unit.label}</span>
          </div>
        ))}
      </div>
      <small>{hint || (value ? `Registrado: ${value}` : "Preencha ao menos um campo")}</small>
    </div>
  );
}
