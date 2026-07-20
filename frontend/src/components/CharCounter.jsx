/**
 * Contador de caracteres não intrusivo: o usuário escreve naturalmente e só
 * recebe sinal visual quando está perto do limite (amarelo) ou o ultrapassou
 * (vermelho). A barra dá a noção de espaço restante sem exigir leitura.
 */
export default function CharCounter({ value, max, warnAt = 20, hint = "" }) {
  const length = String(value || "").length;
  const remaining = max - length;
  const state = remaining < 0 ? "over" : remaining <= warnAt ? "warn" : "ok";
  const ratio = max > 0 ? Math.min(1, length / max) : 0;

  return (
    <div className={`char-counter char-counter-${state}`}>
      <div className="char-counter-track" aria-hidden="true">
        <div className="char-counter-bar" style={{ width: `${ratio * 100}%` }} />
      </div>
      <small className="char-counter-text" aria-live="polite">
        {state === "over"
          ? `${length} / ${max} caracteres · ${Math.abs(remaining)} a mais que o limite`
          : `${length} / ${max} caracteres`}
        {hint && state !== "over" ? ` · ${hint}` : ""}
      </small>
    </div>
  );
}
