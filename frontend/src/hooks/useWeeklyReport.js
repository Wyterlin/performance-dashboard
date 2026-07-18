import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDefaultTopics, getTicketSummary, getWeek, saveWeek } from "../services/api";

const RANGE_STORAGE_KEY = "performance-dashboard:selected-range";
const THEME_STORAGE_KEY = "performance-dashboard:theme";

const THEME_LIGHT = "light";
const THEME_DARK = "dark";

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime());
}

function getDefaultDateRange() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: toIsoDate(monday),
    endDate: toIsoDate(sunday),
  };
}

function getStoredDateRange() {
  try {
    const raw = window.localStorage.getItem(RANGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.startDate || !parsed?.endDate) return null;
    if (!isIsoDate(parsed.startDate) || !isIsoDate(parsed.endDate)) return null;
    return {
      startDate: String(parsed.startDate),
      endDate: String(parsed.endDate),
    };
  } catch {
    return null;
  }
}

function persistDateRange(startDate, endDate) {
  try {
    window.localStorage.setItem(
      RANGE_STORAGE_KEY,
      JSON.stringify({
        startDate,
        endDate,
      })
    );
  } catch {
    // Ignore browser storage failures.
  }
}

function getStoredTheme() {
  try {
    const stored = String(window.localStorage.getItem(THEME_STORAGE_KEY) || "").trim();
    if ([THEME_LIGHT, THEME_DARK].includes(stored)) return stored;
    return THEME_DARK;
  } catch {
    return THEME_DARK;
  }
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore browser storage failures.
  }
}

function buildPeriodKey(startDate, endDate) {
  return `${startDate || "sem-inicio"}_${endDate || "sem-fim"}`;
}

function normalizePosition(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return Math.floor(num);
  return fallback;
}

function normalizeProjectTeam(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const unique = new Set();
  source.forEach((item) => {
    const normalized = String(item || "").trim().slice(0, 60);
    if (normalized) unique.add(normalized);
  });
  return [...unique].slice(0, 10);
}

function normalizeSectionName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isRoadmapSection(sectionName) {
  return normalizeSectionName(sectionName).includes("roadmap");
}

function difficultyRank(value) {
  const key = String(value || "").toLowerCase();
  if (key === "low") return 1;
  if (key === "high") return 3;
  return 2;
}

function orderRoadmapActivitiesByDifficulty(activities = []) {
  return [...activities]
    .sort((a, b) => {
      const rankDiff = difficultyRank(a?.difficulty) - difficultyRank(b?.difficulty);
      if (rankDiff !== 0) return rankDiff;
      return Number(a?.position || 0) - Number(b?.position || 0);
    })
    .map((item, index) => ({
      ...item,
      position: index + 1,
    }));
}

