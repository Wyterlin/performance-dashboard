const axios = require("axios");

const cacheByKey = new Map();

// Ordem de exibição das colunas (igual ao board do SULTS).
const OFFICIAL_STATUS_ORDER = [1, 4, 6, 5, 3, 2];
const STATUS_BY_CODE = {
  1: "Novo Chamado",
  2: "Concluído",
  3: "Resolvido",
  4: "Em Andamento",
  5: "Aguardando Solicitante",
  6: "Aguardando Responsável",
};

// Colunas "abertas": contadas AO VIVO (status atual), sem filtro de data.
const OPEN_STATUS_CODES = [1, 4, 5, 6];

function normalizeStatusToCode(statusValue) {
  if (typeof statusValue === "number" && Number.isFinite(statusValue)) return statusValue;
  const status = String(statusValue || "").trim().toLowerCase();
  if (!status) return null;
  if (status.includes("novo") || status.includes("aberto") || status.includes("open")) return 1;
  if (status.includes("conclu")) return 2;
  if (status.includes("resol")) return 3;
  if (status.includes("andamento") || status.includes("progress")) return 4;
  if (status.includes("aguardando solicitante")) return 5;
  if (status.includes("aguardando responsavel")) return 6;
  return null;
}

function statusCodeOf(ticket) {
  return normalizeStatusToCode(ticket?.situacao ?? ticket?.status ?? ticket?.status_nome);
}

function buildBaseStatusCount() {
  const base = {};
  for (const code of OFFICIAL_STATUS_ORDER) base[STATUS_BY_CODE[code]] = 0;
  return base;
}

function filterByResponsibleUser(tickets, userId) {
  if (!userId) return tickets;
  return tickets.filter((ticket) => String(ticket?.responsavel?.id || "") === String(userId));
}

function toUtcIsoBoundary(dateText, isEnd) {
  if (!dateText) return "";
  return `${dateText}${isEnd ? "T23:59:59Z" : "T00:00:00Z"}`;
}

function ms(dateStr) {
  if (!dateStr) return NaN;
  return new Date(dateStr).getTime();
}

function withinRange(dateStr, startMs, endMs) {
  const t = ms(dateStr);
  if (Number.isNaN(t)) return false;
  if (startMs != null && t < startMs) return false;
  if (endMs != null && t > endMs) return false;
  return true;
}

function resolvePaginationConfig() {
  const pageLimit = Number(process.env.SULTS_PAGE_LIMIT || 100);
  const maxPages = Number(process.env.SULTS_MAX_PAGES || 0);
  return {
    pageLimit: Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : 100,
    maxPages: Number.isFinite(maxPages) && maxPages >= 0 ? maxPages : 0,
  };
}

function extractTicketArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function extractTicketPayload(payload) {
  const tickets = extractTicketArray(payload);
  const start = Number(payload?.start || 0);
  const limit = Number(payload?.limit || tickets.length || 100);
  const totalPage = Number(payload?.totalPage || 1);
  return {
    tickets,
    start: Number.isFinite(start) ? start : 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 100,
    totalPage: Number.isFinite(totalPage) && totalPage > 0 ? totalPage : 1,
  };
}

function dedupeTicketsById(tickets) {
  const map = new Map();
  for (const ticket of tickets) {
    const key = String(ticket?.id || "");
    if (!key) continue;
    if (!map.has(key)) map.set(key, ticket);
  }
  return [...map.values()];
}

async function fetchAllTickets(baseUrl, path, headers, timeout, params) {
  const { pageLimit, maxPages } = resolvePaginationConfig();
  const collected = [];
  let start = 0;
  let page = 1;

  while (true) {
    const response = await axios.get(`${baseUrl}${path}`, {
      headers,
      params: { ...params, start, limit: pageLimit },
      timeout,
    });
    const parsed = extractTicketPayload(response.data);
    collected.push(...parsed.tickets);

    const reachedEnd = page >= parsed.totalPage || parsed.tickets.length === 0;
    const reachedMax = maxPages > 0 && page >= maxPages;
    if (reachedEnd || reachedMax) break;

    start = parsed.start + parsed.limit;
    page += 1;
  }
  return dedupeTicketsById(collected);
}

/** Prazo renegociado: resolução estipulada difere da planejada. */
function isRenegotiated(ticket) {
  const a = ms(ticket?.resolverPlanejado);
  const b = ms(ticket?.resolverEstipulado);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a !== b;
}

/** Média de duração (fim - início) em ms, ignorando pares inválidos/negativos. */
function averageDurationMs(tickets, startField, endField) {
  const diffs = [];
  for (const t of tickets) {
    const s = ms(t[startField]);
    const e = ms(t[endField]);
    if (Number.isNaN(s) || Number.isNaN(e)) continue;
    if (e < s) continue;
    diffs.push(e - s);
  }
  if (!diffs.length) return { avgMs: null, count: 0 };
  const avg = diffs.reduce((acc, v) => acc + v, 0) / diffs.length;
  return { avgMs: Math.round(avg), count: diffs.length };
}

