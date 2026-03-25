const express = require("express");
const { fetchTicketSummary } = require("../services/sultsService");

const router = express.Router();
const FALLBACK_STATUS_ORDER = [
  "Novo Chamado",
  "Em Andamento",
  "Aguardando Responsável",
  "Aguardando Solicitante",
  "Resolvido",
  "Concluído",
];

function buildFallbackStatusCount() {
  return FALLBACK_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});
}

router.get("/summary", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const startDate = req.query.startDate ? String(req.query.startDate) : "";
    const endDate = req.query.endDate ? String(req.query.endDate) : "";
    const summary = await fetchTicketSummary({ forceRefresh, startDate, endDate });
    res.json(summary);
  } catch (error) {
    res.status(502).json({
      message: "Nao foi possivel consultar a API do SULTS",
      details: error.message,
      statusCount: buildFallbackStatusCount(),
      statusCountCombined: buildFallbackStatusCount(),
      statusOrder: FALLBACK_STATUS_ORDER,
      total: 0,
      totalCombined: 0,
      primaryDateFiltersUsed: [],
      combinedDateFiltersUsed: [],
      source: "fallback",
      fetchedAt: new Date().toISOString(),
    });
  }
});

module.exports = router;
