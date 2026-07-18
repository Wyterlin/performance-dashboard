import jsPDF from "jspdf";
import PptxGenJS from "pptxgenjs";

const PPT_THEME = {
  sapBlue: "005483",
  baseDark: "1C2D3D",
  accentBlue: "008DC9",
  successGreen: "2B7D2B",
  attentionOrange: "E9730C",
  softBg: "F2F2F2",
  white: "FFFFFF",
  textMuted: "5B6B79",
};

function formatPeriod(startDate, endDate) {
  return `${startDate || "-"} até ${endDate || "-"}`;
}

function formatDateToBr(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "-";
  const [year, month, day] = raw.split("-");
  return `${day}/${month}/${year}`;
}

function formatPeriodPpt(startDate, endDate) {
  return `${formatDateToBr(startDate)} até ${formatDateToBr(endDate)}`;
}

function statusRows(ticketSummary) {
  const order = ticketSummary?.statusOrder || [];
  const primary = ticketSummary?.statusCount || {};
  const combined = ticketSummary?.statusCountCombined || {};

  return order.map((status) => ({
    status,
    primary: Number(primary[status] || 0),
    combined: Number(combined[status] || 0),
  }));
}

function safeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function preserveMultiline(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function splitPdfTextPreserveBreaks(doc, value, maxWidth) {
  const normalized = preserveMultiline(value);
  if (!normalized) return [];

  const paragraphs = normalized.split("\n");
  const lines = [];

  paragraphs.forEach((paragraph, index) => {
    const wrapped = doc.splitTextToSize(paragraph || " ", maxWidth);
    lines.push(...wrapped);
    if (index < paragraphs.length - 1) lines.push("");
  });

  return lines;
}

function estimatePptLines(value, charsPerLine) {
  const normalized = preserveMultiline(value);
  if (!normalized) return 0;

  return normalized
    .split("\n")
    .reduce((acc, line) => acc + Math.max(1, Math.ceil(String(line).length / charsPerLine)), 0);
}

function normalizeText(value) {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sumStatusByTokens(rows, tokens) {
  return rows
    .filter((row) => {
      const normalized = normalizeText(row.status);
      return tokens.some((token) => normalized.includes(token));
    })
    .reduce((acc, cur) => acc + Number(cur.primary || 0), 0);
}

function buildDynamicPptNarrative(rows, operationalTotal, repactTotal, sectionKpis) {
  const sorted = [...rows].sort((a, b) => Number(b.primary || 0) - Number(a.primary || 0));
  const topStatus = sorted[0]?.status || "Sem destaque";
  const topValue = Number(sorted[0]?.primary || 0);
  const awaitingCount = sumStatusByTokens(rows, ["aguardando"]);
  const resolvedCount = sumStatusByTokens(rows, ["resolvido", "concluido"]);
  const manualTotal = sectionKpis.reduce((acc, cur) => acc + cur.total, 0);

  const message =
    topValue > 0
      ? `Maior concentração da semana em ${topStatus} (${topValue}), com foco em estabilidade operacional e previsibilidade de entrega.`
      : "Não houve concentração relevante por status no período analisado.";

  const technicalRead =
    awaitingCount > resolvedCount
      ? "Volume em aguardando acima de resolvidos/concluídos, indicando necessidade de destravar dependências para acelerar o fluxo."
      : "Resolvidos/concluídos acima de aguardando, sinalizando bom ritmo de encerramento e controle da fila.";

  const closingBlocks = [
    {
      title: "Acoes imediatas (7 dias)",
      text:
        awaitingCount > 0
          ? `Atuar nos ${awaitingCount} itens em aguardando com priorização por impacto e prazo.`
          : "Manter cadência de atendimento e monitoramento de novos chamados.",
    },
    {
      title: "Riscos monitorados",
      text:
        repactTotal > 0
          ? `Prazos renegociados em ${repactTotal} chamados, exigindo acompanhamento preventivo de SLA.`
          : "Sem prazos renegociados no período, manter observabilidade para preservar tendência.",
    },
    {
      title: "Ganhos esperados",
      text:
        manualTotal > 0
          ? `Com ${manualTotal} atividades técnicas registradas, expectativa de ganho contínuo em eficiência e qualidade de entrega.`
          : "Consolidar rotina operacional com melhoria contínua e foco em previsibilidade.",
    },
  ];

  return {
    message,
    technicalRead,
    closingBlocks,
    awaitingCount,
    manualTotal,
  };
}

function formatSyncTimestamp() {
  return new Date().toLocaleString("pt-BR");
}

function addStandardFooter(slide, syncText) {
  slide.addText(syncText, {
    x: 0.4,
    y: 6.9,
    w: 12.5,
    h: 0.2,
    fontFace: "Segoe UI",
    fontSize: 8,
    color: "7A8792",
    align: "left",
  });
}

function manualSectionKpis(sections) {
  return (sections || [])
    .map((section) => ({
      name: safeText(section?.name) || "Secao",
      total: Number(section?.activities?.length || 0),
    }))
    .filter((item) => item.total > 0);
}

function sortActivitiesByPosition(activities = []) {
  return [...activities].sort(
    (a, b) => Number(a?.position || 0) - Number(b?.position || 0)
  );
}

function truncateRoadmapText(value, maxLength = 35) {
  const normalized = preserveMultiline(value);
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function getActivityPptLayout(activity) {
  const title = safeText(activity?.title) || "Atividade";
  const description = preserveMultiline(activity?.activity) || "Sem descrição.";
  const highlight = preserveMultiline(activity?.highlight);
  const called = String(activity?.called || "").replace(/\D+/g, "");
  const cycleTime = safeText(activity?.cycleTime);
  const projectTeam = Array.isArray(activity?.projectTeam)
    ? activity.projectTeam.map((item) => safeText(item)).filter(Boolean).join(", ")
    : "";

  const titleLines = estimatePptLines(title, called ? 52 : 72);
  const cycleTimeLines = cycleTime ? estimatePptLines(`Tempo de Ciclo (Cycle Time): ${cycleTime}`, 98) : 0;
  const projectTeamLines = projectTeam ? estimatePptLines(`Equipe do Projeto: ${projectTeam}`, 98) : 0;
  const descLines = estimatePptLines(description, 98);
  const highlightLines = highlight ? estimatePptLines(`Pontos a Destacar: ${highlight}`, 98) : 0;

  const titleHeight = Math.max(0.2, titleLines * 0.16 + 0.04);
  const cycleTimeHeight = cycleTimeLines ? Math.max(0.16, cycleTimeLines * 0.13 + 0.03) : 0;
  const projectTeamHeight = projectTeamLines ? Math.max(0.16, projectTeamLines * 0.13 + 0.03) : 0;
  const descriptionHeight = Math.max(0.26, descLines * 0.14 + 0.05);
  const highlightHeight = highlightLines ? Math.max(0.2, highlightLines * 0.13 + 0.04) : 0;

  let yCursor = 0.12;
  const titleY = yCursor;
  yCursor += titleHeight + 0.07;

  const descriptionY = yCursor;
  yCursor += descriptionHeight;

  let cycleTimeY = 0;
  if (cycleTimeHeight > 0) {
    yCursor += 0.05;
    cycleTimeY = yCursor;
    yCursor += cycleTimeHeight;
  }

  let projectTeamY = 0;
  if (projectTeamHeight > 0) {
    yCursor += 0.05;
    projectTeamY = yCursor;
    yCursor += projectTeamHeight;
  }

  let highlightY = 0;
  if (highlightHeight > 0) {
    yCursor += 0.06;
    highlightY = yCursor;
    yCursor += highlightHeight;
  }

  const height = Math.max(0.95, yCursor + 0.12);

  return {
    title,
    description,
    highlight,
    called,
    cycleTime,
    projectTeam,
    height,
    titleY,
    titleHeight,
    descriptionY,
    descriptionHeight,
    cycleTimeY,
    cycleTimeHeight,
    projectTeamY,
    projectTeamHeight,
    highlightY,
    highlightHeight,
  };
}

function splitActivitiesForPpt(activities) {
  const maxBottom = 6.75;
  const startY = 1.15;
  const gap = 0.12;
  const pages = [];

  let current = [];
  let yCursor = startY;

  activities.forEach((activity) => {
    const layout = getActivityPptLayout(activity);
    const neededBottom = yCursor + layout.height;

    if (current.length > 0 && neededBottom > maxBottom) {
      pages.push(current);
      current = [{ activity, layout }];
      yCursor = startY + layout.height + gap;
      return;
    }

    current.push({ activity, layout });
    yCursor += layout.height + gap;
  });

  if (current.length) pages.push(current);
  return pages;
}

function isRoadmapSectionName(name) {
  return safeText(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .includes("roadmap");
}

function roadmapDifficultyStyle(difficulty) {
  const key = String(difficulty || "").toLowerCase();
  if (key === "low") {
    return {
      label: "Baixa complexidade",
      fill: "EEF7F1",
      line: "8CBFA0",
      text: "2D6A43",
    };
  }
  if (key === "high") {
    return {
      label: "Alta complexidade",
      fill: "F9EEF0",
      line: "D79AA3",
      text: "8D2F3B",
    };
  }
  return {
    label: "Média complexidade",
    fill: "FFF6EA",
    line: "E2BE82",
    text: "8D640B",
  };
}

function roadmapItemsFromSections(sections = []) {
  const roadmapSection = sections.find((section) => isRoadmapSectionName(section?.name));
  if (!roadmapSection) return [];

  return sortActivitiesByPosition(roadmapSection.activities || []).map((item) => ({
    title: truncateRoadmapText(safeText(item?.title) || "", 35),
    subtitle: truncateRoadmapText(safeText(item?.subtitle) || "", 35),
    impact: truncateRoadmapText(preserveMultiline(item?.impact || item?.benefit || item?.activity) || "", 180),
    cycleImplantation: truncateRoadmapText(safeText(item?.cycleImplantation) || "", 35),
    difficulty: String(item?.difficulty || "").toLowerCase(),
    category: safeText(item?.category) || "",
  }));
}

function addPptWatermark(slide, text) {
  if (!text) return;
  slide.addText(text, {
    x: 2.0,
    y: 3.0,
    w: 8,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 40,
    bold: true,
    color: "E5EBF1",
    rotate: 330,
    align: "center",
    transparency: 65,
  });
}

function hexToRgb(hex) {
  const raw = String(hex || "000000").replace("#", "");
  const normalized = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return [
    parseInt(normalized.slice(0, 2), 16) || 0,
    parseInt(normalized.slice(2, 4), 16) || 0,
    parseInt(normalized.slice(4, 6), 16) || 0,
  ];
}

function setFillFromHex(doc, hex) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDrawFromHex(doc, hex) {
  const [r, g, b] = hexToRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setTextFromHex(doc, hex) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

export async function exportDashboardPdf({
  startDate,
  endDate,
  ticketSummary,
  sections,
  options = {},
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const pdfMode = options.mode === "print" ? "print" : "standard";
  const periodText = formatPeriod(startDate, endDate);
  const syncText = `Sincronização: SULTS API Service | ${formatSyncTimestamp()}`;
  const sectionKpis = manualSectionKpis(sections);
  const rows = statusRows(ticketSummary);
  const orderedSections = (sections || []).map((section) => ({
    name: safeText(section?.name) || "Secao",
    activities: sortActivitiesByPosition(section?.activities || []),
  }));

  const operationalTotal = Number(ticketSummary?.total || 0);
  const repactTotal = Math.max(Number(ticketSummary?.totalCombined || 0) - operationalTotal, 0);
  const manualTotal = sectionKpis.reduce((acc, cur) => acc + cur.total, 0);
  const consolidatedTotal = Math.max(operationalTotal + manualTotal, 0);
  const dynamic = buildDynamicPptNarrative(rows, operationalTotal, repactTotal, sectionKpis);

  doc.setProperties({
    title: `Performance Dashboard ${periodText}`,
    subject: `Relatório semanal (${pdfMode})`,
    author: "Performance Dashboard",
    keywords: "dashboard, pdf, semanal, chamados",
  });

  function drawFooterOnAllPages() {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setTextFromHex(doc, "7A8792");
      doc.text(syncText, margin, pageHeight - 18);
      doc.text(`Página ${page}/${totalPages}`, pageWidth - margin, pageHeight - 18, { align: "right" });
    }
  }

  let y = 0;

  function ensureSpace(requiredHeight) {
    if (y + requiredHeight <= pageHeight - 44) return;
    doc.addPage();
    y = margin;
  }

  function startChapter(title, subtitle) {
    doc.addPage();
    y = margin;

    setFillFromHex(doc, "EAF3FB");
    setDrawFromHex(doc, "CFE1EE");
    doc.roundedRect(margin, y, maxWidth, 44, 8, 8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    setTextFromHex(doc, PPT_THEME.baseDark);
    doc.text(title, margin + 12, y + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setTextFromHex(doc, PPT_THEME.textMuted);
    doc.text(subtitle, margin + 12, y + 34);

    y += 58;
  }

  // CAPA (pagina dedicada)
  setFillFromHex(doc, PPT_THEME.sapBlue);
  doc.rect(0, 0, pageWidth, 118, "F");
  setFillFromHex(doc, PPT_THEME.attentionOrange);
  doc.rect(margin, 78, 180, 2.5, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  setTextFromHex(doc, PPT_THEME.white);
  doc.text("Performance Dashboard", margin, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Relatório executivo de operações e sustentação", margin, 68);
  doc.text(`Período analisado: ${periodText}`, margin, 94);

  setFillFromHex(doc, "FFFFFF");
  setDrawFromHex(doc, "D6E1EA");
  doc.roundedRect(margin, 152, maxWidth, 110, 10, 10, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setTextFromHex(doc, PPT_THEME.baseDark);
  doc.text("Mensagem executiva", margin + 14, 176);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  setTextFromHex(doc, "4F5F6D");
  doc.text(doc.splitTextToSize(dynamic.message, maxWidth - 28), margin + 14, 198);

  // SUMARIO (pagina dedicada)
  startChapter("Sumário executivo", "Visão geral dos capítulos e seções do relatório");

  const chapterRows = [
    { title: "Capa", detail: "Contexto e período analisado" },
    { title: "Sumário executivo", detail: "Estrutura e distribuição das seções" },
    { title: "Métricas estratégicas", detail: "KPI consolidado, operacionais e atividades" },
    { title: "Painel de status (SULTS)", detail: "Distribuição de volume e prazos renegociados por status" },
    { title: "Atividades por seção", detail: "Detalhamento por tema" },
  ];

  chapterRows.forEach((item) => {
    ensureSpace(30);
    setFillFromHex(doc, "FFFFFF");
    setDrawFromHex(doc, "D6E1EA");
    doc.roundedRect(margin, y, maxWidth, 24, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setTextFromHex(doc, PPT_THEME.baseDark);
    doc.text(item.title, margin + 10, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTextFromHex(doc, PPT_THEME.textMuted);
    doc.text(item.detail, margin + 220, y + 16);
    y += 30;
  });

  ensureSpace(26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  setTextFromHex(doc, PPT_THEME.baseDark);
  doc.text("Seções monitoradas", margin, y + 12);
  y += 20;

  orderedSections.forEach((section) => {
    ensureSpace(30);
    setFillFromHex(doc, "FFFFFF");
    setDrawFromHex(doc, "D6E1EA");
    doc.roundedRect(margin, y, maxWidth, 24, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setTextFromHex(doc, PPT_THEME.baseDark);
    doc.text(section.name, margin + 10, y + 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTextFromHex(doc, PPT_THEME.textMuted);
    doc.text(`Atividades: ${section.activities.length}`, margin + maxWidth - 160, y + 16);
    y += 30;
  });

  // CAPITULO: KPIs
  startChapter("Métricas estratégicas", "Indicadores de desempenho consolidados");

  const kpiCards = [
    {
      labelLine1: "Indicador consolidado",
      labelLine2: "Volume + atividades",
      value: consolidatedTotal,
      fill: "EAF3FB",
      border: "C6DBEC",
      valueColor: PPT_THEME.sapBlue,
    },
    {
      labelLine1: "Volume operacional",
      labelLine2: "Chamados ativos",
      value: operationalTotal,
      fill: "FFFFFF",
      border: "D7E2EA",
      valueColor: PPT_THEME.sapBlue,
    },
    {
      labelLine1: "Prazos renegociados",
      labelLine2: "Impacto de prazo",
      value: repactTotal,
      fill: "FFF2E7",
      border: "F5C9A8",
      valueColor: PPT_THEME.attentionOrange,
    },
    ...sectionKpis.map((kpi) => ({
      labelLine1: "Total de atividades",
      labelLine2: kpi.name,
      value: kpi.total,
      fill: "FFFFFF",
      border: "D7E2EA",
      valueColor: PPT_THEME.baseDark,
    })),
  ];

  const cardGap = 12;
  const cardWidth = (maxWidth - cardGap) / 2;
  const cardHeight = 70;

  for (let i = 0; i < kpiCards.length; i += 2) {
    ensureSpace(cardHeight + 10);

    for (let col = 0; col < 2; col += 1) {
      const card = kpiCards[i + col];
      if (!card) continue;

      const x = margin + col * (cardWidth + cardGap);
      setFillFromHex(doc, card.fill);
      setDrawFromHex(doc, card.border);
      doc.roundedRect(x, y, cardWidth, cardHeight, 8, 8, "FD");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextFromHex(doc, PPT_THEME.textMuted);
      doc.text(card.labelLine1, x + 12, y + 18);
      doc.text(card.labelLine2, x + 12, y + 32);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);
      setTextFromHex(doc, card.valueColor);
      doc.text(String(card.value), x + cardWidth - 12, y + 46, { align: "right" });
    }

    y += cardHeight + 10;
  }

  // CAPITULO: STATUS
  startChapter("Painel de status (SULTS)", "Volume principal e prazos renegociados por status");

  rows.forEach((row) => {
    ensureSpace(28);
    setFillFromHex(doc, "FFFFFF");
    setDrawFromHex(doc, "D6E1EA");
    doc.roundedRect(margin, y, maxWidth, 24, 6, 6, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setTextFromHex(doc, PPT_THEME.baseDark);
    doc.text(safeText(row.status) || "Status", margin + 10, y + 16);

    doc.setFont("helvetica", "bold");
    doc.text(`Volume: ${row.primary}`, margin + maxWidth - 120, y + 16);

    y += 30;
  });

  ensureSpace(130);
  setFillFromHex(doc, "FFFFFF");
  setDrawFromHex(doc, "D6E1EA");
  doc.roundedRect(margin, y, maxWidth, 54, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setTextFromHex(doc, PPT_THEME.baseDark);
  doc.text("Mensagem-chave", margin + 12, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setTextFromHex(doc, "4F5F6D");
  doc.text(doc.splitTextToSize(dynamic.message, maxWidth - 24), margin + 12, y + 34);
  y += 62;

  setFillFromHex(doc, "FFFFFF");
  setDrawFromHex(doc, "D6E1EA");
  doc.roundedRect(margin, y, maxWidth, 54, 8, 8, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setTextFromHex(doc, PPT_THEME.baseDark);
  doc.text("Destaque técnico", margin + 12, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setTextFromHex(doc, "4F5F6D");
  doc.text(doc.splitTextToSize(dynamic.technicalRead, maxWidth - 24), margin + 12, y + 34);
  // CAPITULO: ATIVIDADES
  startChapter("Atividades por seção", "Detalhamento das entregas registradas");

  for (const section of orderedSections) {
    const activities = section.activities;
    const sectionName = section.name;

    ensureSpace(30);
    setFillFromHex(doc, "EAF3FB");
    setDrawFromHex(doc, "CFE1EE");
    doc.roundedRect(margin, y, maxWidth, 24, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setTextFromHex(doc, PPT_THEME.baseDark);
    doc.text(`${sectionName} (${activities.length})`, margin + 10, y + 16);
    y += 30;

    if (!activities.length) {
      ensureSpace(20);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      setTextFromHex(doc, PPT_THEME.textMuted);
      doc.text("Nenhuma atividade registrada.", margin + 10, y + 12);
      y += 20;
      continue;
    }

    for (const activity of activities) {
      const title = safeText(activity?.title) || "Atividade";
      const description = preserveMultiline(activity?.activity) || "Sem descrição.";
      const highlight = preserveMultiline(activity?.highlight);
      const called = String(activity?.called || "").replace(/\D+/g, "");
      const cycleImplantation = safeText(activity?.cycleImplantation);
      const cycleTime = safeText(activity?.cycleTime);
      const projectTeam = Array.isArray(activity?.projectTeam)
        ? activity.projectTeam.map((item) => safeText(item)).filter(Boolean).join(", ")
        : "";

      const titleLines = doc.splitTextToSize(title, maxWidth - 44);
      const descLines = splitPdfTextPreserveBreaks(doc, description, maxWidth - 44);
      const calledLines = called
        ? splitPdfTextPreserveBreaks(doc, `Chamado: ${called}`, maxWidth - 44)
        : [];
      const cycleTimeLines = cycleTime
        ? splitPdfTextPreserveBreaks(doc, `Tempo de Ciclo (Cycle Time): ${cycleTime}`, maxWidth - 44)
        : [];
      const cycleImplantationLines = cycleImplantation
        ? splitPdfTextPreserveBreaks(doc, `Ciclo de Implantação: ${cycleImplantation}`, maxWidth - 44)
        : [];
      const projectTeamLines = projectTeam
        ? splitPdfTextPreserveBreaks(doc, `Equipe do Projeto: ${projectTeam}`, maxWidth - 44)
        : [];
      const highlightLines = highlight
        ? splitPdfTextPreserveBreaks(doc, `Pontos a Destacar: ${highlight}`, maxWidth - 44)
        : [];
      const blockHeight =
        18 +
        titleLines.length * 11 +
        (calledLines.length ? calledLines.length * 10 + 4 : 0) +
        descLines.length * 11 +
        (cycleTimeLines.length ? cycleTimeLines.length * 10 + 4 : 0) +
        (cycleImplantationLines.length ? cycleImplantationLines.length * 10 + 4 : 0) +
        (projectTeamLines.length ? projectTeamLines.length * 10 + 4 : 0) +
        (highlightLines.length ? highlightLines.length * 10 + 6 : 0) +
        12;

      ensureSpace(blockHeight + 8);
      setFillFromHex(doc, "FFFFFF");
      setDrawFromHex(doc, "D6E1EA");
      doc.roundedRect(margin, y, maxWidth, blockHeight, 6, 6, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      setTextFromHex(doc, PPT_THEME.baseDark);
      doc.text(titleLines, margin + 12, y + 16);

      let textY = y + 16 + titleLines.length * 11;
      if (calledLines.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        setTextFromHex(doc, PPT_THEME.sapBlue);
        doc.text(calledLines, margin + 12, textY + 1);
        textY += calledLines.length * 10 + 4;
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextFromHex(doc, "4F5F6D");
      doc.text(descLines, margin + 12, textY);
      textY += descLines.length * 11;

      if (cycleTimeLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        setTextFromHex(doc, PPT_THEME.baseDark);
        doc.text(cycleTimeLines, margin + 12, textY + 4);
        textY += cycleTimeLines.length * 10 + 4;
      }

      if (cycleImplantationLines.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        setTextFromHex(doc, PPT_THEME.baseDark);
        doc.text(cycleImplantationLines, margin + 12, textY + 4);
        textY += cycleImplantationLines.length * 10 + 4;
      }

      if (projectTeamLines.length) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        setTextFromHex(doc, PPT_THEME.sapBlue);
        doc.text(projectTeamLines, margin + 12, textY + 4);
        textY += projectTeamLines.length * 10 + 4;
      }

      if (highlightLines.length) {
        setTextFromHex(doc, PPT_THEME.attentionOrange);
        doc.text(highlightLines, margin + 12, textY + 4);
      }

      y += blockHeight + 8;
    }
  }

  ensureSpace(104);
  dynamic.closingBlocks.forEach((block) => {
    ensureSpace(84);
    setFillFromHex(doc, "FFFFFF");
    setDrawFromHex(doc, "D6E1EA");
    doc.roundedRect(margin, y, maxWidth, 76, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setTextFromHex(doc, PPT_THEME.sapBlue);
    doc.text(block.title, margin + 12, y + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setTextFromHex(doc, "4F5F6D");
    doc.text(doc.splitTextToSize(block.text, maxWidth - 24), margin + 12, y + 36);
    y += 84;
  });

  startChapter("Apêndice de dados", "Resumo bruto de status e atividades por seção");

  ensureSpace(24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setTextFromHex(doc, PPT_THEME.baseDark);
  doc.text("Status monitorados", margin, y + 12);
  y += 20;

  rows.forEach((row) => {
    ensureSpace(22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTextFromHex(doc, "4F5F6D");
    doc.text(
      `${safeText(row.status)} | Volume: ${row.primary}`,
      margin,
      y + 12
    );
    y += 20;
  });

  ensureSpace(24);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  setTextFromHex(doc, PPT_THEME.baseDark);
  doc.text("Atividades por seção", margin, y + 12);
  y += 20;

  orderedSections.forEach((section) => {
    ensureSpace(22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTextFromHex(doc, "4F5F6D");
    doc.text(`${section.name}: ${section.activities.length}`, margin, y + 12);
    y += 20;
  });

  drawFooterOnAllPages();

  const pdfSuffix = pdfMode === "print" ? "-impressao" : "";
  doc.save(`performance-dashboard-${startDate || "inicio"}-${endDate || "fim"}${pdfSuffix}.pdf`);
}

// ---------------------------------------------------------------------------
// PowerPoint — tema luxury dark (mesmo do dashboard e do deck do redesign).
// Base preto royal, acentos ouro e azul, Playfair Display + Sora.
// ---------------------------------------------------------------------------

const LX = {
  bg: "07080D",
  panel: "0D0F18",
  panel2: "0A0D16",
  line: "232734",
  gold: "D4AF37",
  goldL: "E8C96A",
  blue: "2B4FD8",
  blueL: "5A7BFF",
  deep: "16225C",
  ink: "FFFFFF",
  body: "E9EBF2",
  muted: "9AA1B5",
  dim: "6D7488",
  danger: "FF8D97",
  ok: "6FD898",
};

const TITLE_FONT = "Playfair Display";
const BODY_FONT = "Sora";

const SLIDE_W = 13.33;
const SLIDE_H = 7.5;
const PAD = 0.75;
const CONTENT_W = SLIDE_W - PAD * 2;

function formatDurationPpt(milliseconds) {
  if (milliseconds == null || Number.isNaN(Number(milliseconds))) return "—";
  const totalMinutes = Math.round(Number(milliseconds) / 60000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

function chunkList(items, size) {
  const pages = [];
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size));
  return pages;
}

export async function exportDashboardPptx({
  startDate,
  endDate,
  ticketSummary,
  sections,
  options = {},
}) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Performance Dashboard";
  pptx.subject = "Relatório semanal";
  pptx.title = "Performance Dashboard";

  const watermarkEnabled = Boolean(options.watermark);
  const syncText = `Sincronização: SULTS API Service | ${formatSyncTimestamp()}`;

  const sectionKpis = manualSectionKpis(sections);
  const manualTotal = sectionKpis.reduce((acc, item) => acc + item.total, 0);
  const operationalTotal = Number(ticketSummary?.total || 0);
  const renegotiated = Math.max(
    Number(
      ticketSummary?.renegotiated ?? Number(ticketSummary?.totalCombined || 0) - operationalTotal
    ),
    0
  );
  const consolidated = operationalTotal + manualTotal;
  const rows = statusRows(ticketSummary);
  const metrics = ticketSummary?.metrics || null;

  // ---------- helpers de desenho ----------
  function newSlide() {
    const slide = pptx.addSlide();
    slide.background = { color: LX.bg };
    return slide;
  }

  function footer(slide) {
    slide.addText(syncText, {
      x: PAD,
      y: 6.95,
      w: CONTENT_W,
      h: 0.3,
      fontFace: BODY_FONT,
      fontSize: 9,
      color: LX.dim,
    });
  }

  function header(slide, { eyebrow, title, number }) {
    if (number) {
      slide.addText(number, {
        x: PAD,
        y: 0.55,
        w: 1.05,
        h: 0.95,
        fontFace: TITLE_FONT,
        fontSize: 32,
        color: LX.gold,
        valign: "bottom",
      });
    }
    const left = number ? PAD + 1.1 : PAD;
    const width = CONTENT_W - (number ? 1.1 : 0);
    slide.addText(String(eyebrow || "").toUpperCase(), {
      x: left,
      y: 0.58,
      w: width,
      h: 0.28,
      fontFace: BODY_FONT,
      fontSize: 10,
      bold: true,
      color: LX.gold,
      charSpacing: 3,
    });
    slide.addText(safeText(title), {
      x: left,
      y: 0.88,
      w: width,
      h: 0.8,
      fontFace: TITLE_FONT,
      fontSize: 30,
      color: LX.ink,
    });
  }

  function panel(slide, { x, y, w, h, fill = LX.panel, border = LX.line }) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: fill },
      line: { color: border, pt: 1 },
      rectRadius: 0.06,
    });
  }

  function accentBar(slide, { x, y, w = 0.55, h = 0.05, color = LX.blue }) {
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color }, line: { color, pt: 0 } });
  }

  // ---------- 1. CAPA ----------
  const cover = newSlide();
  cover.addText("RELATÓRIO SEMANAL", {
    x: 0,
    y: 2.15,
    w: SLIDE_W,
    h: 0.35,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 12,
    bold: true,
    color: LX.gold,
    charSpacing: 7,
  });
  cover.addText(
    [
      { text: "Apresentação de ", options: { color: LX.ink } },
      { text: "Atividades", options: { color: LX.goldL, italic: true } },
    ],
    {
      x: 0,
      y: 2.6,
      w: SLIDE_W,
      h: 1.05,
      align: "center",
      fontFace: TITLE_FONT,
      fontSize: 46,
    }
  );
  cover.addText("Central de inteligência operacional", {
    x: 0,
    y: 3.72,
    w: SLIDE_W,
    h: 0.4,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 15,
    color: LX.muted,
  });

  const pillW = 4.9;
  const pillX = (SLIDE_W - pillW) / 2;
  cover.addShape(pptx.ShapeType.roundRect, {
    x: pillX,
    y: 4.42,
    w: pillW,
    h: 0.66,
    fill: { color: LX.panel },
    line: { color: LX.gold, pt: 1 },
    rectRadius: 0.5,
  });
  cover.addText(`${formatDateToBr(startDate)}    →    ${formatDateToBr(endDate)}`, {
    x: pillX,
    y: 4.42,
    w: pillW,
    h: 0.66,
    align: "center",
    valign: "middle",
    fontFace: BODY_FONT,
    fontSize: 13,
    color: LX.body,
  });
  cover.addText("</>  Christian Silveira", {
    x: 0,
    y: 6.5,
    w: SLIDE_W,
    h: 0.3,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 11,
    color: LX.dim,
  });
  if (watermarkEnabled) addPptWatermark(cover, "CONFIDENCIAL");
  footer(cover);

  // ---------- 2. RESUMO EXECUTIVO ----------
  const summary = newSlide();
  header(summary, { eyebrow: "Visão consolidada", title: "Resumo Executivo" });

  const gap = 0.3;
  const unit = (CONTENT_W - gap * 3) / 4.35;
  const kpiY = 2.35;
  const kpiH = 2.5;
  const wide = unit * 1.35;

  panel(summary, { x: PAD, y: kpiY, w: wide, h: kpiH, fill: LX.deep, border: LX.gold });
  summary.addText("INDICADOR CONSOLIDADO", {
    x: PAD + 0.35,
    y: kpiY + 0.35,
    w: wide - 0.7,
    h: 0.3,
    fontFace: BODY_FONT,
    fontSize: 10,
    color: "C9D2FF",
    charSpacing: 2,
  });
  summary.addText(String(consolidated), {
    x: PAD + 0.35,
    y: kpiY + 0.75,
    w: wide - 0.7,
    h: 1.05,
    fontFace: TITLE_FONT,
    fontSize: 46,
    color: LX.goldL,
  });
  summary.addText("chamados + atividades no período", {
    x: PAD + 0.35,
    y: kpiY + 1.85,
    w: wide - 0.7,
    h: 0.3,
    fontFace: BODY_FONT,
    fontSize: 10,
    color: "8D97C8",
  });

  const smallCards = [
    { label: "Volume Operacional", value: operationalTotal, accent: LX.blue },
    { label: "Prazos Renegociados", value: renegotiated, accent: LX.gold },
    { label: "Atividades Registradas", value: manualTotal, accent: LX.blue },
  ];
  smallCards.forEach((item, index) => {
    const x = PAD + wide + gap + index * (unit + gap);
    panel(summary, { x, y: kpiY, w: unit, h: kpiH });
    summary.addText(item.label, {
      x: x + 0.3,
      y: kpiY + 0.35,
      w: unit - 0.6,
      h: 0.5,
      fontFace: BODY_FONT,
      fontSize: 11,
      color: LX.muted,
    });
    summary.addText(String(item.value), {
      x: x + 0.3,
      y: kpiY + 0.95,
      w: unit - 0.6,
      h: 0.85,
      fontFace: BODY_FONT,
      fontSize: 34,
      bold: true,
      color: LX.ink,
    });
    accentBar(summary, { x: x + 0.3, y: kpiY + 1.9, color: item.accent });
  });
  if (watermarkEnabled) addPptWatermark(summary, "CONFIDENCIAL");
  footer(summary);

  // ---------- 3. CHAMADOS SULTS ----------
  const statusSlide = newSlide();
  header(statusSlide, { eyebrow: "Suporte · sincronização SULTS", title: "Chamados SULTS" });

  const cols = 3;
  const cardGap = 0.28;
  const cardW = (CONTENT_W - cardGap * (cols - 1)) / cols;
  const cardH = 1.55;
  rows.slice(0, 6).forEach((row, index) => {
    const col = index % cols;
    const line = Math.floor(index / cols);
    const x = PAD + col * (cardW + cardGap);
    const y = 2.45 + line * (cardH + cardGap);
    const isGold = normalizeText(row.status).includes("conclu");
    panel(statusSlide, {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: LX.panel,
      border: isGold ? LX.gold : LX.blue,
    });
    statusSlide.addText(safeText(row.status), {
      x: x + 0.3,
      y: y + 0.28,
      w: cardW - 0.6,
      h: 0.45,
      fontFace: BODY_FONT,
      fontSize: 12,
      color: isGold ? LX.goldL : LX.muted,
    });
    statusSlide.addText(String(row.primary), {
      x: x + 0.3,
      y: y + 0.72,
      w: cardW - 0.6,
      h: 0.6,
      fontFace: BODY_FONT,
      fontSize: 28,
      bold: true,
      color: isGold ? LX.goldL : LX.ink,
    });
  });
  statusSlide.addText(
    `${operationalTotal} chamados no período · ${renegotiated} com prazo renegociado`,
    {
      x: PAD,
      y: 6.35,
      w: CONTENT_W,
      h: 0.35,
      fontFace: BODY_FONT,
      fontSize: 12,
      color: LX.muted,
    }
  );
  if (watermarkEnabled) addPptWatermark(statusSlide, "CONFIDENCIAL");
  footer(statusSlide);

  // ---------- 4. INDICADORES DE ATENDIMENTO ----------
  if (metrics) {
    const slaSlide = newSlide();
    header(slaSlide, { eyebrow: "Qualidade do atendimento", title: "Indicadores de Atendimento" });

    const items = [
      {
        label: "Tempo de 1ª Resposta",
        value: formatDurationPpt(metrics.firstResponseMs),
        sub: `média · ${Number(metrics.firstResponseCount || 0)} chamados`,
        accent: LX.blue,
      },
      {
        label: "Tempo de Resolução",
        value: formatDurationPpt(metrics.resolutionMs),
        sub: `média · ${Number(metrics.resolutionCount || 0)} resolvidos`,
        accent: LX.blue,
      },
      {
        label: "Cumprimento de SLA",
        value: metrics.slaPct == null ? "—" : `${metrics.slaPct}%`,
        sub: `${Number(metrics.slaWithin || 0)}/${Number(metrics.slaTotal || 0)} no prazo`,
        accent: LX.gold,
      },
      {
        label: "Satisfação (CSAT)",
        value: metrics.csatAvg == null ? "—" : `${Number(metrics.csatAvg).toFixed(1)}/5`,
        sub: `${Number(metrics.csatCount || 0)} avaliações`,
        accent: LX.gold,
      },
      {
        label: "Taxa de Resolução",
        value: metrics.resolutionRatePct == null ? "—" : `${metrics.resolutionRatePct}%`,
        sub: `${Number(metrics.closedInPeriod || 0)} fechados · ${Number(metrics.openedInPeriod || 0)} abertos`,
        accent: LX.blue,
      },
    ];

    const mGap = 0.25;
    const mW = (CONTENT_W - mGap * 4) / 5;
    items.forEach((item, index) => {
      const x = PAD + index * (mW + mGap);
      const y = 2.6;
      panel(slaSlide, { x, y, w: mW, h: 2.1 });
      slaSlide.addText(item.label, {
        x: x + 0.22,
        y: y + 0.25,
        w: mW - 0.44,
        h: 0.5,
        fontFace: BODY_FONT,
        fontSize: 10.5,
        color: LX.muted,
      });
      slaSlide.addText(item.value, {
        x: x + 0.22,
        y: y + 0.78,
        w: mW - 0.44,
        h: 0.6,
        fontFace: TITLE_FONT,
        fontSize: 24,
        color: LX.ink,
      });
      accentBar(slaSlide, { x: x + 0.22, y: y + 1.42, w: 0.45, color: item.accent });
      slaSlide.addText(item.sub, {
        x: x + 0.22,
        y: y + 1.55,
        w: mW - 0.44,
        h: 0.4,
        fontFace: BODY_FONT,
        fontSize: 9,
        color: LX.dim,
      });
    });
    if (watermarkEnabled) addPptWatermark(slaSlide, "CONFIDENCIAL");
    footer(slaSlide);
  }

  // ---------- 5..N. SEÇÕES DE ATIVIDADES ----------
  const populatedSections = (sections || []).filter(
    (section) =>
      !isRoadmapSectionName(section?.name) &&
      Array.isArray(section.activities) &&
      section.activities.length > 0
  );

  populatedSections.forEach((section, sectionIndex) => {
    const activities = sortActivitiesByPosition(section.activities || []);
    const pages = chunkList(activities, 4);

    pages.forEach((pageItems, pageIndex) => {
      const slide = newSlide();
      header(slide, {
        eyebrow: "Seção de atividades",
        title: section.name,
        number: String(sectionIndex + 1).padStart(2, "0"),
      });
      if (pages.length > 1) {
        slide.addText(`${pageIndex + 1}/${pages.length}`, {
          x: SLIDE_W - PAD - 1,
          y: 0.88,
          w: 1,
          h: 0.4,
          align: "right",
          fontFace: BODY_FONT,
          fontSize: 11,
          color: LX.dim,
        });
      }

      const aGap = 0.3;
      const aW = (CONTENT_W - aGap) / 2;
      const aH = 2.05;

      pageItems.forEach((activity, index) => {
        const col = index % 2;
        const line = Math.floor(index / 2);
        const x = PAD + col * (aW + aGap);
        const y = 2.35 + line * (aH + aGap);
        const highlight = safeText(activity?.highlight);
        const accent = highlight ? LX.gold : LX.blue;

        panel(slide, { x, y, w: aW, h: aH });
        // barra de acento à esquerda
        slide.addShape(pptx.ShapeType.rect, {
          x,
          y,
          w: 0.06,
          h: aH,
          fill: { color: accent },
          line: { color: accent, pt: 0 },
        });

        slide.addText(safeText(activity?.title) || "Atividade", {
          x: x + 0.35,
          y: y + 0.22,
          w: aW - 0.7,
          h: 0.45,
          fontFace: BODY_FONT,
          fontSize: 14,
          bold: true,
          color: LX.ink,
        });
        slide.addText(preserveMultiline(activity?.activity) || "", {
          x: x + 0.35,
          y: y + 0.72,
          w: aW - 0.7,
          h: highlight ? 0.62 : 1.05,
          fontFace: BODY_FONT,
          fontSize: 11,
          color: LX.muted,
          valign: "top",
        });

        const chips = [];
        if (safeText(activity?.called)) chips.push(`Chamado ${safeText(activity.called)}`);
        if (safeText(activity?.cycleTime)) chips.push(`Cycle Time: ${safeText(activity.cycleTime)}`);
        if (Array.isArray(activity?.projectTeam) && activity.projectTeam.length) {
          chips.push(`Equipe: ${activity.projectTeam.join(", ")}`);
        }
        if (chips.length) {
          slide.addText(chips.join("   ·   "), {
            x: x + 0.35,
            y: y + (highlight ? 1.36 : 1.5),
            w: aW - 0.7,
            h: 0.3,
            fontFace: BODY_FONT,
            fontSize: 9,
            color: LX.blueL,
          });
        }
        if (highlight) {
          slide.addText(`★ ${highlight}`, {
            x: x + 0.35,
            y: y + 1.62,
            w: aW - 0.7,
            h: 0.36,
            fontFace: BODY_FONT,
            fontSize: 9.5,
            color: LX.goldL,
          });
        }
      });

      if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
      footer(slide);
    });
  });

  // ---------- ROADMAP ----------
  const roadmapItems = roadmapItemsFromSections(sections);
  if (roadmapItems.length) {
    const pages = chunkList(roadmapItems, 3);
    pages.forEach((pageItems, pageIndex) => {
      const slide = newSlide();
      header(slide, { eyebrow: "Próximos passos", title: "Roadmap de Ações" });
      if (pages.length > 1) {
        slide.addText(`${pageIndex + 1}/${pages.length}`, {
          x: SLIDE_W - PAD - 1,
          y: 0.88,
          w: 1,
          h: 0.4,
          align: "right",
          fontFace: BODY_FONT,
          fontSize: 11,
          color: LX.dim,
        });
      }

      const rGap = 0.28;
      const rW = (CONTENT_W - rGap * 2) / 3;
      const rH = 3.6;
      pageItems.forEach((item, index) => {
        const x = PAD + index * (rW + rGap);
        const y = 2.4;
        const diffColor =
          item.difficulty === "high" ? LX.danger : item.difficulty === "low" ? LX.ok : LX.goldL;
        const diffLabel =
          item.difficulty === "high" ? "Alta" : item.difficulty === "low" ? "Baixa" : "Média";

        panel(slide, { x, y, w: rW, h: rH, border: LX.gold });
        slide.addText(safeText(item.title) || "Item", {
          x: x + 0.3,
          y: y + 0.28,
          w: rW - 0.6,
          h: 0.6,
          fontFace: BODY_FONT,
          fontSize: 14,
          bold: true,
          color: LX.ink,
        });
        slide.addText(`Dificuldade: ${diffLabel}${item.category ? `  ·  ${item.category}` : ""}`, {
          x: x + 0.3,
          y: y + 0.92,
          w: rW - 0.6,
          h: 0.3,
          fontFace: BODY_FONT,
          fontSize: 9.5,
          color: diffColor,
        });
        if (item.subtitle) {
          slide.addText(item.subtitle, {
            x: x + 0.3,
            y: y + 1.28,
            w: rW - 0.6,
            h: 0.5,
            fontFace: BODY_FONT,
            fontSize: 10.5,
            italic: true,
            color: LX.muted,
          });
        }
        if (item.impact) {
          slide.addText(`Impacto: ${item.impact}`, {
            x: x + 0.3,
            y: y + 1.85,
            w: rW - 0.6,
            h: 1.2,
            fontFace: BODY_FONT,
            fontSize: 10.5,
            color: LX.body,
            valign: "top",
          });
        }
        if (item.cycleImplantation) {
          slide.addText(`Ciclo: ${item.cycleImplantation}`, {
            x: x + 0.3,
            y: y + 3.1,
            w: rW - 0.6,
            h: 0.3,
            fontFace: BODY_FONT,
            fontSize: 9.5,
            color: LX.dim,
          });
        }
      });
      if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
      footer(slide);
    });
  }

  // ---------- ENCERRAMENTO ----------
  const closing = newSlide();
  closing.addText("OBRIGADO", {
    x: 0,
    y: 2.9,
    w: SLIDE_W,
    h: 0.4,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 12,
    bold: true,
    color: LX.gold,
    charSpacing: 7,
  });
  closing.addText("Perguntas e próximos passos", {
    x: 0,
    y: 3.35,
    w: SLIDE_W,
    h: 0.9,
    align: "center",
    fontFace: TITLE_FONT,
    fontSize: 36,
    color: LX.ink,
  });
  closing.addText(`Período analisado: ${formatPeriodPpt(startDate, endDate)}`, {
    x: 0,
    y: 4.3,
    w: SLIDE_W,
    h: 0.4,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 13,
    color: LX.muted,
  });
  closing.addText("</>  Christian Silveira", {
    x: 0,
    y: 6.5,
    w: SLIDE_W,
    h: 0.3,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 11,
    color: LX.dim,
  });
  footer(closing);

  await pptx.writeFile({
    fileName: `performance-dashboard-${startDate || "inicio"}-${endDate || "fim"}.pptx`,
  });
}
