import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TITLE_MAX = 120;
const ACTIVITY_MAX = 120;
const HIGHLIGHT_MAX = 240;

function EmptyState() {
  return <p className="empty-activities">Nenhuma atividade registrada para esta secao.</p>;
}

export default function SectionActivities({
  section,
  sectionIndex,
  onUpsert,
  onDelete,
  onMove,
}) {
  const sectionRef = useRef(null);
  const deleteBackdropDownRef = useRef(false);
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState({ title: "", activity: "", highlight: "", position: 1 });
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [deletingActivity, setDeletingActivity] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const orderedActivities = [...(section.activities || [])].sort(
    (a, b) => Number(a.position || 0) - Number(b.position || 0)
  );

  function updateDraft(field, value, maxLength) {
    setDraft((prev) => ({
      ...prev,
      [field]: String(value || "").slice(0, maxLength),
    }));
  }

  function handleAdd() {
    const added = onUpsert(sectionIndex, draft, editingActivityId);
    if (added) {
      setDraft({ title: "", activity: "", highlight: "", position: 1 });
      setEditingActivityId(null);
      setShowComposer(false);
      setActiveMenuId(null);
    }
  }

  function handleOpenComposer() {
    const nextPosition =
      (section.activities || []).reduce((acc, item) => Math.max(acc, Number(item.position || 0)), 0) + 1;
    setEditingActivityId(null);
    setDraft({ title: "", activity: "", highlight: "", position: nextPosition });
    setShowComposer(true);
  }

  function handleEdit(item) {
    setActiveMenuId(null);
    setEditingActivityId(item.id);
    setDraft({
      title: String(item.title || ""),
      activity: String(item.activity || ""),
      highlight: String(item.highlight || ""),
      position: Number(item.position || 1),
    });
    setShowComposer(true);
  }

  function handleCancel() {
    setDraft({ title: "", activity: "", highlight: "", position: 1 });
    setEditingActivityId(null);
    setShowComposer(false);
  }

  function handleConfirmDelete() {
    if (!deletingActivity) return;
    const deleted = onDelete(sectionIndex, deletingActivity.id);
    if (deleted) {
      setDeletingActivity(null);
      setActiveMenuId(null);
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleCancel();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      handleAdd();
    }
  }

  useEffect(() => {
    if (!activeMenuId) return;

    function handleOutsideMenuClick(event) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(".item-menu")) return;
      setActiveMenuId(null);
    }

    document.addEventListener("mousedown", handleOutsideMenuClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideMenuClick);
    };
  }, [activeMenuId]);

  useEffect(() => {
    function handleEscClose(event) {
      if (event.key !== "Escape") return;
      if (showComposer) {
        handleCancel();
        return;
      }
      if (deletingActivity) {
        setDeletingActivity(null);
        return;
      }
      if (activeMenuId) {
        setActiveMenuId(null);
      }
    }

    document.addEventListener("keydown", handleEscClose);
    return () => {
      document.removeEventListener("keydown", handleEscClose);
    };
  }, [activeMenuId, deletingActivity, showComposer]);

  return (
    <section
      ref={sectionRef}
      className={`manual-section ${activeMenuId ? "manual-section-menu-open" : ""}`}
    >
      <header className="manual-section-header">
        <div>
          <h2>{section.name}</h2>
          <span>{section.activities.length} item(ns)</span>
        </div>
        <button
          type="button"
          className="icon-plus-button"
          onClick={handleOpenComposer}
          aria-label={`Adicionar atividade em ${section.name}`}
        >
          +
        </button>
      </header>

      {section.activities.length ? (
        <ul className="activity-list">
          {orderedActivities.map((item, index) => (
            <li key={item.id} className="activity-item">
              <div className="activity-item-header">
                <h3>{item.title}</h3>
                <div className="activity-item-tools">
                  <div className="item-order-controls" aria-label={`Ordenacao da atividade ${item.title}`}>
                    <button
                      type="button"
                      className="item-order-button"
                      aria-label={`Mover para esquerda e subir prioridade da atividade ${item.title}`}
                      disabled={index === 0}
                      onClick={() => onMove(sectionIndex, item.id, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="item-order-button"
                      aria-label={`Mover para direita e descer prioridade da atividade ${item.title}`}
                      disabled={index === orderedActivities.length - 1}
                      onClick={() => onMove(sectionIndex, item.id, 1)}
                    >
                      →
                    </button>
                  </div>

                  <div className="item-menu">
                  <button
                    type="button"
                    className="item-menu-trigger"
                    aria-label={`Acoes da atividade ${item.title}`}
                    onClick={() =>
                      setActiveMenuId((prev) => (prev === item.id ? null : item.id))
                    }
                  >
                    ⁝
                  </button>
                    {activeMenuId === item.id ? (
                      <div className="item-menu-panel">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={(event) => {
                            event.preventDefault();
                            handleEdit(item);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={(event) => {
                            event.preventDefault();
                            setActiveMenuId(null);
                            setDeletingActivity(item);
                          }}
                        >
                          Apagar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
              <p className="activity-description">{item.activity}</p>
              {item.highlight ? (
                <p className="highlight-chip">Ponto(s) a Destacar: {item.highlight}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}

      {showComposer
        ? createPortal(
            <div className="activity-modal-backdrop">
              <div
                className="activity-modal"
                onClick={(event) => event.stopPropagation()}
                onKeyDown={handleComposerKeyDown}
              >
                <h3>
                  {editingActivityId
                    ? `Editar atividade em ${section.name}`
                    : `Adicionar atividade em ${section.name}`}
                </h3>

                <div className="activity-modal-fields">
                  <label>
                    Titulo
                    <input
                      value={draft.title}
                      maxLength={TITLE_MAX}
                      onChange={(event) => updateDraft("title", event.target.value, TITLE_MAX)}
                      placeholder="Ex.: Correcao de erro"
                    />
                    <small>{draft.title.length}/{TITLE_MAX}</small>
                  </label>

                  <label>
                    Atividade
                    <textarea
                      rows="4"
                      value={draft.activity}
                      maxLength={ACTIVITY_MAX}
                      onChange={(event) =>
                        updateDraft("activity", event.target.value, ACTIVITY_MAX)
                      }
                      placeholder="Descreva o que foi feito"
                    />
                    <small>{draft.activity.length}/{ACTIVITY_MAX}</small>
                  </label>

                  <label>
                    Ponto(s) a Destacar (opcional)
                    <textarea
                      rows="3"
                      value={draft.highlight}
                      maxLength={HIGHLIGHT_MAX}
                      onChange={(event) =>
                        updateDraft("highlight", event.target.value, HIGHLIGHT_MAX)
                      }
                      placeholder="Somente se houver"
                    />
                    <small>{draft.highlight.length}/{HIGHLIGHT_MAX}</small>
                  </label>
                </div>

                <div className="activity-priority-row">
                  <label className="priority-field">
                    Prioridade
                    <input
                      type="number"
                      min="1"
                      value={draft.position}
                      onChange={(event) =>
                        setDraft((prev) => ({ ...prev, position: Number(event.target.value || 1) }))
                      }
                    />
                  </label>
                </div>

                <div className="composer-actions activity-modal-actions">
                  <button type="button" onClick={handleAdd}>
                    Salvar
                  </button>
                  <button type="button" className="secondary-button" onClick={handleCancel}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {deletingActivity
        ? createPortal(
            <div
              className="activity-modal-backdrop"
              onMouseDown={(event) => {
                deleteBackdropDownRef.current = event.target === event.currentTarget;
              }}
              onClick={(event) => {
                const shouldClose = deleteBackdropDownRef.current && event.target === event.currentTarget;
                deleteBackdropDownRef.current = false;
                if (shouldClose) setDeletingActivity(null);
              }}
            >
              <div className="activity-modal delete-modal" onClick={(event) => event.stopPropagation()}>
                <h3>Confirmar exclusao</h3>
                <p className="delete-warning">
                  Esta acao removera permanentemente a atividade "{deletingActivity.title}".
                </p>
                <div className="composer-actions activity-modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setDeletingActivity(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="danger-button" onClick={handleConfirmDelete}>
                    Apagar
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </section>
  );
}
