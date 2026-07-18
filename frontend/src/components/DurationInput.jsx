import { humanizeDuration, toClockValue } from "../utils/duration";

/**
 * Campo único de duração no formato HH:MM:SS (input nativo de hora, com
 * segundos habilitados). Valores antigos em texto são convertidos ao abrir.
 */
export default function DurationInput({ label, value, onChange, hint }) {
  const clock = toClockValue(value);

  return (
    <label className="duration-field">
      {label}
      <input
        type="time"
        step="1"
        value={clock}
        onChange={(event) => onChange(event.target.value)}
      />
      <small>{hint || (clock ? `${humanizeDuration(clock)} (hh:mm:ss)` : "hh:mm:ss")}</small>
    </label>
  );
}
