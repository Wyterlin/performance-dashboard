const { randomUUID } = require("node:crypto");
const { readStore, writeStore } = require("../utils/fileStore");

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
  const db = await readStore();
  return db.weeks.sort((a, b) => b.weekCode.localeCompare(a.weekCode));
}

async function getWeek(weekCode) {
  const normalized = normalizeWeekCode(weekCode);
  const db = await readStore();
  return db.weeks.find((item) => item.weekCode === normalized) || null;
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
        benefit: sanitizeBenefit(activity.benefit || activity.activity),
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

  const db = await readStore();
  const now = new Date().toISOString();
  const sections = normalizeSections(payload);

  const week = {
    id: payload.id || randomUUID(),
    weekCode,
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    summary: payload.summary || "",
    sections,
    updatedAt: now,
    createdAt: now,
  };

  const existingIndex = db.weeks.findIndex((item) => item.weekCode === weekCode);
  if (existingIndex >= 0) {
    week.id = db.weeks[existingIndex].id;
    week.createdAt = db.weeks[existingIndex].createdAt;
    db.weeks[existingIndex] = week;
  } else {
    db.weeks.push(week);
  }

  await writeStore(db);
  return week;
}

module.exports = {
  DEFAULT_SECTIONS,
  listWeeks,
  getWeek,
  upsertWeek,
};
