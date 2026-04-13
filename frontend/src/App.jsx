import { useEffect, useRef, useState } from "react";
import SectionActivities from "./components/SectionActivities";
import TicketSummaryCard from "./components/TicketSummaryCard";
import { useWeeklyReport } from "./hooks/useWeeklyReport";

const ONBOARDING_STORAGE_KEY = "performance-dashboard:onboarding-seen";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function App() {
  const exportMenuRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState("all");
  const [roadmapSearchQuery, setRoadmapSearchQuery] = useState("");
  const [roadmapCategoryFilter, setRoadmapCategoryFilter] = useState("all");
  const [roadmapDifficultyFilter, setRoadmapDifficultyFilter] = useState("all");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sections,
    ticketSummary,
    ticketLoading,
    ticketError,
    loadPeriodData,
    loadingReport,
    autoSaveState,
    lastAutoSavedAt,
    theme,
    toggleTheme,
    dataQuality,
    activityHistory,
    upsertActivity,
    deleteActivity,
    moveActivity,
    duplicateActivity,
    isRangeInvalid,
  } = useWeeklyReport();

  const sectionKpis = sections
    .map((section) => ({
      name: section.name,
      total: section.activities.length,
    }))
    .filter((section) => section.total > 0);
  const manualKpisTotal = sectionKpis.reduce((acc, kpi) => acc + kpi.total, 0);
  const operationalTotal = Number(ticketSummary?.total || 0);
  const repactTotal = Math.max(Number(ticketSummary?.totalCombined || 0) - operationalTotal, 0);
  const highlightedKpiTotal = Math.max(operationalTotal + manualKpisTotal, 0);
  const sectionsWithIndex = sections.map((section, index) => ({ section, index }));
  const roadmapEntry = sectionsWithIndex.find(({ section }) => normalizeText(section.name).includes("roadmap"));
  const nonRoadmapEntries = sectionsWithIndex.filter(
    ({ section }) => !normalizeText(section.name).includes("roadmap")
  );
  const filteredNonRoadmapEntries = nonRoadmapEntries.filter(({ section }) =>
    selectedSectionFilter === "all" ? true : section.name === selectedSectionFilter
  );

  const autoSaveLabel =
    autoSaveState === "saving"
      ? "Salvando automaticamente..."
      : autoSaveState === "saved"
        ? `Salvo automaticamente${
            lastAutoSavedAt ? ` às ${new Date(lastAutoSavedAt).toLocaleTimeString("pt-BR")}` : ""
          }`
        : autoSaveState === "error"
          ? "Falha no autosave (tentando novamente)"
          : "Autosave ativo";

  useEffect(() => {
    function closeExportMenuOnOutsideClick(event) {
      if (!exportMenuRef.current?.open) return;
      if (event.target instanceof Element && exportMenuRef.current.contains(event.target)) return;
      exportMenuRef.current.removeAttribute("open");
    }

    function closeExportMenuOnEscape(event) {
      if (event.key !== "Escape") return;
      if (!exportMenuRef.current?.open) return;
      exportMenuRef.current.removeAttribute("open");
    }

    document.addEventListener("mousedown", closeExportMenuOnOutsideClick);
    document.addEventListener("keydown", closeExportMenuOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeExportMenuOnOutsideClick);
      document.removeEventListener("keydown", closeExportMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    try {
      const alreadySeen = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
      if (!alreadySeen) setShowOnboarding(true);
    } catch {
      setShowOnboarding(true);
    }
  }, []);

  function handleCloseOnboarding() {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
    } catch {
      // Ignore browser storage failures.
    }
    setShowOnboarding(false);
  }

  async function handleExportPdf() {
    const { exportDashboardPdf } = await import("./services/exportService");
    await exportDashboardPdf({
      startDate,
      endDate,
      ticketSummary,
      sections,
    });
  }

  async function handleExportPptx() {
    const { exportDashboardPptx } = await import("./services/exportService");
    await exportDashboardPptx({
      startDate,
      endDate,
      ticketSummary,
      sections,
    });
  }

  function handleOpenHistory() {
    exportMenuRef.current?.removeAttribute("open");
    setShowHistoryModal(true);
  }

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Performance Dashboard</p>
          <h1>Apresentacao de Atividades</h1>
          <p>
            Central de inteligência operacional dedicada ao rastreamento de atividades e métricas de desempenho, com sincronização nativa de dados de suporte.
          </p>
        </div>

        <div className="hero-controls">
          <div className="hero-controls-top">
            <button
              type="button"
              className="secondary-button theme-toggle"
              onClick={toggleTheme}
              aria-label="Alternar tema claro e escuro"
            >
              {theme === "dark" ? "Tema claro" : "Tema escuro"}
            </button>
            <details ref={exportMenuRef} className="export-menu">
              <summary title="Exportacoes" aria-label="Exportacoes">
                ⁝
              </summary>
              <div className="export-menu-panel">
                <button type="button" className="secondary-button" onClick={handleExportPdf}>
                  Exportar PDF
                </button>
                <button type="button" className="secondary-button" onClick={handleExportPptx}>
                  Exportar PowerPoint
                </button>
                <button type="button" className="secondary-button" onClick={handleOpenHistory}>
                  Log de Modificações
                </button>
              </div>
            </details>
          </div>

          <div className="date-range-controls date-range-centered">
            <label>
              Data inicial
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              Data final
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>

          {isRangeInvalid ? (
            <p className="alert-error">Periodo invalido: a data inicial deve ser menor ou igual a final.</p>
          ) : null}

          <div className="search-row-centered">
            <button
              type="button"
              onClick={loadPeriodData}
              disabled={ticketLoading || loadingReport || isRangeInvalid}
            >
              {ticketLoading || loadingReport ? "Buscando..." : "Buscar Periodo"}
            </button>
          </div>

          <p className={`autosave-pill autosave-${autoSaveState}`}>{autoSaveLabel}</p>
        </div>
      </section>

      <section className="kpi-strip" aria-label="Indicadores principais">
        <article className="kpi-item kpi-item-highlight">
          <span>Indicador Consolidado de Performance</span>
          <strong>{highlightedKpiTotal}</strong>
        </article>

        <article className="kpi-item">
          <span>Volume Operacional</span>
          <strong>{operationalTotal}</strong>
        </article>

        <article className="kpi-item">
          <span>Total de Chamados com Repactuacao de Prazos</span>
          <strong>{repactTotal}</strong>
        </article>

        <article className="kpi-item kpi-item-manual">
          <span className="kpi-manual-label">Atividades sem chamado</span>
          <span className="kpi-manual-section">Pendentes de vinculação</span>
          <strong>{dataQuality.withoutCalled}</strong>
        </article>

        {sectionKpis.map((kpi) => (
          <article key={kpi.name} className="kpi-item kpi-item-manual">
            <span className="kpi-manual-label">Total de Atividades</span>
            <span className="kpi-manual-section">{kpi.name}</span>
            <strong>{kpi.total}</strong>
          </article>
        ))}
      </section>

      <section className="grid-layout">
        <TicketSummaryCard
          summary={ticketSummary}
          loading={ticketLoading}
          error={ticketError}
          onRefresh={loadPeriodData}
        />
      </section>

      <section className="search-filter-section">
        <div className="search-filter-block">
          <label className="search-filter-field">
            Filtrar Atividades
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar por título, atividade, chamado ou pontos a destacar"
            />
          </label>

          <label className="search-filter-field roadmap-category-field">
            Filtrar Seção
            <select
              value={selectedSectionFilter}
              onChange={(event) => setSelectedSectionFilter(event.target.value)}
            >
              <option value="all">Todas as seções</option>
              {nonRoadmapEntries.map(({ section }) => (
                <option key={section.name} value={section.name}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="sections-layout">
        {filteredNonRoadmapEntries.map(({ section, index }) => (
          <SectionActivities
            key={section.name}
            section={section}
            sectionIndex={index}
            onUpsert={upsertActivity}
            onDelete={deleteActivity}
            onMove={moveActivity}
            onDuplicate={duplicateActivity}
            searchTerm={searchQuery}
            roadmapCategoryFilter="all"
            roadmapDifficultyFilter="all"
          />
        ))}

        {roadmapEntry ? (
          <section className="search-filter-section search-filter-section-roadmap">
            <div className="search-filter-block search-filter-block-roadmap">
              <label className="search-filter-field">
                Filtrar Roadmap
                <input
                  type="search"
                  value={roadmapSearchQuery}
                  onChange={(event) => setRoadmapSearchQuery(event.target.value)}
                  placeholder="Buscar por título, subtítulo, impacto ou categoria"
                />
              </label>

              <label className="search-filter-field roadmap-category-field">
                Filtrar Categoria
                <select
                  value={roadmapCategoryFilter}
                  onChange={(event) => setRoadmapCategoryFilter(event.target.value)}
                >
                  <option value="all">Todas</option>
                  <option value="Infraestrutura">Infraestrutura</option>
                  <option value="Dados">Dados</option>
                  <option value="Processos">Processos</option>
                </select>
              </label>

              <label className="search-filter-field roadmap-difficulty-field">
                Filtrar Dificuldade
                <select
                  value={roadmapDifficultyFilter}
                  onChange={(event) => setRoadmapDifficultyFilter(event.target.value)}
                >
                  <option value="all">Todas</option>
                  <option value="low">Baixa</option>
                  <option value="medium">Média</option>
                  <option value="high">Alta</option>
                </select>
              </label>
            </div>
          </section>
        ) : null}

        {roadmapEntry ? (
          <SectionActivities
            key={roadmapEntry.section.name}
            section={roadmapEntry.section}
            sectionIndex={roadmapEntry.index}
            onUpsert={upsertActivity}
            onDelete={deleteActivity}
            onMove={moveActivity}
            onDuplicate={duplicateActivity}
            searchTerm={roadmapSearchQuery}
            roadmapCategoryFilter={roadmapCategoryFilter}
            roadmapDifficultyFilter={roadmapDifficultyFilter}
          />
        ) : null}
      </section>

      <footer className="site-footer" aria-label="Rodapé do site">
        <div className="site-footer-grid">
          <section className="footer-about">
            <h3>{"</> ChristianW$"}</h3>
            <p>Conectando código, café e criatividade.</p>
          </section>

          <section className="footer-column">
            <h4>Recursos</h4>
            <ul>
              <li>
                <a
                  href="https://github.com/Wyterlin/my-website?tab=readme-ov-file#my-website"
                  target="_blank"
                  rel="noreferrer"
                >
                  Documentação
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Wyterlin?tab=repositories"
                  target="_blank"
                  rel="noreferrer"
                >
                  Repositórios
                </a>
              </li>
              <li>
                <a href="https://dev.to/silveira" target="_blank" rel="noreferrer">
                  Blog Dev
                </a>
              </li>
            </ul>
          </section>

          <section className="footer-column">
            <h4>Contato</h4>
            <ul>
              <li>
                <a
                  href="https://www.linkedin.com/in/christian-wyterlin-silveira"
                  target="_blank"
                  rel="noreferrer"
                >
                  Linkedin
                </a>
              </li>
              <li>
                <a href="https://github.com/Wyterlin" target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </li>
            </ul>
          </section>
        </div>

        <p className="footer-bottom">ChristianW$ - Todos os direitos reservados.</p>
      </footer>

      {showOnboarding ? (
        <section className="onboarding-overlay" role="dialog" aria-modal="true">
          <article className="onboarding-card">
            <h2>Bem-vindo ao Performance Dashboard</h2>
            <p>Atalhos úteis: Ctrl+Enter/Ctrl+S para salvar, Esc para fechar, Ctrl+N para nova atividade.</p>
            <p>Use o tema claro/escuro no topo e exporte em PDF ou PowerPoint pelo menu.</p>
            <button type="button" onClick={handleCloseOnboarding}>Entendi</button>
          </article>
        </section>
      ) : null}

      {showHistoryModal ? (
        <section className="history-overlay" role="dialog" aria-modal="true" aria-label="Histórico de atividades">
          <article className="history-card">
            <h2>Histórico Recente de Atividades</h2>
            {activityHistory.length ? (
              <ul className="history-list">
                {activityHistory.slice(0, 25).map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.section}</strong>
                    <span>
                      {entry.type} - {entry.title} ({new Date(entry.timestamp).toLocaleString("pt-BR")})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-activities">Ainda não há movimentações registradas.</p>
            )}
            <div className="composer-actions">
              <button type="button" className="secondary-button" onClick={() => setShowHistoryModal(false)}>
                Fechar
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </main>
  );
}
