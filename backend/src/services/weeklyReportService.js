const { randomUUID } = require("node:crypto");
const { getSupabase } = require("../utils/supabaseClient");

const TABLE = "weekly_reports";

/** Converte uma linha do Postgres para o formato usado pela API/frontend. */
function mapRowToWeek(row) {
  if (!row) return null;
  return {
    id: row.id,
    weekCode: row.week_code,
    startDate: row.start_date || null,
    endDate: row.end_date || null,
    summary: row.summary || "",
    sections: Array.isArray(row.sections) ? row.sections : [],
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

const DEFAULT_SECTIONS = [
  "SAP Business One",
  "Shop Control 9",
  "Queries (Consultas)",
  "Banco de Dados (BD)",
  "Manutencao de Maquinas",
  "Treinamentos",
  "Roadmap de Acoes e Melhoria Continua",
];

const CALLED_MIN_DIGITS = 4;
const CALLED_MAX_DIGITS = 20;
const TEAM_MEMBER_MAX = 60;
const TEAM_MEMBER_LIMIT = 10;
const CYCLE_IMPLANTATION_MAX = 50;
const CYCLE_TIME_MAX = 40;
const ROADMAP_DIFFICULTY = new Set(["low", "medium", "high"]);
const ROADMAP_CATEGORY = new Set(["Infraestrutura", "Dados", "Processos"]);

function normalizeWeekCode(weekCode) {
  return String(weekCode || "").trim();
}

function sanitizeCalled(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length < CALLED_MIN_DIGITS) return "";
  return digits.slice(0, CALLED_MAX_DIGITS);
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isRoadmapSectionName(name) {
  return normalizeText(name).includes("roadmap");
}

function sanitizeBenefit(value) {
  return String(value || "").trim().slice(0, 180);
}

function sanitizeProjectTeam(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const unique = new Set();

  source.forEach((item) => {
    const normalized = String(item || "").trim().slice(0, TEAM_MEMBER_MAX);
    if (normalized) unique.add(normalized);
  });

  return [...unique].slice(0, TEAM_MEMBER_LIMIT);
}

function sanitizeCycleImplantation(value) {
  return String(value || "").trim().slice(0, CYCLE_IMPLANTATION_MAX);
}

function sanitizeCycleTime(value) {
  return String(value || "").trim().slice(0, CYCLE_TIME_MAX);
}

function sanitizeDifficulty(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (!ROADMAP_DIFFICULTY.has(normalized)) return "";
  return normalized;
}

function sanitizeCategory(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!ROADMAP_CATEGORY.has(normalized)) return "";
  return normalized;
}

function buildDefaultSections() {
  return DEFAULT_SECTIONS.map((name) => ({
    name,
    activities: [],
  }));
}

function mapLegacyTopicsToSections(topics) {
  const manualTopics = (topics || []).filter((topic) => topic?.name !== "Chamados");
  if (!manualTopics.length) return buildDefaultSections();

  return manualTopics.map((topic) => {
    const activityText = String(topic.notes || "").trim();
    const highlightText = String(topic.highlights || "").trim();
    const quantity = Number(topic.quantity || 0);

    const hasAnyData = activityText || highlightText || quantity > 0;
    return {
      name: topic.name,
      activities: hasAnyData
        ? [
            {
              id: randomUUID(),
              title: quantity > 0 ? `Registro importado (${quantity})` : "Registro importado",
              activity: activityText,
              highlight: highlightText,
            },
          ]
        : [],
    };
  });
}

async function listWeeks() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("week_code", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapRowToWeek);
}

async function getWeek(weekCode) {
  const normalized = normalizeWeekCode(weekCode);
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("week_code", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return mapRowToWeek(data);
}

function normalizeSections(payload) {
  if (Array.isArray(payload.sections) && payload.sections.length) {
    return payload.sections.map((section) => ({
      name: section.name,
      activities: (section.activities || []).map((activity, index) => ({
        id: activity.id || randomUUID(),
        title: String(activity.title || "").trim(),
        activity: String(activity.activity || "").trim(),
        highlight: String(activity.highlight || "").trim(),
        called: sanitizeCalled(activity.called),
        projectTeam: sanitizeProjectTeam(activity.projectTeam),
        cycleImplantation: sanitizeCycleImplantation(activity.cycleImplantation),
        cycleTime: sanitizeCycleTime(activity.cycleTime),
        benefit: sanitizeBenefit(activity.benefit || activity.activity),
        // Destaque da semana: comparativo antes -> depois (vira slide próprio).
        isWeekHighlight: Boolean(activity.isWeekHighlight),
        beforeValue: String(activity.beforeValue || "").trim().slice(0, 40),
        afterValue: String(activity.afterValue || "").trim().slice(0, 40),
        highlightNote: String(activity.highlightNote || "").trim().slice(0, 160),
        // Fluxo atendido: vira um card de destaque ao lado da atividade.
        flowText: String(activity.flowText || "").trim().slice(0, 120),
        difficulty: isRoadmapSectionName(section.name)
          ? sanitizeDifficulty(activity.difficulty) || "medium"
          : sanitizeDifficulty(activity.difficulty),
        category: isRoadmapSectionName(section.name)
          ? sanitizeCategory(activity.category) || "Processos"
          : sanitizeCategory(activity.category),
        position: Math.max(1, Number(activity.position || index + 1) || index + 1),
      })),
    }));
  }

  if (Array.isArray(payload.topics) && payload.topics.length) {
    return mapLegacyTopicsToSections(payload.topics);
  }

  return buildDefaultSections();
}

async function upsertWeek(payload) {
  const weekCode = normalizeWeekCode(payload.weekCode);

  if (!weekCode) {
    throw new Error("weekCode is required");
  }

  const sections = normalizeSections(payload);
  const supabase = getSupabase();

  // Não incluímos id/created_at no payload: em insert o Postgres gera os
  // defaults; em conflito (update) eles são preservados. updated_at fica a
  // cargo do trigger set_updated_at.
  const row = {
    week_code: weekCode,
    start_date: payload.startDate || null,
    end_date: payload.endDate || null,
    summary: payload.summary || "",
    sections,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "week_code" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapRowToWeek(data);
}

module.exports = {
  DEFAULT_SECTIONS,
  listWeeks,
  getWeek,
  upsertWeek,
};