export function useWeeklyReport() {
  const defaults = getStoredDateRange() || getDefaultDateRange();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [sections, setSections] = useState([]);
  const [summaryText, setSummaryText] = useState("");
  const [ticketSummary, setTicketSummary] = useState(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState("");
  const [theme, setTheme] = useState(getStoredTheme);
  const [autoSaveState, setAutoSaveState] = useState("idle");
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState(null);
  const [activityHistory, setActivityHistory] = useState([]);
  const hasHydratedDataRef = useRef(false);
  const isRangeInvalid = Boolean(startDate && endDate && startDate > endDate);

  const normalizeSections = useCallback((incomingSections, fallbackNames = []) => {
    const source = incomingSections?.length
      ? incomingSections
      : fallbackNames.map((name) => ({ name, activities: [] }));

    const normalized = source.map((section) => ({
      name: section.name,
      activities: (section.activities || []).map((activity, activityIndex) => ({
        id: activity.id || crypto.randomUUID(),
        title: activity.title || "",
        activity: activity.activity || "",
        highlight: activity.highlight || "",
        called: activity.called || "",
        projectTeam: normalizeProjectTeam(activity.projectTeam),
        cycleImplantation: activity.cycleImplantation || "",
        cycleTime: activity.cycleTime || "",
        subtitle: activity.subtitle || "",
        impact: activity.impact || activity.benefit || activity.activity || "",
        benefit: activity.benefit || activity.activity || "",
        difficulty: activity.difficulty || "",
        category: activity.category || "",
        position: normalizePosition(activity.position, activityIndex + 1),
      })),
    }));

    if (!fallbackNames.length) return normalized;

    const existingNames = new Set(normalized.map((section) => normalizeSectionName(section.name)));
    const missingSections = fallbackNames
      .filter((name) => !existingNames.has(normalizeSectionName(name)))
      .map((name) => ({
        name,
        activities: [],
      }));

    return [...normalized, ...missingSections];
  }, []);

  const loadWeek = useCallback(async () => {
    setLoadingReport(true);
    try {
      const periodKey = buildPeriodKey(startDate, endDate);
      const [weekResponse, defaultTopicsResponse] = await Promise.all([
        getWeek(periodKey).catch(() => null),
        getDefaultTopics(),
      ]);

      if (weekResponse?.week) {
        setSections(
          normalizeSections(weekResponse.week.sections, defaultTopicsResponse.topics || [])
        );
        setSummaryText(weekResponse.week.summary || "");
      } else {
        setSections(normalizeSections([], defaultTopicsResponse.topics || []));
        setSummaryText("");
      }
    } finally {
      setLoadingReport(false);
    }
  }, [endDate, normalizeSections, startDate]);

  const loadTicketSummary = useCallback(async () => {
    if (isRangeInvalid) {
      setTicketSummary(null);
      setTicketError("Periodo invalido: a data inicial deve ser menor ou igual a final.");
      return;
    }

    setTicketLoading(true);
    setTicketError("");
    try {
      const response = await getTicketSummary(startDate, endDate);
      setTicketSummary(response);
    } catch (error) {
      setTicketSummary(null);
      setTicketError(error.message || "Falha ao consultar chamados");
    } finally {
      setTicketLoading(false);
    }
  }, [endDate, isRangeInvalid, startDate]);

  const saveCurrentWeek = useCallback(async () => {
    if (isRangeInvalid) {
      return;
    }

    setSaving(true);
    try {
      const periodKey = buildPeriodKey(startDate, endDate);
      await saveWeek(periodKey, {
        weekCode: periodKey,
        startDate,
        endDate,
        sections,
        summary: summaryText,
      });
    } finally {
      setSaving(false);
    }
  }, [endDate, isRangeInvalid, sections, startDate, summaryText]);

  const autoSaveCurrentWeek = useCallback(async () => {
    if (isRangeInvalid) return;
    const periodKey = buildPeriodKey(startDate, endDate);
    setAutoSaveState("saving");
    await saveWeek(periodKey, {
      weekCode: periodKey,
      startDate,
      endDate,
      sections,
      summary: summaryText,
    });
    setAutoSaveState("saved");
    setLastAutoSavedAt(Date.now());
  }, [endDate, isRangeInvalid, sections, startDate, summaryText]);

  const loadPeriodData = useCallback(async () => {
    if (isRangeInvalid) {
      setTicketSummary(null);
      setTicketError("Periodo invalido: a data inicial deve ser menor ou igual a final.");
      return;
    }

    persistDateRange(startDate, endDate);

    await Promise.all([loadWeek(), loadTicketSummary()]);
  }, [endDate, isRangeInvalid, loadTicketSummary, loadWeek, startDate]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      await loadPeriodData();
      if (active) {
        hasHydratedDataRef.current = true;
      }
    }

    bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedDataRef.current) return;
    if (loadingReport || isRangeInvalid) return;

    const timer = window.setTimeout(() => {
      autoSaveCurrentWeek().catch(() => {
        setAutoSaveState("error");
        // Keep UI responsive even if a background save fails.
      });
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    autoSaveCurrentWeek,
    endDate,
    isRangeInvalid,
    loadingReport,
    sections,
    startDate,
    summaryText,
  ]);

  const upsertActivity = useCallback((sectionIndex, draft, activityId = null) => {
    const title = String(draft.title || "").trim();
    const activity = String(draft.activity || "").trim();
    const highlight = String(draft.highlight || "").trim();
    const called = String(draft.called || "").replace(/\D+/g, "").slice(0, 20);
    const projectTeam = normalizeProjectTeam(draft.projectTeam);
    const cycleImplantation = String(draft.cycleImplantation || "").trim().slice(0, 50);
    const cycleTime = String(draft.cycleTime || "").trim().slice(0, 40);
    const subtitle = String(draft.subtitle || "").trim().slice(0, 35);
    const impact = String(draft.impact || draft.benefit || "").trim().slice(0, 180);
    const benefit = impact;
    const position = normalizePosition(draft.position, 1);
    if (!title || !activity) return false;

    let historyEntry = null;
    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        const roadmapSection = isRoadmapSection(section.name);
        const difficulty = roadmapSection
          ? ["low", "medium", "high"].includes(String(draft.difficulty || "").toLowerCase())
            ? String(draft.difficulty || "").toLowerCase()
            : "medium"
          : "";
        const category = roadmapSection
          ? ["Infraestrutura", "Dados", "Processos"].includes(String(draft.category || ""))
            ? String(draft.category || "")
            : "Processos"
          : "";

        const nextPosition = normalizePosition(
          position,
          (section.activities.reduce((acc, item) => Math.max(acc, Number(item.position || 0)), 0) || 0) +
            1
        );

        if (activityId) {
          historyEntry = {
            id: crypto.randomUUID(),
            type: "update",
            section: section.name,
            title,
            timestamp: Date.now(),
          };
          return {
            ...section,
            activities: section.activities.map((item) =>
              item.id === activityId
                ? {
                    ...item,
                    title,
                    activity,
                    highlight,
                    called,
                    projectTeam,
                    cycleImplantation,
                    cycleTime,
                    subtitle,
                    impact,
                    benefit,
                    difficulty,
                    category,
                    position: nextPosition,
                  }
                : item
            ),
          };
        }

        historyEntry = {
          id: crypto.randomUUID(),
          type: "create",
          section: section.name,
          title,
          timestamp: Date.now(),
        };

        const created = {
          id: crypto.randomUUID(),
          title,
          activity,
          highlight,
          called,
          projectTeam,
          cycleImplantation,
          cycleTime,
          subtitle,
          impact,
          benefit,
          difficulty,
          category,
          position: nextPosition,
        };

        const nextActivities = [...section.activities, created];
        return {
          ...section,
          activities: roadmapSection
            ? orderRoadmapActivitiesByDifficulty(nextActivities)
            : nextActivities,
        };
      })
    );
    if (historyEntry) {
      setActivityHistory((prev) => [historyEntry, ...prev].slice(0, 25));
    }
    return true;
  }, []);

  const deleteActivity = useCallback((sectionIndex, activityId) => {
    if (!activityId) return false;

    let historyEntry = null;

    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        const removed = section.activities.find((item) => item.id === activityId);
        if (removed) {
          historyEntry = {
            id: crypto.randomUUID(),
            type: "delete",
            section: section.name,
            title: String(removed.title || "Atividade"),
            timestamp: Date.now(),
          };
        }

        return {
          ...section,
          activities: section.activities.filter((item) => item.id !== activityId),
        };
      })
    );

    if (historyEntry) {
      setActivityHistory((prev) => [historyEntry, ...prev].slice(0, 25));
    }

    return true;
  }, []);

  const moveActivity = useCallback((sectionIndex, activityId, direction) => {
    if (!activityId) return false;
    const step = Number(direction);
    if (![1, -1].includes(step)) return false;

    let moved = false;
    let historyEntry = null;

    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        const ordered = [...section.activities].sort(
          (a, b) => Number(a.position || 0) - Number(b.position || 0)
        );
        if (ordered.length < 2) return section;

        const currentIndex = ordered.findIndex((item) => item.id === activityId);
        if (currentIndex < 0) return section;

        const targetIndex = currentIndex + step;
        if (targetIndex < 0 || targetIndex >= ordered.length) return section;

        const reordered = [...ordered];
        const [selected] = reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, selected);

        historyEntry = {
          id: crypto.randomUUID(),
          type: "move",
          section: section.name,
          title: String(selected.title || "Atividade"),
          timestamp: Date.now(),
        };

        const nextPositionById = new Map(
          reordered.map((item, positionIndex) => [item.id, positionIndex + 1])
        );

        moved = true;
        return {
          ...section,
          activities: section.activities.map((item) => ({
            ...item,
            position: nextPositionById.get(item.id) || Number(item.position || 1),
          })),
        };
      })
    );

    if (moved && historyEntry) {
      setActivityHistory((prev) => [historyEntry, ...prev].slice(0, 25));
    }

    return moved;
  }, []);

  const duplicateActivity = useCallback((sectionIndex, activityId) => {
    if (!activityId) return false;

    let duplicated = false;
    let historyEntry = null;

    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        const original = section.activities.find((item) => item.id === activityId);
        if (!original) return section;

        const maxPosition = section.activities.reduce(
          (acc, item) => Math.max(acc, Number(item.position || 0)),
          0
        );

        const clone = {
          ...original,
          id: crypto.randomUUID(),
          title: `${String(original.title || "Atividade")} (cópia)`,
          position: maxPosition + 1,
        };

        duplicated = true;
        historyEntry = {
          id: crypto.randomUUID(),
          type: "duplicate",
          section: section.name,
          title: clone.title,
          timestamp: Date.now(),
        };

        return {
          ...section,
          activities: [...section.activities, clone],
        };
      })
    );

    if (duplicated && historyEntry) {
      setActivityHistory((prev) => [historyEntry, ...prev].slice(0, 25));
    }

    return duplicated;
  }, []);

  const totalManualActivities = useMemo(() => {
    return sections.reduce((acc, section) => acc + section.activities.length, 0);
  }, [sections]);

  const dataQuality = useMemo(() => {
    let withoutHighlight = 0;
    let withoutCalled = 0;
    let shortDescription = 0;

    sections.forEach((section) => {
      section.activities.forEach((item) => {
        if (!String(item.highlight || "").trim()) withoutHighlight += 1;
        if (!String(item.called || "").trim()) withoutCalled += 1;
        if (String(item.activity || "").trim().length < 30) shortDescription += 1;
      });
    });

    return {
      withoutHighlight,
      withoutCalled,
      shortDescription,
    };
  }, [sections]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    persistTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === THEME_DARK ? THEME_LIGHT : THEME_DARK));
  }, []);

  return {
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
    loadTicketSummary,
    loadPeriodData,
    loadingReport,
    saveCurrentWeek,
    saving,
    autoSaveState,
    lastAutoSavedAt,
    theme,
    toggleTheme,
    upsertActivity,
    deleteActivity,
    moveActivity,
    totalManualActivities,
    dataQuality,
    activityHistory,
    isRangeInvalid,
    duplicateActivity,
  };
}
