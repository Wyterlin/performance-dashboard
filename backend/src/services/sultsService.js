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

// Colunas "abertas": contadas AO VIVO (todos que estão nesse status agora),
// sem filtro de data — assim batem com as 4 primeiras colunas do board.
const OPEN_STATUS_CODES = [1, 4, 5, 6];

// Colunas "fechadas": contadas apenas dentro do período, usando a data
// específica de cada evento (resolvido / concluído).
const CLOSED_STATUSES = [
  { code: 3, dateField: "resolvido" }, // Resolvido
  { code: 2, dateField: "concluido" }, // Concluído
];

function normalizeStatusToCode(statusValue) {
  if (typeof statusValue === "number" && Number.isFinite(statusValue)) {
    return statusValue;
  }
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
  for (const code of OFFICIAL_STATUS_ORDER) {
    base[STATUS_BY_CODE[code]] = 0;
  }
  return base;
}

function filterByResponsibleUser(tickets, userId) {
  if (!userId) return tickets;
  return tickets.filter((ticket) => String(ticket?.responsavel?.id || "") === String(userId));
}

function toUtcIsoBoundary(dateText, isEnd) {
  if (!dateText) return "";
  const suffix = isEnd ? "T23:59:59Z" : "T00:00:00Z";
  return `${dateText}${suffix}`;
}

function withinRange(dateStr, startMs, endMs) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
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

/** Busca paginada genérica com um conjunto de filtros (params). */
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

/** Repactuação de prazos: data de resolução estipulada difere da planejada. */
function isRepactuated(ticket) {
  const planned = ticket?.resolverPlanejado;
  const stipulated = ticket?.resolverEstipulado;
  if (!planned || !stipulated) return false;
  const a = new Date(planned).getTime();
  const b = new Date(stipulated).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return a !== b;
}

async function fetchTicketSummary(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const requestedUserId = process.env.SULTS_DEFAULT_USER_ID || "";
  const startDate = options.startDate || "";
  const endDate = options.endDate || "";
  const hasRange = Boolean(startDate || endDate);

  const userKey = requestedUserId ? `user:${requestedUserId}` : "user:all";
  const rangeKey = `range:${startDate || "all"}:${endDate || "all"}`;
  const cacheKey = `v2|${userKey}|${rangeKey}`;
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
  if (token) {
    headers[authHeader] = authScheme ? `${authScheme} ${token}`.trim() : token;
  }

  const baseParams = {};
  if (requestedUserId) baseParams.responsavel = String(requestedUserId);

  const startMs = startDate ? new Date(toUtcIsoBoundary(startDate, false)).getTime() : null;
  const endMs = endDate ? new Date(toUtcIsoBoundary(endDate, true)).getTime() : null;

  const statusCount = buildBaseStatusCount();
  const allFetched = [];

  // --- Colunas abertas: ao vivo (sem filtro de data) ---
  for (const code of OPEN_STATUS_CODES) {
    const tickets = await fetchAllTickets(baseUrl, path, headers, timeout, {
      ...baseParams,
      situacao: code,
    });
    // Confirma o status no cliente (caso a API ignore o filtro situacao).
    const filtered = filterByResponsibleUser(
      tickets.filter((t) => statusCodeOf(t) === code),
      requestedUserId
    );
    statusCount[STATUS_BY_CODE[code]] = filtered.length;
    allFetched.push(...filtered);
  }

  // --- Colunas fechadas: apenas dentro do período (por resolvido/concluido) ---
  for (const { code, dateField } of CLOSED_STATUSES) {
    const dateParams = {};
    if (hasRange) {
      const startIso = toUtcIsoBoundary(startDate, false);
      const endIso = toUtcIsoBoundary(endDate, true);
      if (startIso) dateParams[`${dateField}Start`] = startIso;
      if (endIso) dateParams[`${dateField}End`] = endIso;
    }
    const tickets = await fetchAllTickets(baseUrl, path, headers, timeout, {
      ...baseParams,
      situacao: code,
      ...dateParams,
    });
    const filtered = filterByResponsibleUser(
      tickets.filter(
        (t) => statusCodeOf(t) === code && (!hasRange || withinRange(t[dateField], startMs, endMs))
      ),
      requestedUserId
    );
    statusCount[STATUS_BY_CODE[code]] = filtered.length;
    allFetched.push(...filtered);
  }

  const total = OFFICIAL_STATUS_ORDER.reduce(
    (acc, code) => acc + (statusCount[STATUS_BY_CODE[code]] || 0),
    0
  );

  const repactuados = dedupeTicketsById(allFetched).filter(isRepactuated).length;

  const summary = {
    total,
    // Mantém a "interface" antiga: repactTotal = totalCombined - total.
    totalCombined: total + repactuados,
    repactuados,
    userId: requestedUserId || null,
    startDate: startDate || null,
    endDate: endDate || null,
    statusCount,
    // Sem número secundário separado: o chip espelha a coluna.
    statusCountCombined: statusCount,
    statusOrder: OFFICIAL_STATUS_ORDER.map((code) => STATUS_BY_CODE[code]),
    fetchedAt: new Date().toISOString(),
    source: "live",
  };

  cacheByKey.set(cacheKey, { data: summary, expiresAt: Date.now() + ttl });

  return summary;
}

module.exports = {
  fetchTicketSummary,
};
