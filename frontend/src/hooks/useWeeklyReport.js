import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDefaultTopics, getTicketSummary, getWeek, saveWeek } from "../services/api";

const RANGE_STORAGE_KEY = "performance-dashboard:selected-range";

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
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

function buildPeriodKey(startDate, endDate) {
  return `${startDate || "sem-inicio"}_${endDate || "sem-fim"}`;
}

function normalizePosition(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return Math.floor(num);
  return fallback;
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
  const hasHydratedDataRef = useRef(false);
  const isRangeInvalid = Boolean(startDate && endDate && startDate > endDate);

  const normalizeSections = useCallback((incomingSections, fallbackNames = []) => {
    const source = incomingSections?.length
      ? incomingSections
      : fallbackNames.map((name) => ({ name, activities: [] }));

    return source.map((section) => ({
      name: section.name,
      activities: (section.activities || []).map((activity, activityIndex) => ({
        id: activity.id || crypto.randomUUID(),
        title: activity.title || "",
        activity: activity.activity || "",
        highlight: activity.highlight || "",
        position: normalizePosition(activity.position, activityIndex + 1),
      })),
    }));
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
    await saveWeek(periodKey, {
      weekCode: periodKey,
      startDate,
      endDate,
      sections,
      summary: summaryText,
    });
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
    const position = normalizePosition(draft.position, 1);
    if (!title || !activity) return false;

    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        const nextPosition = normalizePosition(
          position,
          (section.activities.reduce((acc, item) => Math.max(acc, Number(item.position || 0)), 0) || 0) +
            1
        );

        if (activityId) {
          return {
            ...section,
            activities: section.activities.map((item) =>
              item.id === activityId
                ? {
                    ...item,
                    title,
                    activity,
                    highlight,
                    position: nextPosition,
                  }
                : item
            ),
          };
        }

        return {
          ...section,
          activities: [
            ...section.activities,
            {
              id: crypto.randomUUID(),
              title,
              activity,
              highlight,
              position: nextPosition,
            },
          ],
        };
      })
    );
    return true;
  }, []);

  const deleteActivity = useCallback((sectionIndex, activityId) => {
    if (!activityId) return false;

    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;
        return {
          ...section,
          activities: section.activities.filter((item) => item.id !== activityId),
        };
      })
    );

    return true;
  }, []);

  const moveActivity = useCallback((sectionIndex, activityId, direction) => {
    if (!activityId) return false;
    const step = Number(direction);
    if (![1, -1].includes(step)) return false;

    let moved = false;

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

    return moved;
  }, []);

  const totalManualActivities = useMemo(() => {
    return sections.reduce((acc, section) => acc + section.activities.length, 0);
  }, [sections]);

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
    upsertActivity,
    deleteActivity,
    moveActivity,
    totalManualActivities,
    isRangeInvalid,
  };
}
