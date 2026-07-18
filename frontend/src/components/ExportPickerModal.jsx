import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildFilteredSections,
  buildInitialSelection,
  countSelection,
  setAllSelection,
  toggleActivitySelection,
  toggleSectionSelection,
} from "../utils/exportSelection";

/**
 * Seleção de conteúdo do PowerPoint: permite marcar/desmarcar por tema (seção)
 * e por tarefa (atividade) antes de gerar o arquivo.
 */
export default function ExportPickerModal({ sections, onCancel, onConfirm }) {
  const [selection, setSelection] = useState(() => buildInitialSelection(sections));
  const [expanded, setExpanded] = useState({});

  const totals = useMemo(() => countSelection(sections, selection), [sections, selection]);

  useEffect(() => {
    function handleEsc(event) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onCancel]);

  function setAll(value) {
    setSelection(setAllSelection(sections, value));
  }

  function toggleSection(name) {
    setSelection((prev) => toggleSectionSelection(prev, name));
  }

  function toggleActivity(name, index) {
    setSelection((prev) => toggleActivitySelection(prev, name, index));
  }

  function handleConfirm() {
    onConfirm(buildFilteredSections(sections, selection));
  }

  return createPortal(
    <div className="activity-modal-backdrop" onClick={onCancel}>
      <div
        className="activity-modal export-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Selecionar conteúdo do PowerPoint"
        onClick={(event) => event.stopPropagation()}
      >
        <h3>Selecionar conteúdo do PowerPoint</h3>
        <small className="shortcut-hint">
          Marque os temas e as tarefas que devem aparecer no relatório · Esc cancela
        </small>

        <div className="export-picker-toolbar">
          <button type="button" className="secondary-button" onClick={() => setAll(true)}>
            Marcar tudo
          </button>
          <button type="button" className="secondary-button" onClick={() => setAll(false)}>
            Desmarcar tudo
          </button>
        </div>

        <div className="export-picker-list">
          {(sections || []).map((section) => {
            const sel = selection[section.name];
            const activities = section.activities || [];
            const checkedCount = sel ? sel.activities.filter(Boolean).length : 0;
            const partial = checkedCount > 0 && checkedCount < activities.length;
            const isOpen = Boolean(expanded[section.name]);

            return (
              <div key={section.name} className="export-picker-section">
                <div className="export-picker-section-head">
                  <label className="export-picker-check">
                    <input
                      type="checkbox"
                      checked={Boolean(sel?.checked)}
                      ref={(el) => {
                        if (el) el.indeterminate = partial;
                      }}
                      onChange={() => toggleSection(section.name)}
                      disabled={!activities.length}
                    />
                    <span className="export-picker-name">{section.name}</span>
                  </label>

                  <div className="export-picker-meta">
                    <span className="export-picker-count">
                      {checkedCount}/{activities.length}
                    </span>
                    {activities.length ? (
                      <button
                        type="button"
                        className="secondary-button export-picker-toggle"
                        onClick={() => setExpanded((prev) => ({ ...prev, [section.name]: !isOpen }))}
                        aria-expanded={isOpen}
                      >
                        {isOpen ? "Ocultar" : "Tarefas"}
                      </button>
                    ) : null}
                  </div>
                </div>

                {isOpen && activities.length ? (
                  <ul className="export-picker-activities">
                    {activities.map((activity, index) => (
                      <li key={activity.id || index}>
                        <label className="export-picker-check">
                          <input
                            type="checkbox"
                            checked={Boolean(sel?.activities[index])}
                            onChange={() => toggleActivity(section.name, index)}
                          />
                          <span>{activity.title || "(sem título)"}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {!activities.length ? (
                  <p className="export-picker-empty">Sem tarefas nesta seção.</p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="export-picker-footer">
          <span className="export-picker-summary">
            {totals.temas} tema(s) · {totals.tarefas} tarefa(s) selecionadas
          </span>
          <div className="composer-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" onClick={handleConfirm} disabled={totals.tarefas === 0}>
              Gerar PowerPoint
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
