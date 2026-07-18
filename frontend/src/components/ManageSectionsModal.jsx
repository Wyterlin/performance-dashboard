import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Gerenciamento dos temas (seções) do relatório: adicionar, renomear,
 * reordenar e remover. As alterações entram no estado das seções e são
 * gravadas pelo autosave normal.
 */
export default function ManageSectionsModal({
  sections,
  onAdd,
  onRename,
  onRemove,
  onMove,
  onClose,
}) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(null);

  useEffect(() => {
    function handleEsc(event) {
      if (event.key !== "Escape") return;
      if (confirmRemove) {
        setConfirmRemove(null);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [confirmRemove, onClose]);

  function handleAdd() {
    const name = newName.trim();
    if (!name) {
      setError("Informe um nome para o tema.");
      return;
    }
    const added = onAdd(name);
    if (!added) {
      setError("Já existe um tema com esse nome.");
      return;
    }
    setNewName("");
    setError("");
  }

  function handleRename(index, value) {
    const name = String(value || "").trim();
    if (!name) return;
    if (name === sections[index]?.name) return;
    const renamed = onRename(index, name);
    setError(renamed ? "" : "Já existe um tema com esse nome.");
  }

  return createPortal(
    <div className="activity-modal-backdrop" onClick={onClose}>
      <div
        className="activity-modal manage-sections"
        role="dialog"
        aria-modal="true"
        aria-label="Gerenciar seções"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Gerenciar Seções</h3>
        <small className="shortcut-hint">
          Adicione, renomeie, reordene ou remova os temas do relatório · Esc fecha
        </small>

        <div className="manage-sections-list">
          {sections.length ? (
            sections.map((section, index) => (
              <div key={`${section.name}-${index}`} className="manage-sections-row">
                <input
                  defaultValue={section.name}
                  aria-label={`Nome do tema ${section.name}`}
                  onBlur={(event) => handleRename(index, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <span className="manage-sections-count">
                  {(section.activities || []).length} item(ns)
                </span>
                <button
                  type="button"
                  className="secondary-button manage-sections-icon"
                  onClick={() => onMove(index, -1)}
                  disabled={index === 0}
                  aria-label={`Mover ${section.name} para cima`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="secondary-button manage-sections-icon"
                  onClick={() => onMove(index, 1)}
                  disabled={index === sections.length - 1}
                  aria-label={`Mover ${section.name} para baixo`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger-button manage-sections-icon"
                  onClick={() => setConfirmRemove({ index, name: section.name })}
                  aria-label={`Remover ${section.name}`}
                >
                  ✕
                </button>
              </div>
            ))
          ) : (
            <p className="empty-activities">Nenhum tema cadastrado ainda.</p>
          )}
        </div>

        <div className="manage-sections-add">
          <input
            value={newName}
            maxLength={80}
            placeholder="Nome do novo tema (ex.: Infraestrutura Cloud)"
            onChange={(event) => {
              setNewName(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
          <button type="button" onClick={handleAdd}>
            + Adicionar
          </button>
        </div>

        {error ? <p className="field-error">{error}</p> : null}

        <div className="composer-actions activity-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Concluído
          </button>
        </div>

        {confirmRemove ? (
          <div
            className="activity-modal-backdrop"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmRemove(null);
            }}
          >
            <div
              className="activity-modal delete-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <h3>Remover tema</h3>
              <p className="delete-warning">
                Isso remove o tema "{confirmRemove.name}" e todas as suas atividades do relatório.
              </p>
              <div className="composer-actions activity-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setConfirmRemove(null)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    onRemove(confirmRemove.index);
                    setConfirmRemove(null);
                  }}
                >
                  Remover
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