async function fetchTicketSummary(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const requestedUserId = process.env.SULTS_DEFAULT_USER_ID || "";
  const startDate = options.startDate || "";
  const endDate = options.endDate || "";
  const hasRange = Boolean(startDate || endDate);

  const userKey = requestedUserId ? `user:${requestedUserId}` : "user:all";
  const cacheKey = `v3|${userKey}|range:${startDate || "all"}:${endDate || "all"}`;
  const ttl = Number(process.env.TICKET_CACHE_TTL_MS || 600000);
  const cachedEntry = cacheByKey.get(cacheKey);
  if (!forceRefresh && cachedEntry?.data && Date.now() < cachedEntry.expiresAt) {
    return { ...cachedEntry.data, source: "cache" };
  }

  const baseUrl = process.env.SULTS_API_BASE_URL || "https://api.sults.com.br/api/v1";
  const path = process.env.SULTS_TICKET_PATH || "/chamado/ticket";
  const token = process.env.SULTS_API_TOKEN || "";
  const authHeader = process.env.SULTS_AUTH_HEADER || "Authorization";
  const authScheme = process.env.SULTS_AUTH_SCHEME || "";
  const timeout = Number(process.env.SULTS_TIMEOUT_MS || 10000);

  const headers = { Accept: "application/json" };
  if (token) headers[authHeader] = authScheme ? `${authScheme} ${token}`.trim() : token;

  const baseParams = {};
  if (requestedUserId) baseParams.responsavel = String(requestedUserId);

  const startMs = startDate ? ms(toUtcIsoBoundary(startDate, false)) : null;
  const endMs = endDate ? ms(toUtcIsoBoundary(endDate, true)) : null;

  const statusCount = buildBaseStatusCount();

  // Busca por um campo de data, confirmando o intervalo no cliente.
  const fetchByDateField = async (field, extraParams = {}) => {
    if (!hasRange) return [];
    const params = { ...baseParams, ...extraParams };
    const startIso = toUtcIsoBoundary(startDate, false);
    const endIso = toUtcIsoBoundary(endDate, true);
    if (startIso) params[`${field}Start`] = startIso;
    if (endIso) params[`${field}End`] = endIso;
    const tickets = await fetchAllTickets(baseUrl, path, headers, timeout, params);
    return filterByResponsibleUser(
      tickets.filter((t) => withinRange(t[field], startMs, endMs)),
      requestedUserId
    );
  };

  // --- Colunas abertas: ao vivo, por situacao ---
  for (const code of OPEN_STATUS_CODES) {
    const tickets = await fetchAllTickets(baseUrl, path, headers, timeout, {
      ...baseParams,
      situacao: code,
    });
    const filtered = filterByResponsibleUser(
      tickets.filter((t) => statusCodeOf(t) === code),
      requestedUserId
    );
    statusCount[STATUS_BY_CODE[code]] = filtered.length;
  }

  // --- Conjuntos do período (uma busca por evento) ---
  const resolvedSet = await fetchByDateField("resolvido"); // resolvidos no período
  const concludedSet = await fetchByDateField("concluido"); // concluídos no período
  const respondedSet = await fetchByDateField("primeiraInteracao"); // 1ª resposta no período
  const openedSet = await fetchByDateField("aberto"); // abertos no período

  // Colunas fechadas: status atual + evento no período.
  statusCount[STATUS_BY_CODE[3]] = resolvedSet.filter((t) => statusCodeOf(t) === 3).length;
  statusCount[STATUS_BY_CODE[2]] = concludedSet.filter((t) => statusCodeOf(t) === 2).length;

  const total = OFFICIAL_STATUS_ORDER.reduce(
    (acc, code) => acc + (statusCount[STATUS_BY_CODE[code]] || 0),
    0
  );

  // --- Métricas de atendimento ---
  const firstResponse = averageDurationMs(respondedSet, "aberto", "primeiraInteracao");
  const resolution = averageDurationMs(resolvedSet, "aberto", "resolvido");

  // Cumprimento de SLA: resolvido dentro do prazo estipulado.
  const slaEval = resolvedSet.filter((t) => !Number.isNaN(ms(t.resolverEstipulado)) && !Number.isNaN(ms(t.resolvido)));
  const slaWithin = slaEval.filter((t) => ms(t.resolvido) <= ms(t.resolverEstipulado)).length;
  const slaPct = slaEval.length ? Math.round((slaWithin / slaEval.length) * 100) : null;

  // CSAT: média das avaliações dos concluídos no período.
  const rated = concludedSet.filter((t) => Number(t.avaliacaoNota) > 0);
  const csatAvg = rated.length
    ? Math.round((rated.reduce((acc, t) => acc + Number(t.avaliacaoNota), 0) / rated.length) * 10) / 10
    : null;

  // Taxa de resolução (vazão): fechados no período ÷ abertos no período.
  const closedUnique = dedupeTicketsById([...resolvedSet, ...concludedSet]).length;
  const openedCount = openedSet.length;
  const resolutionRatePct = openedCount ? Math.round((closedUnique / openedCount) * 100) : null;

  // Prazos renegociados entre os chamados trabalhados no período.
  const workedInPeriod = dedupeTicketsById([...resolvedSet, ...concludedSet, ...respondedSet, ...openedSet]);
  const renegotiated = workedInPeriod.filter(isRenegotiated).length;

  const summary = {
    total,
    // Mantém compatibilidade: repactTotal = totalCombined - total.
    totalCombined: total + renegotiated,
    renegotiated,
    userId: requestedUserId || null,
    startDate: startDate || null,
    endDate: endDate || null,
    statusCount,
    statusCountCombined: statusCount,
    statusOrder: OFFICIAL_STATUS_ORDER.map((code) => STATUS_BY_CODE[code]),
    metrics: {
      firstResponseMs: firstResponse.avgMs,
      firstResponseCount: firstResponse.count,
      resolutionMs: resolution.avgMs,
      resolutionCount: resolution.count,
      slaPct,
      slaWithin,
      slaTotal: slaEval.length,
      csatAvg,
      csatCount: rated.length,
      openedInPeriod: openedCount,
      closedInPeriod: closedUnique,
      resolutionRatePct,
    },
    fetchedAt: new Date().toISOString(),
    source: "live",
  };

  cacheByKey.set(cacheKey, { data: summary, expiresAt: Date.now() + ttl });
  return summary;
}

module.exports = {
  fetchTicketSummary,
};
