function statusEntries(statusCount) {
  return Object.entries(statusCount || {}).sort((a, b) => b[1] - a[1]);
}

export default function TicketSummaryCard({ summary, loading, error, onRefresh }) {
  const orderedStatuses = summary?.statusOrder || [];
  const primaryStatusCount = summary?.statusCount || {};
  const combinedStatusCount = summary?.statusCountCombined || {};
  const entries = orderedStatuses.length
    ? orderedStatuses.map((status) => ({
        status,
        primary: primaryStatusCount[status] || 0,
        combined: combinedStatusCount[status] || 0,
      }))
    : statusEntries(primaryStatusCount).map(([status, count]) => ({
        status,
        primary: count,
        combined: combinedStatusCount[status] || 0,
      }));

  return (
    <article className="ticket-card">
      <div className="ticket-card-header">
        <div>
          <h3>
            Chamados <span className="ticket-brand">SULTS</span>
          </h3>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {error ? <p className="alert-error">{error}</p> : null}

      <ul className="status-cards-grid">
        {entries.length ? (
          entries.map((entry) => (
            <li key={entry.status} className="status-card">
              <span className="status-title">{entry.status}</span>
              <strong className="status-value">{entry.primary}</strong>
            </li>
          ))
        ) : (
          <li className="status-card">
            <span className="status-title">Sem dados de status</span>
            <strong className="status-value">0</strong>
          </li>
        )}
      </ul>
    </article>
  );
}
