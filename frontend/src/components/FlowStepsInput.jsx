/**
 * Fluxo Atendido: lista de etapas encadeadas. A seta entre elas é fixa
 * (não é digitada) e um campo vazio aparece sempre ao final, de modo que
 * uma nova etapa surge conforme a anterior é preenchida.
 */
export default function FlowStepsInput({ steps, onChange, maxSteps = 6, maxLength = 40 }) {
  // Sempre exibe um campo extra vazio no fim (até o limite).
  const filled = (steps || []).filter((step) => String(step || "").trim());
  const visible = filled.length < maxSteps ? [...filled, ""] : filled;

  function handleStepChange(index, value) {
    const next = [...visible];
    next[index] = String(value || "").slice(0, maxLength);
    onChange(next.filter((step, i) => String(step || "").trim() || i < next.length - 1));
  }

  function handleRemove(index) {
    onChange(visible.filter((_, i) => i !== index).filter((step) => String(step || "").trim()));
  }

  return (
    <div className="flow-steps">
      <span className="flow-steps-label">Fluxo Atendido (opcional)</span>
      <div className="flow-steps-row">
        {visible.map((step, index) => (
          <div className="flow-step" key={index}>
            {index > 0 ? (
              <span className="flow-step-arrow" aria-hidden="true">
                →
              </span>
            ) : null}
            <div className="flow-step-field">
              <input
                value={step}
                maxLength={maxLength}
                onChange={(event) => handleStepChange(index, event.target.value)}
                placeholder={index === 0 ? "Ex.: Entrega" : "Próxima etapa"}
                aria-label={`Etapa ${index + 1} do fluxo`}
              />
              {String(step || "").trim() ? (
                <button
                  type="button"
                  className="flow-step-remove"
                  onClick={() => handleRemove(index)}
                  aria-label={`Remover etapa ${index + 1}`}
                  title="Remover etapa"
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <small>
        {filled.length}/{maxSteps} etapas · a seta entre elas é automática
      </small>
    </div>
  );
}
