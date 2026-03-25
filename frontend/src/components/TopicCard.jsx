export default function TopicCard({ topic, onChange }) {
  return (
    <article className="topic-card">
      <header className="topic-card-header">
        <h3>{topic.name}</h3>
        <label>
          Qtde
          <input
            type="number"
            min="0"
            value={topic.quantity}
            onChange={(event) =>
              onChange({ ...topic, quantity: Number(event.target.value) || 0 })
            }
          />
        </label>
      </header>

      <label>
        Atividades
        <textarea
          rows="4"
          value={topic.notes}
          onChange={(event) => onChange({ ...topic, notes: event.target.value })}
          placeholder="Descreva o que foi feito nesta semana..."
        />
      </label>

      <label>
        Destaques
        <textarea
          rows="3"
          value={topic.highlights}
          onChange={(event) => onChange({ ...topic, highlights: event.target.value })}
          placeholder="Principais entregas, riscos e proximos passos..."
        />
      </label>
    </article>
  );
}
