const axios = require("axios");

const cacheByKey = new Map();

const OFFICIAL_STATUS_ORDER = [1, 4, 6, 5, 3, 2];
const STATUS_BY_CODE = {
  1: "Novo Chamado",
  2: "Concluído",
  3: "Resolvido",
  4: "Em Andamento",
  5: "Aguardando Solicitante",
  6: "Aguardando Responsável",
};

const ACTIVE_DATE_FIELDS = ["aberto", "ultimaAlteracao"];

function normalizeStatus(statusValue) {
  if (typeof statusValue === "number" && Number.isFinite(statusValue)) {
    return STATUS_BY_CODE[statusValue] || `Situacao ${statusValue}`;
  }

  const status = String(statusValue || "").trim().toLowerCase();

  if (!status) return "Sem Status";
  if (status.includes("novo") || status.includes("aberto") || status.includes("open")) {
    return STATUS_BY_CODE[1];
  }
  if (status.includes("conclu")) return STATUS_BY_CODE[2];
  if (status.includes("resol")) return STATUS_BY_CODE[3];
  if (status.includes("andamento") || status.includes("progress")) return STATUS_BY_CODE[4];
  if (status.includes("aguardando solicitante")) return STATUS_BY_CODE[5];
  if (status.includes("aguardando responsavel")) return STATUS_BY_CODE[6];
  return String(statusValue).trim();
}

function buildBaseStatusCount() {
  const base = {};
  for (const code of OFFICIAL_STATUS_ORDER) {
    base[STATUS_BY_CODE[code]] = 0;
  }
  return base;
}

