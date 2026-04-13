import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const TITLE_MAX = 120;
const ROADMAP_TITLE_MAX = 35;
const ROADMAP_SUBTITLE_MAX = 35;
const ACTIVITY_MAX = 120;
const HIGHLIGHT_MAX = 240;
const PROJECT_TEAM_MAX = 220;
const CYCLE_IMPLANTATION_MAX = 50;
const CYCLE_TIME_MAX = 40;
const ROADMAP_IMPACT_MAX = 180;
const CALLED_MIN = 4;
const CALLED_MAX = 20;
const ENABLE_EXTRA_SHORTCUTS = true;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function EmptyState() {
  return <p className="empty-activities">Nenhuma atividade registrada para esta seção.</p>;
}

export default function SectionActivities({
  section,
  sectionIndex,
  onUpsert,
  onDelete,
  onMove,
  onDuplicate,
  searchTerm,
  roadmapCategoryFilter,
  roadmapDifficultyFilter,
}) {
  const sectionRef = useRef(null);
  const deleteBackdropDownRef = useRef(false);
  const [showComposer, setShowComposer] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    activity: "",
    highlight: "",
    called: "",
    projectTeamInput: "",
    cycleImplantation: "",
    cycleTime: "",
    subtitle: "",
    impact: "",
    difficulty: "medium",
    category: "Processos",
    position: 1,
  });
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [deletingActivity, setDeletingActivity] = useState(null);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const orderedActivities = [...(section.activities || [])].sort(
    (a, b) => Number(a.position || 0) - Number(b.position || 0)
  );
  const isRoadmapSection = normalizeText(section.name).includes("roadmap");
  const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
  const hasCategoryFilter = isRoadmapSection && String(roadmapCategoryFilter || "") !== "all";
  const hasDifficultyFilter = isRoadmapSection && String(roadmapDifficultyFilter || "") !== "all";
  const visibleActivities = normalizedSearch
    ? orderedActivities.filter((item) => {
        const haystack = `${item.title || ""} ${item.activity || ""} ${item.highlight || ""} ${
          item.called || ""
        } ${item.subtitle || ""} ${item.impact || item.benefit || ""} ${item.category || ""}`.toLowerCase();
        const projectTeamText = Array.isArray(item.projectTeam)
          ? item.projectTeam.join(" ").toLowerCase()
          : "";
        const matchesText = haystack.includes(normalizedSearch);
        const matchesTeam = projectTeamText.includes(normalizedSearch);
        const matchesCategory = !hasCategoryFilter || String(item.category || "") === roadmapCategoryFilter;
        const matchesDifficulty =
          !hasDifficultyFilter || String(item.difficulty || "") === roadmapDifficultyFilter;
        return (matchesText || matchesTeam) && matchesCategory && matchesDifficulty;
      })
    : orderedActivities.filter((item) => {
        const matchesCategory = !hasCategoryFilter || String(item.category || "") === roadmapCategoryFilter;
        const matchesDifficulty =
          !hasDifficultyFilter || String(item.difficulty || "") === roadmapDifficultyFilter;
        return matchesCategory && matchesDifficulty;
      });

  const difficultyLabel = {
    low: "Baixa",
    medium: "Média",
    high: "Alta",
  };

  const difficultyClass = {
    low: "difficulty-low",
    medium: "difficulty-medium",
    high: "difficulty-high",
  };

  const calledDigits = String(draft.called || "").replace(/\D+/g, "");
  const calledTooShort = calledDigits.length > 0 && calledDigits.length < CALLED_MIN;
  const calledTooLong = calledDigits.length > CALLED_MAX;
  const calledInvalid = calledTooShort || calledTooLong;

  function updateDraft(field, value, maxLength) {
    if (field === "called") {
      const digits = String(value || "").replace(/\D+/g, "").slice(0, CALLED_MAX + 4);
      setDraft((prev) => ({
        ...prev,
        called: digits,
      }));
      return;
    }

    const effectiveMaxLength =
      isRoadmapSection && field === "title"
        ? ROADMAP_TITLE_MAX
        : isRoadmapSection && field === "subtitle"
          ? ROADMAP_SUBTITLE_MAX
          : isRoadmapSection && field === "impact"
            ? ROADMAP_IMPACT_MAX
          : maxLength;

    if (field === "projectTeamInput") {
      const cleaned = String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10)
        .join(", ");
      setDraft((prev) => ({
        ...prev,
        projectTeamInput: cleaned.slice(0, PROJECT_TEAM_MAX),
      }));
      return;
    }

    setDraft((prev) => ({
      ...prev,
      [field]: String(value || "").slice(0, effectiveMaxLength),
    }));
  }

  function handleAdd() {
    if (calledInvalid) return;
    const projectTeam = String(draft.projectTeamInput || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 10);
    const payload = isRoadmapSection
      ? {
          ...draft,
          projectTeam,
          activity: String(draft.activity || draft.impact || "").trim(),
        }
      : {
          ...draft,
          projectTeam,
        };
    const added = onUpsert(sectionIndex, payload, editingActivityId);
    if (added) {
      setDraft({
        title: "",
        activity: "",
        highlight: "",
        called: "",
        projectTeamInput: "",
        cycleImplantation: "",
        cycleTime: "",
        subtitle: "",
        impact: "",
        difficulty: "medium",
        category: "Processos",
        position: 1,
      });
      setEditingActivityId(null);
      setShowComposer(false);
      setActiveMenuId(null);
    }
  }

  function handleOpenComposer() {
    const nextPosition =
      (section.activities || []).reduce((acc, item) => Math.max(acc, Number(item.position || 0)), 0) + 1;
    setEditingActivityId(null);
    setDraft({
      title: "",
      activity: "",
      highlight: "",
      called: "",
      projectTeamInput: "",
      cycleImplantation: "",
      cycleTime: "",
      subtitle: "",
      impact: "",
      difficulty: "medium",
      category: "Processos",
      position: nextPosition,
    });
    setShowComposer(true);
  }

  function handleEdit(item) {
    setActiveMenuId(null);
    setEditingActivityId(item.id);
    setDraft({
      title: String(item.title || ""),
      activity: String(item.activity || ""),
      highlight: String(item.highlight || ""),
      called: String(item.called || ""),
      projectTeamInput: Array.isArray(item.projectTeam) ? item.projectTeam.join(", ") : "",
      cycleImplantation: String(item.cycleImplantation || ""),
      cycleTime: String(item.cycleTime || ""),
      subtitle: String(item.subtitle || ""),
      impact: String(item.impact || item.benefit || item.activity || ""),
      difficulty: String(item.difficulty || "medium"),
      category: String(item.category || "Processos"),
      position: Number(item.position || 1),
    });
    setShowComposer(true);
  }

  function handleCancel() {
    setDraft({
      title: "",
      activity: "",
      highlight: "",
      called: "",
      projectTeamInput: "",
      cycleImplantation: "",
      cycleTime: "",
      subtitle: "",
      impact: "",
      difficulty: "medium",
      category: "Processos",
      position: 1,
    });
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

    if (
      ENABLE_EXTRA_SHORTCUTS &&
      (event.ctrlKey || event.metaKey) &&
      String(event.key || "").toLowerCase() === "s"
    ) {
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

  useEffect(() => {
    if (!ENABLE_EXTRA_SHORTCUTS) return;

    function handleNewShortcut(event) {
      if (showComposer) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (String(event.key || "").toLowerCase() !== "n") return;
      if (!(event.target instanceof Element)) return;
      if (!sectionRef.current?.contains(event.target)) return;

      event.preventDefault();
      handleOpenComposer();
    }

    document.addEventListener("keydown", handleNewShortcut);
    return () => {
      document.removeEventListener("keydown", handleNewShortcut);
    };
  }, [showComposer, section.activities]);

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
          {visibleActivities.map((item) => {
            const orderedIndex = orderedActivities.findIndex((activity) => activity.id === item.id);
            return (
              <li key={item.id} className="activity-item">
                <div className="activity-item-header">
                  <h3>{item.title}</h3>
                  <div className="activity-item-tools">
                    <div className="item-order-controls" aria-label={`Ordenação da atividade ${item.title}`}>
                      <button
                        type="button"
                        className="item-order-button"
                        aria-label={`Mover para esquerda e subir prioridade da atividade ${item.title}`}
                        disabled={orderedIndex === 0}
                        onClick={() => onMove(sectionIndex, item.id, -1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="item-order-button"
                        aria-label={`Mover para direita e descer prioridade da atividade ${item.title}`}
                        disabled={orderedIndex === orderedActivities.length - 1}
                        onClick={() => onMove(sectionIndex, item.id, 1)}
                      >
                        →
                      </button>
                    </div>

                    <div className="item-menu">
                      <button
                        type="button"
                        className="item-menu-trigger"
                        aria-label={`Ações da atividade ${item.title}`}
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
                          className="secondary-button"
                          onClick={(event) => {
                            event.preventDefault();
                            setActiveMenuId(null);
                            onDuplicate(sectionIndex, item.id);
                          }}
                        >
                          Duplicar
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
                {isRoadmapSection ? (
                  <>
                    <div className="roadmap-meta-row">
                      <span className={`difficulty-chip ${difficultyClass[item.difficulty] || "difficulty-medium"}`}>
                        Dificuldade: {difficultyLabel[item.difficulty] || "Média"}
                      </span>
                      {item.cycleImplantation ? (
                        <span className="category-chip">Ciclo de Implantação: {item.cycleImplantation}</span>
                      ) : null}
                      {item.category ? <span className="category-chip">Categoria: {item.category}</span> : null}
                    </div>
                    {item.subtitle ? <p className="subtitle-chip">Subtítulo: {item.subtitle}</p> : null}
                    {(item.impact || item.benefit) ? <p className="benefit-chip">Impacto: {item.impact || item.benefit}</p> : null}
                  </>
                ) : null}
                {item.called ? <p className="called-chip">Chamado: {item.called}</p> : null}
                {item.cycleTime ? <p className="called-chip">Tempo de Ciclo (Cycle Time): {item.cycleTime}</p> : null}
                <p className="activity-description">{item.activity}</p>
                {Array.isArray(item.projectTeam) && item.projectTeam.length ? (
                  <p className="highlight-chip team-chip">Equipe do Projeto: {item.projectTeam.join(", ")}</p>
                ) : null}
                {item.highlight ? (
                  <p className="highlight-chip">Pontos a Destacar: {item.highlight}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState />
      )}

      {section.activities.length && !visibleActivities.length ? (
        <p className="empty-activities">Nenhuma atividade desta seção corresponde ao filtro atual.</p>
      ) : null}

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
                <small className="shortcut-hint">
                  Ctrl+Enter salvar | Ctrl+S salvar | Esc cancelar
                </small>

                <div className="activity-modal-fields">
                  <label>
                    Título
                    <input
                      value={draft.title}
                      maxLength={isRoadmapSection ? ROADMAP_TITLE_MAX : TITLE_MAX}
                      onChange={(event) => updateDraft("title", event.target.value, TITLE_MAX)}
                      placeholder="Ex.: Correcao de erro"
                    />
                    <small>
                      {draft.title.length}/{isRoadmapSection ? ROADMAP_TITLE_MAX : TITLE_MAX}
                    </small>
                  </label>

                  {isRoadmapSection ? (
                    <>
                      <label>
                        Subtítulo
                        <textarea
                          rows="2"
                          value={draft.subtitle}
                          maxLength={ROADMAP_SUBTITLE_MAX}
                          onChange={(event) => updateDraft("subtitle", event.target.value, ROADMAP_SUBTITLE_MAX)}
                          placeholder="Ex.: Otimização do fluxo de atendimento"
                        />
                        <small>{draft.subtitle.length}/{ROADMAP_SUBTITLE_MAX}</small>
                      </label>

                      <label>
                        Impacto
                        <textarea
                          rows="4"
                          value={draft.impact}
                          maxLength={ROADMAP_IMPACT_MAX}
                          onChange={(event) => updateDraft("impact", event.target.value, ROADMAP_IMPACT_MAX)}
                          placeholder="Ex.: Redução de 20% no tempo de processamento e aumento de previsibilidade"
                        />
                        <small>{draft.impact.length}/{ROADMAP_IMPACT_MAX}</small>
                      </label>

                      <div className="roadmap-input-grid">
                        <label>
                          Ciclo de Implantação
                          <input
                            value={draft.cycleImplantation}
                            maxLength={CYCLE_IMPLANTATION_MAX}
                            onChange={(event) =>
                              updateDraft("cycleImplantation", event.target.value, CYCLE_IMPLANTATION_MAX)
                            }
                            placeholder="Ex.: 45 dias"
                          />
                          <small>{draft.cycleImplantation.length}/{CYCLE_IMPLANTATION_MAX}</small>
                        </label>

                        <label>
                          Categoria
                          <select
                            value={draft.category}
                            onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                          >
                            <option value="Infraestrutura">Infraestrutura</option>
                            <option value="Dados">Dados</option>
                            <option value="Processos">Processos</option>
                          </select>
                        </label>
                      </div>

                      <label>
                        Dificuldade
                        <select
                          value={draft.difficulty}
                          onChange={(event) => setDraft((prev) => ({ ...prev, difficulty: event.target.value }))}
                        >
                          <option value="low">Baixa</option>
                          <option value="medium">Média</option>
                          <option value="high">Alta</option>
                        </select>
                      </label>
                    </>
                  ) : null}

                  {!isRoadmapSection ? (
                    <label>
                      Chamado (opcional, apenas números)
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={draft.called}
                        onChange={(event) => updateDraft("called", event.target.value, CALLED_MAX)}
                        placeholder="Ex.: 123456"
                      />
                      <small>{calledDigits.length}/{CALLED_MAX}</small>
                      {calledInvalid ? (
                        <small className="field-error">
                          O chamado deve ter entre {CALLED_MIN} e {CALLED_MAX} dígitos.
                        </small>
                      ) : null}
                    </label>
                  ) : null}

                  {!isRoadmapSection ? (
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
                  ) : null}

                  <label>
                    Tempo de Ciclo (Cycle Time)
                    <input
                      value={draft.cycleTime}
                      maxLength={CYCLE_TIME_MAX}
                      onChange={(event) => updateDraft("cycleTime", event.target.value, CYCLE_TIME_MAX)}
                      placeholder="Ex.: 3h 20m"
                    />
                    <small>{draft.cycleTime.length}/{CYCLE_TIME_MAX}</small>
                  </label>

                  <label>
                    Equipe do Projeto
                    <input
                      value={draft.projectTeamInput}
                      maxLength={PROJECT_TEAM_MAX}
                      onChange={(event) =>
                        updateDraft("projectTeamInput", event.target.value, PROJECT_TEAM_MAX)
                      }
                      placeholder="Ex.: Ana Souza, Bruno Lima"
                    />
                    <small>{draft.projectTeamInput.length}/{PROJECT_TEAM_MAX}</small>
                  </label>

                  {!isRoadmapSection ? (
                    <label>
                      Pontos a Destacar (opcional)
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
                  ) : null}
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
                  <button type="button" onClick={handleAdd} disabled={calledInvalid}>
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
                <h3>Confirmar exclusão</h3>
                <p className="delete-warning">
                  Esta ação removerá permanentemente a atividade "{deletingActivity.title}".
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
