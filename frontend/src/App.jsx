import SectionActivities from "./components/SectionActivities";
import TicketSummaryCard from "./components/TicketSummaryCard";
import { useWeeklyReport } from "./hooks/useWeeklyReport";
import { exportDashboardPdf, exportDashboardPptx } from "./services/exportService";

const SUMMARY_MAX = 3000;

export default function App() {
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    sections,
    summaryText,
    setSummaryText,
    ticketSummary,
    ticketLoading,
    ticketError,
    loadPeriodData,
    loadingReport,
    upsertActivity,
    deleteActivity,
    moveActivity,
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

  async function handleExportPdf() {
    await exportDashboardPdf({
      startDate,
      endDate,
      ticketSummary,
      sections,
      summaryText,
    });
  }

  async function handleExportPptx() {
    await exportDashboardPptx({
      startDate,
      endDate,
      ticketSummary,
      sections,
      summaryText,
    });
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
            <details className="export-menu">
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

      <section className="sections-layout">
        {sections.map((section, sectionIndex) => (
          <SectionActivities
            key={section.name}
            section={section}
            sectionIndex={sectionIndex}
            onUpsert={upsertActivity}
            onDelete={deleteActivity}
            onMove={moveActivity}
          />
        ))}
      </section>

      <section className="summary-panel">
        <h2>Resumo do Periodo</h2>
        <textarea
          rows="6"
          value={summaryText}
          maxLength={SUMMARY_MAX}
          onChange={(event) => setSummaryText(event.target.value.slice(0, SUMMARY_MAX))}
          placeholder="Sintese da semana, resultados, riscos, pendencias e foco para proxima semana..."
        />
        <small>{summaryText.length}/{SUMMARY_MAX}</small>
      </section>
    </main>
  );
}
