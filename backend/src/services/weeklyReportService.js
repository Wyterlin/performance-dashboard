const { randomUUID } = require("node:crypto");
const { readStore, writeStore } = require("../utils/fileStore");

const DEFAULT_SECTIONS = [
  "SAP Business One",
  "Shop Control 9",
  "Queries (Consultas)",
  "Banco de Dados (BD)",
  "Manutencao de Maquinas",
  "Treinamentos",
];

function normalizeWeekCode(weekCode) {
  return String(weekCode || "").trim();
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
      activities: (section.activities || []).map((activity) => ({
        id: activity.id || randomUUID(),
        title: String(activity.title || "").trim(),
        activity: String(activity.activity || "").trim(),
        highlight: String(activity.highlight || "").trim(),
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
