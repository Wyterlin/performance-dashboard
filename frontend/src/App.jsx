import { useEffect, useRef, useState } from "react";
import SectionActivities from "./components/SectionActivities";
import TicketSummaryCard from "./components/TicketSummaryCard";
import { useWeeklyReport } from "./hooks/useWeeklyReport";

const ONBOARDING_STORAGE_KEY = "performance-dashboard:onboarding-seen";
const SIDEBAR_STORAGE_KEY = "performance-dashboard:sidebar-hidden";

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function formatDuration(milliseconds) {
  if (milliseconds == null || Number.isNaN(Number(milliseconds))) return "—";
  const totalMinutes = Math.round(Number(milliseconds) / 60000);
  if (totalMinutes < 1) return "menos de 1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function getInitialSidebarHidden() {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    // Ignore browser storage failures.
  }
  // Sem preferência salva: começa recolhida em telas pequenas.
  try {
    return window.matchMedia("(max-width: 860px)").matches;
  } catch {
    return false;
  }
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
  const [sidebarHidden, setSidebarHidden] = useState(getInitialSidebarHidden);
  const [activeNav, setActiveNav] = useState("sec-overview");
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
  const renegotiatedTotal = Math.max(
    Number(ticketSummary?.renegotiated ?? Number(ticketSummary?.totalCombined || 0) - operationalTotal),
    0
  );
  const highlightedKpiTotal = Math.max(operationalTotal + manualKpisTotal, 0);
  const ticketMetrics = ticketSummary?.metrics || {};
  const sectionsWithIndex = sections.map((section, index) => ({ section, index }));
  const roadmapEntry = sectionsWithIndex.find(({ section }) => normalizeText(section.name).includes("roadmap"));
  const nonRoadmapEntries = sectionsWithIndex.filter(
    ({ section }) => !normalizeText(section.name).includes("roadmap")
  );
  const filteredNonRoadmapEntries = nonRoadmapEntries.filter(({ section }) =>
    selectedSectionFilter === "all" ? true : section.name === selectedSectionFilter
  );

  const navItems = [
    { id: "sec-overview", icon: "◈", label: "Visão Geral" },
    { id: "sec-indicators", icon: "▦", label: "Indicadores" },
    { id: "sec-tickets", icon: "▤", label: "Chamados SULTS" },
    { id: "sec-activities", icon: "◇", label: "Atividades" },
    ...(roadmapEntry ? [{ id: "sec-roadmap", icon: "✦", label: "Roadmap" }] : []),
  ];
  const navKey = navItems.map((item) => item.id).join("|");

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

  function persistSidebarHidden(hidden) {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, hidden ? "1" : "0");
    } catch {
      // Ignore browser storage failures.
    }
  }

  function hideSidebar() {
    setSidebarHidden(true);
    persistSidebarHidden(true);
  }

  function showSidebar() {
    setSidebarHidden(false);
    persistSidebarHidden(false);
  }

  function navigate(id) {
    setActiveNav(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      if (window.matchMedia("(max-width: 860px)").matches) hideSidebar();
    } catch {
      // Ignore matchMedia failures.
    }
  }

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

  // Realça no menu lateral a seção visível durante a rolagem.
  useEffect(() => {
    const elements = navKey
      .split("|")
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!elements.length || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveNav(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [navKey]);

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
    <div className={`app-layout ${sidebarHidden ? "is-collapsed" : ""}`}>
      <div
        className="sidebar-backdrop"
        onClick={hideSidebar}
        aria-hidden="true"
      />

      <aside className="sidebar" aria-label="Menu de navegação">
        <div className="sidebar-brand">
          <span className="sidebar-brand-title">Performance</span>
          <span className="sidebar-brand-sub">DASHBOARD</span>
          <button
            type="button"
            className="sidebar-hide"
            onClick={hideSidebar}
            aria-label="Esconder menu lateral"
            title="Esconder menu lateral"
          >
            «
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Seções do dashboard">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-item ${activeNav === item.id ? "is-active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-foot-title">
            {autoSaveState === "saving" ? "Salvando..." : "Autosave ativo"}
          </div>
          <div className={`sidebar-foot-status autosave-${autoSaveState}`}>
            <span className="sidebar-foot-dot" aria-hidden="true" />
            <span>{autoSaveLabel}</span>
          </div>
        </div>
      </aside>

      <button
        type="button"
        className="sidebar-reveal"
        onClick={showSidebar}
        aria-label="Mostrar menu lateral"
      >
        ☰ Menu
      </button>

      <div className="main-area">
        <main className="page-shell">
          <header id="sec-overview" className="hero-panel">
            <div className="hero-heading">
              <p className="eyebrow">Relatório Semanal</p>
              <h1>Apresentação de Atividades</h1>
              <p className="hero-sub">
                Central de inteligência operacional · sincronização nativa com SULTS
              </p>
            </div>

            <div className="hero-actions">
              <button
                type="button"
                className="secondary-button theme-toggle"
                onClick={toggleTheme}
                aria-label="Alternar tema claro e escuro"
              >
                {theme === "dark" ? "☀ Tema claro" : "☾ Tema escuro"}
              </button>
              <details ref={exportMenuRef} className="export-menu">
                <summary className="export-summary" title="Exportações" aria-label="Exportações">
                  Exportar ▾
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
          </header>

          <section className="period-panel" aria-label="Período do relatório">
            <label className="period-field">
              Data inicial
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className="period-field">
              Data final
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <button
              type="button"
              className="period-search"
              onClick={loadPeriodData}
              disabled={ticketLoading || loadingReport || isRangeInvalid}
            >
              {ticketLoading || loadingReport ? "Buscando..." : "Buscar Período"}
            </button>
          </section>

          {isRangeInvalid ? (
            <p className="alert-error">Período inválido: a data inicial deve ser menor ou igual à final.</p>
          ) : null}

          <section id="sec-indicators" className="kpi-strip" aria-label="Indicadores principais">
            <article className="kpi-item kpi-item-highlight">
              <span>Indicador Consolidado</span>
              <strong>{highlightedKpiTotal}</strong>
              <span className="kpi-sub">chamados + atividades no período</span>
            </article>

            <article className="kpi-item">
              <span>Volume Operacional</span>
              <strong>{operationalTotal}</strong>
              <i className="kpi-accent kpi-accent-blue" aria-hidden="true" />
            </article>

            <article className="kpi-item">
              <span>Prazos Renegociados</span>
              <strong>{renegotiatedTotal}</strong>
              <i className="kpi-accent kpi-accent-gold" aria-hidden="true" />
            </article>

            <article className="kpi-item">
              <span>Atividades sem chamado</span>
              <strong>{dataQuality.withoutCalled}</strong>
              <i className="kpi-accent kpi-accent-blue" aria-hidden="true" />
            </article>
          </section>

          {sectionKpis.length ? (
            <section className="section-kpi-strip" aria-label="Totais por seção">
              {sectionKpis.map((kpi) => (
                <article key={kpi.name} className="section-kpi">
                  <span>{kpi.name}</span>
                  <strong>{kpi.total}</strong>
                </article>
              ))}
            </section>
          ) : null}

          <section id="sec-tickets" className="grid-layout">
            <TicketSummaryCard
              summary={ticketSummary}
              loading={ticketLoading}
              error={ticketError}
              onRefresh={loadPeriodData}
            />
          </section>

          <section className="metrics-strip" aria-label="Indicadores de atendimento">
            <article className="metric-card">
              <span>Tempo de 1ª Resposta</span>
              <strong>{formatDuration(ticketMetrics.firstResponseMs)}</strong>
              <span className="metric-sub">média · {Number(ticketMetrics.firstResponseCount || 0)} chamados</span>
            </article>

            <article className="metric-card">
              <span>Tempo de Resolução</span>
              <strong>{formatDuration(ticketMetrics.resolutionMs)}</strong>
              <span className="metric-sub">média · {Number(ticketMetrics.resolutionCount || 0)} resolvidos</span>
            </article>

            <article className="metric-card">
              <span>Cumprimento de SLA</span>
              <strong>{ticketMetrics.slaPct == null ? "—" : `${ticketMetrics.slaPct}%`}</strong>
              <span className="metric-sub">
                {Number(ticketMetrics.slaWithin || 0)}/{Number(ticketMetrics.slaTotal || 0)} no prazo
              </span>
            </article>

            <article className="metric-card">
              <span>Satisfação (CSAT)</span>
              <strong>{ticketMetrics.csatAvg == null ? "—" : `${Number(ticketMetrics.csatAvg).toFixed(1)}/5`}</strong>
              <span className="metric-sub">{Number(ticketMetrics.csatCount || 0)} avaliações</span>
            </article>

            <article className="metric-card">
              <span>Taxa de Resolução</span>
              <strong>{ticketMetrics.resolutionRatePct == null ? "—" : `${ticketMetrics.resolutionRatePct}%`}</strong>
              <span className="metric-sub">
                {Number(ticketMetrics.closedInPeriod || 0)} fechados · {Number(ticketMetrics.openedInPeriod || 0)} abertos
              </span>
            </article>
          </section>

          <section id="sec-activities" className="search-filter-section">
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
          </section>

          {roadmapEntry ? (
            <>
              <div id="sec-roadmap" className="roadmap-divider">
                <h2>{roadmapEntry.section.name}</h2>
              </div>

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

              <section className="sections-layout">
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
              </section>
            </>
          ) : null}

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
        </main>
      </div>

      {showOnboarding ? (
        <section className="onboarding-overlay" role="dialog" aria-modal="true">
          <article className="onboarding-card">
            <h2>Bem-vindo ao Performance Dashboard</h2>
            <p>Atalhos úteis: Ctrl+Enter/Ctrl+S para salvar, Esc para fechar, Ctrl+N para nova atividade.</p>
            <p>Use o menu lateral para navegar, alterne o tema no topo e exporte em PDF ou PowerPoint pelo menu.</p>
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
    </div>
  );
}