function countByStatus(tickets) {
  return tickets.reduce((acc, ticket) => {
    const key = normalizeStatus(ticket.situacao ?? ticket.status ?? ticket.status_nome);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, buildBaseStatusCount());
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

function buildDateQueryParamsForField(field, startDate, endDate) {
  const startIso = toUtcIsoBoundary(startDate, false);
  const endIso = toUtcIsoBoundary(endDate, true);
  if (!startIso && !endIso) return {};

  const params = {};
  if (startIso) params[`${field}Start`] = startIso;
  if (endIso) params[`${field}End`] = endIso;
  return params;
}

function resolvePaginationConfig() {
  const pageLimit = Number(process.env.SULTS_PAGE_LIMIT || 100);
  const maxPages = Number(process.env.SULTS_MAX_PAGES || 0);
  return {
    pageLimit: Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : 100,
    maxPages: Number.isFinite(maxPages) && maxPages >= 0 ? maxPages : 0,
  };
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
    if (!map.has(key)) {
      map.set(key, ticket);
    }
  }
  return [...map.values()];
}

async function fetchTicketsByDateField(
  baseUrl,
  path,
  headers,
  timeout,
  field,
  startDate,
  endDate,
  responsibleId
) {
  const baseParams = buildDateQueryParamsForField(field, startDate, endDate);
  if (responsibleId) {
    baseParams.responsavel = String(responsibleId);
  }
  const { pageLimit, maxPages } = resolvePaginationConfig();
  const collected = [];
  let start = 0;
  let page = 1;

  while (true) {
    const params = {
      ...baseParams,
      start,
      limit: pageLimit,
    };

    const response = await axios.get(`${baseUrl}${path}`, {
      headers,
      params,
      timeout,
    });

    const parsed = extractTicketPayload(response.data);
    collected.push(...parsed.tickets);

    const reachedEnd = page >= parsed.totalPage || parsed.tickets.length === 0;
    const reachedMaxPages = maxPages > 0 && page >= maxPages;
    if (reachedEnd || reachedMaxPages) {
      break;
    }

    start = parsed.start + parsed.limit;
    page += 1;
  }

  return dedupeTicketsById(collected);
}

async function fetchTicketsFromSults(
  baseUrl,
  path,
  headers,
  timeout,
  startDate,
  endDate,
  responsibleId
) {
  const dateFiltersUsed = ACTIVE_DATE_FIELDS;
  const hasDateRange = Boolean(startDate || endDate);

  if (!hasDateRange) {
    const response = await axios.get(`${baseUrl}${path}`, {
      headers,
      timeout,
    });

    return {
      tickets: extractTicketArray(response.data),
      ticketsByDateField: {},
      dateFiltersUsed: [],
    };
  }

  const ticketsByDateField = {};
  for (const field of dateFiltersUsed) {
    ticketsByDateField[field] = await fetchTicketsByDateField(
      baseUrl,
      path,
      headers,
      timeout,
      field,
      startDate,
      endDate,
      responsibleId
    );
  }

  return {
    tickets: [],
    ticketsByDateField,
    dateFiltersUsed,
  };
}

function mergeRangeTickets(ticketsByDateField) {
  const opened = ticketsByDateField.aberto || [];
  const changed = (ticketsByDateField.ultimaAlteracao || []).filter(
    (ticket) => ticket?.ultimaAlteracao !== null && ticket?.ultimaAlteracao !== undefined
  );
  return dedupeTicketsById([...opened, ...changed]);
}

function openedRangeTickets(ticketsByDateField) {
  return dedupeTicketsById(ticketsByDateField.aberto || []);
}

function extractTicketArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.tickets)) return payload.tickets;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function fetchTicketSummary(options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const requestedUserId = process.env.SULTS_DEFAULT_USER_ID || "";
  const startDate = options.startDate || "";
  const endDate = options.endDate || "";
  const hasDateRange = Boolean(startDate || endDate);
  const userKey = requestedUserId ? `user:${requestedUserId}` : "user:all";
  const rangeKey = `range:${startDate || "all"}:${endDate || "all"}`;
  const dateFieldKey = `dateFields:${ACTIVE_DATE_FIELDS.join(",")}`;
  const cacheKey = `${userKey}|${rangeKey}`;
  const fullCacheKey = `${cacheKey}|${dateFieldKey}`;
  const ttl = Number(process.env.TICKET_CACHE_TTL_MS || 600000);
  const cachedEntry = cacheByKey.get(fullCacheKey);

  if (!forceRefresh && cachedEntry?.data && Date.now() < cachedEntry.expiresAt) {
    return {
      ...cachedEntry.data,
      source: "cache",
    };
  }

  const baseUrl = process.env.SULTS_API_BASE_URL || "https://api.sults.com.br/api/v1";
  const path = process.env.SULTS_TICKET_PATH || "/chamado/ticket";
  const token = process.env.SULTS_API_TOKEN || "";
  const authHeader = process.env.SULTS_AUTH_HEADER || "Authorization";
  const authScheme = process.env.SULTS_AUTH_SCHEME || "";
  const timeout = Number(process.env.SULTS_TIMEOUT_MS || 10000);

  const headers = {
    Accept: "application/json",
  };

  if (token) {
    headers[authHeader] = authScheme ? `${authScheme} ${token}`.trim() : token;
  }

  const { tickets, ticketsByDateField, dateFiltersUsed } = await fetchTicketsFromSults(
    baseUrl,
    path,
    headers,
    timeout,
    startDate,
    endDate,
    requestedUserId
  );

  const openedTickets = hasDateRange ? openedRangeTickets(ticketsByDateField) : tickets;
  const combinedTickets = hasDateRange ? mergeRangeTickets(ticketsByDateField) : tickets;

  const primaryFilteredTickets = filterByResponsibleUser(openedTickets, requestedUserId);
  const combinedFilteredTickets = filterByResponsibleUser(combinedTickets, requestedUserId);

  const statusCount = countByStatus(primaryFilteredTickets);
  const statusCountCombined = countByStatus(combinedFilteredTickets);
  const total = primaryFilteredTickets.length;
  const totalCombined = combinedFilteredTickets.length;

  const summary = {
    total,
    totalCombined,
    userId: requestedUserId || null,
    startDate: startDate || null,
    endDate: endDate || null,
    dateFiltersUsed,
    primaryDateFiltersUsed: hasDateRange ? ["aberto"] : [],
    combinedDateFiltersUsed: hasDateRange ? dateFiltersUsed : [],
    statusCount,
    statusCountCombined,
    statusOrder: OFFICIAL_STATUS_ORDER.map((code) => STATUS_BY_CODE[code]),
    fetchedAt: new Date().toISOString(),
    source: "live",
  };

  cacheByKey.set(fullCacheKey, {
    data: summary,
    expiresAt: Date.now() + ttl,
  });

  return summary;
}

module.exports = {
  fetchTicketSummary,
};
