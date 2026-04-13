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
          ? `Repactuação identificada em ${repactTotal} chamados, exigindo acompanhamento preventivo de SLA.`
          : "Sem repactuação no período, manter observabilidade para preservar tendência.",
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
    { title: "Painel de status (SULTS)", detail: "Distribuição de volume e repactuação por status" },
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
      labelLine1: "Chamados com repactuação",
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
  startChapter("Painel de status (SULTS)", "Volume principal e repactuação por status");

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
    doc.text(`Volume: ${row.primary}`, margin + maxWidth - 180, y + 16);
    doc.setFont("helvetica", "normal");
    setTextFromHex(doc, PPT_THEME.textMuted);
    doc.text(`Repactuação: ${row.combined}`, margin + maxWidth - 88, y + 16);

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
      `${safeText(row.status)} | Volume: ${row.primary} | Repactuação: ${row.combined}`,
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

export async function exportDashboardPptx({
  startDate,
  endDate,
  ticketSummary,
  sections,
  options = {},
}) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const pptMode = options.mode === "executive" ? "executive" : "operational";
  const watermarkEnabled = Boolean(options.watermark);
  const density = options.density === "compact" ? "compact" : "comfortable";
  pptx.author = "Performance Dashboard";
  pptx.subject = "Relatório semanal";
  pptx.title = "Performance Dashboard";
  const syncText = `Sincronização: SULTS API Service | ${formatSyncTimestamp()}`;
  const periodText = formatPeriodPpt(startDate, endDate);
  const sectionKpis = manualSectionKpis(sections);
  const rows = statusRows(ticketSummary);
  const operationalTotal = Number(ticketSummary?.total || 0);
  const repactTotal = Math.max(Number(ticketSummary?.totalCombined || 0) - operationalTotal, 0);
  const donutValues = [Math.max(operationalTotal, 0), Math.max(repactTotal, 0)];
  const donutSum = donutValues[0] + donutValues[1];
  const efficiency = donutSum > 0 ? Math.round((operationalTotal / donutSum) * 100) : 0;
  const dynamic = buildDynamicPptNarrative(rows, operationalTotal, repactTotal, sectionKpis);

  const cover = pptx.addSlide();
  cover.background = { color: PPT_THEME.sapBlue };
  cover.addShape(pptx.ShapeType.line, {
    x: 0.8,
    y: 1.95,
    w: 4.6,
    h: 0,
    line: {
      color: PPT_THEME.attentionOrange,
      pt: 2,
    },
  });
  cover.addText("Performance Dashboard", {
    x: 0.8,
    y: 1.2,
    w: 10,
    h: 0.7,
    fontFace: "Segoe UI",
    fontSize: 40,
    bold: true,
    color: PPT_THEME.white,
  });
  cover.addText("Apresentação Executiva de Operações e Sustentação", {
    x: 0.8,
    y: 2.2,
    w: 10.5,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 16,
    color: "DCEAF2",
  });
  cover.addText(`Período analisado: ${periodText}`, {
    x: 0.8,
    y: 2.8,
    w: 10.5,
    h: 0.4,
    fontFace: "Segoe UI",
    fontSize: 13,
    color: "BFDCEB",
  });
  if (watermarkEnabled) addPptWatermark(cover, "CONFIDENCIAL");
  addStandardFooter(cover, syncText);

  const executiveSlide = pptx.addSlide();
  executiveSlide.background = { color: PPT_THEME.softBg };
  executiveSlide.addText("Visão Geral do Ciclo de Vida", {
    x: 0.7,
    y: 0.35,
    w: 6,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 24,
    bold: true,
    color: PPT_THEME.baseDark,
  });

  const lifecycleCards = [
    {
      title: "Entrada",
      subtitle: "Novos chamados e demandas recebidas",
      value: sumStatusByTokens(rows, ["novo"]),
      color: "DCEAF2",
    },
    {
      title: "Processamento",
      subtitle: "Fila ativa em andamento / aguardando",
      value: sumStatusByTokens(rows, ["andamento", "aguardando"]),
      color: "EAF3FB",
    },
    {
      title: "Saída",
      subtitle: "Resolvidos e concluídos no período",
      value: sumStatusByTokens(rows, ["resolvido", "concluido"]),
      color: "EDF6ED",
    },
  ];

  lifecycleCards.forEach((card, index) => {
    const x = 0.7 + index * 3.95;
    executiveSlide.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.15,
      w: 3.7,
      h: 2.3,
      radius: 0.08,
      fill: { color: card.color },
      line: { color: "C8D8E5", pt: 1 },
      shadow: {
        type: "outer",
        color: "B9C9D4",
        blur: 2,
        distance: 2,
        angle: 45,
        opacity: 0.2,
      },
    });
    executiveSlide.addText(card.title, {
      x: x + 0.2,
      y: 1.35,
      w: 2.4,
      h: 0.3,
      fontFace: "Segoe UI",
      fontSize: 15,
      bold: true,
      color: PPT_THEME.baseDark,
    });
    executiveSlide.addText(String(card.value), {
      x: x + 0.2,
      y: 1.7,
      w: 3.2,
      h: 0.7,
      fontFace: "Segoe UI",
      fontSize: 34,
      bold: true,
      color: PPT_THEME.sapBlue,
    });
    executiveSlide.addText(card.subtitle, {
      x: x + 0.2,
      y: 2.5,
      w: 3.2,
      h: 0.75,
      fontFace: "Segoe UI",
      fontSize: 10,
      color: PPT_THEME.textMuted,
      breakLine: true,
    });
  });
  executiveSlide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 3.8,
    w: 11.2,
    h: 2.2,
    radius: 0.06,
    fill: { color: "FFFFFF" },
    line: { color: "D6E1EA", pt: 1 },
  });
  executiveSlide.addText("Mensagem-chave", {
    x: 0.95,
    y: 4.05,
    w: 3,
    h: 0.3,
    fontFace: "Segoe UI",
    fontSize: 13,
    bold: true,
    color: PPT_THEME.baseDark,
  });
  executiveSlide.addText(
    dynamic.message,
    {
      x: 0.95,
      y: 4.42,
      w: 10.6,
      h: 1.25,
      fontFace: "Segoe UI",
      fontSize: 12,
      color: "4F5F6D",
      breakLine: true,
    }
  );
  addStandardFooter(executiveSlide, syncText);
  if (watermarkEnabled) addPptWatermark(executiveSlide, "CONFIDENCIAL");

  const metricsSlide = pptx.addSlide();
  metricsSlide.background = { color: PPT_THEME.softBg };
  metricsSlide.addText("Métricas Estratégicas", {
    x: 0.7,
    y: 0.35,
    w: 6,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 24,
    bold: true,
    color: PPT_THEME.baseDark,
  });

  const kpiCards = [
    {
      label: "Volume Operacional",
      sectionName: "",
      isManual: false,
      value: operationalTotal,
      fill: "FFFFFF",
      border: "C6DBEC",
      valueColor: PPT_THEME.sapBlue,
    },
    {
      label: "Total de Chamados com Repactuação de Prazos",
      sectionName: "",
      isManual: false,
      value: repactTotal,
      fill: "FFF2E7",
      border: "F5C9A8",
      valueColor: PPT_THEME.attentionOrange,
    },
    ...sectionKpis.map((kpi) => ({
      label: "Total de Atividades",
      sectionName: kpi.name,
      isManual: true,
      value: kpi.total,
      fill: "FFFFFF",
      border: "D7E2EA",
      valueColor: PPT_THEME.baseDark,
    })),
  ];

  kpiCards.forEach((card, index) => {
    const columns = 3;
    const row = Math.floor(index / columns);
    const col = index % columns;
    const x = 0.7 + col * 3.9;
    const y = 1.0 + row * 1.85;

    metricsSlide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w: 3.65,
      h: 1.6,
      radius: 0.06,
      fill: { color: card.fill },
      line: { color: card.border, pt: 1 },
      shadow: {
        type: "outer",
        color: "C6D3DD",
        blur: 1,
        distance: 1,
        angle: 45,
        opacity: 0.15,
      },
    });
    if (card.isManual) {
      metricsSlide.addText(card.label, {
        x: x + 0.18,
        y: y + 0.16,
        w: 3.25,
        h: 0.24,
        fontFace: "Segoe UI",
        fontSize: 10,
        color: PPT_THEME.textMuted,
      });
      metricsSlide.addText(card.sectionName, {
        x: x + 0.18,
        y: y + 0.4,
        w: 3.25,
        h: 0.38,
        fontFace: "Segoe UI",
        fontSize: 10,
        color: PPT_THEME.textMuted,
        breakLine: true,
      });
    } else {
      metricsSlide.addText(card.label, {
        x: x + 0.18,
        y: y + 0.18,
        w: 3.25,
        h: 0.62,
        fontFace: "Segoe UI",
        fontSize: 10,
        color: PPT_THEME.textMuted,
        breakLine: true,
      });
    }
    metricsSlide.addText(String(card.value), {
      x: x + 0.18,
      y: y + 0.84,
      w: 3.2,
      h: 0.55,
      fontFace: "Segoe UI",
      fontSize: 28,
      bold: true,
      color: card.valueColor,
    });
  });
  addStandardFooter(metricsSlide, syncText);
  if (watermarkEnabled) addPptWatermark(metricsSlide, "CONFIDENCIAL");

  const statusSlide = pptx.addSlide();
  statusSlide.background = { color: PPT_THEME.softBg };
  statusSlide.addText("Análise de Status (SULTS)", {
    x: 0.7,
    y: 0.35,
    w: 7,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 24,
    bold: true,
    color: PPT_THEME.baseDark,
  });

  const chartCategories = rows.map((row) => row.status);
  const chartPrimaryValues = rows.map((row) => row.primary);

  statusSlide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 1.0,
    w: 7.1,
    h: 5.5,
    radius: 0.05,
    fill: { color: "FFFFFF" },
    line: { color: "D6E1EA", pt: 1 },
  });
  statusSlide.addChart(
    pptx.ChartType.bar,
    [
      {
        name: "Volume",
        labels: chartCategories,
        values: chartPrimaryValues,
      },
    ],
    {
      x: 1.0,
      y: 1.35,
      w: 6.5,
      h: 4.9,
      barDir: "bar",
      barGrouping: "clustered",
      showLegend: false,
      catAxisLabelFontSize: 10,
      valAxisLabelFontSize: 10,
      valAxisMinVal: 0,
      valAxisMaxVal: Math.max(...chartPrimaryValues, 1) + 2,
      chartColors: [PPT_THEME.accentBlue],
      showValue: true,
      valGridLine: { color: "E5EDF3", pt: 1 },
    }
  );

  statusSlide.addShape(pptx.ShapeType.roundRect, {
    x: 8.1,
    y: 1.0,
    w: 3.8,
    h: 5.5,
    radius: 0.05,
    fill: { color: "FFFFFF" },
    line: { color: "D6E1EA", pt: 1 },
  });

  statusSlide.addText("Volume x Repactuação", {
    x: 8.35,
    y: 1.25,
    w: 3.3,
    h: 0.35,
    fontFace: "Segoe UI",
    fontSize: 12,
    bold: true,
    color: PPT_THEME.baseDark,
    align: "center",
  });

  statusSlide.addChart(
    pptx.ChartType.doughnut,
    [
      {
        name: "Distribuicao",
        labels: ["Volume Operacional", "Repactuação"],
        values: donutSum > 0 ? donutValues : [1, 0],
      },
    ],
    {
      x: 8.45,
      y: 1.75,
      w: 3.1,
      h: 3.1,
      showLegend: false,
      chartColors: [PPT_THEME.sapBlue, PPT_THEME.attentionOrange],
      holeSize: 68,
    }
  );

  statusSlide.addText(`${efficiency}%`, {
    x: 9.32,
    y: 2.95,
    w: 1.4,
    h: 0.4,
    fontFace: "Segoe UI",
    fontSize: 20,
    bold: true,
    color: PPT_THEME.baseDark,
    align: "center",
  });
  statusSlide.addText("eficiência", {
    x: 9.32,
    y: 3.33,
    w: 1.4,
    h: 0.2,
    fontFace: "Segoe UI",
    fontSize: 9,
    color: PPT_THEME.textMuted,
    align: "center",
  });
  statusSlide.addText(`Volume Operacional: ${operationalTotal}\nRepactuação: ${repactTotal}`, {
    x: 8.45,
    y: 5.0,
    w: 3.1,
    h: 0.8,
    fontFace: "Segoe UI",
    fontSize: 10,
    color: "425463",
    align: "center",
    breakLine: true,
  });
  addStandardFooter(statusSlide, syncText);
  if (watermarkEnabled) addPptWatermark(statusSlide, "CONFIDENCIAL");

  const technicalSlide = pptx.addSlide();
  technicalSlide.background = { color: PPT_THEME.softBg };
  technicalSlide.addText("Destaque Técnico", {
    x: 0.7,
    y: 0.35,
    w: 6,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 24,
    bold: true,
    color: PPT_THEME.baseDark,
  });
  technicalSlide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 1.1,
    w: 11.2,
    h: 2.4,
    radius: 0.05,
    fill: { color: "FFFFFF" },
    line: { color: "D6E1EA", pt: 1 },
  });
  technicalSlide.addText("Leitura Técnica da Semana", {
    x: 0.95,
    y: 1.35,
    w: 4.5,
    h: 0.3,
    fontFace: "Segoe UI",
    fontSize: 13,
    bold: true,
    color: PPT_THEME.baseDark,
  });
  technicalSlide.addText(
    dynamic.technicalRead,
    {
      x: 0.95,
      y: 1.75,
      w: 10.7,
      h: 1.4,
      fontFace: "Segoe UI",
      fontSize: 12,
      color: "4F5F6D",
      breakLine: true,
    }
  );

  technicalSlide.addShape(pptx.ShapeType.roundRect, {
    x: 0.7,
    y: 3.8,
    w: 11.2,
    h: 2.6,
    radius: 0.05,
    fill: { color: "FFFFFF" },
    line: { color: "D6E1EA", pt: 1 },
  });
  technicalSlide.addText("Indicadores de apoio", {
    x: 0.95,
    y: 4.05,
    w: 3,
    h: 0.3,
    fontFace: "Segoe UI",
    fontSize: 12,
    bold: true,
    color: PPT_THEME.baseDark,
  });
  const supportLines = [
    `Período analisado: ${periodText}`,
    `Total de status monitorados: ${rows.length}`,
    `Atividades manuais registradas: ${dynamic.manualTotal}`,
    `Chamados em destaque de atenção: ${dynamic.awaitingCount}`,
  ];
  technicalSlide.addText(
    supportLines.map((line) => ({ text: line, options: { bullet: { indent: 14 } } })),
    {
      x: 0.95,
      y: 4.45,
      w: 10.4,
      h: 1.8,
      fontFace: "Segoe UI",
      fontSize: 11,
      color: "4F5F6D",
      breakLine: true,
    }
  );
  addStandardFooter(technicalSlide, syncText);
  if (watermarkEnabled) addPptWatermark(technicalSlide, "CONFIDENCIAL");

  const populatedSections = (sections || []).filter(
    (section) =>
      !isRoadmapSectionName(section?.name) &&
      Array.isArray(section.activities) &&
      section.activities.length > 0
  );

  if (pptMode === "operational") {
    for (const section of populatedSections) {
      const activities = sortActivitiesByPosition(section.activities || []);
      const pages = splitActivitiesForPpt(activities);
      const densityGap = density === "compact" ? 0.08 : 0.12;

      pages.forEach((chunk, i) => {
        const slide = pptx.addSlide();
        slide.background = { color: PPT_THEME.softBg };

        const sectionName = safeText(section.name) || "Secao";
        const titleSuffix = pages.length > 1 ? ` (${i + 1}/${pages.length})` : "";
        slide.addText(`${sectionName}${titleSuffix}`, {
          x: 0.7,
          y: 0.35,
          w: 10.5,
          h: 0.5,
          fontFace: "Segoe UI",
          fontSize: 23,
          bold: true,
          color: PPT_THEME.baseDark,
        });
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 10.1,
          y: 0.35,
          w: 1.8,
          h: 0.6,
          radius: 0.08,
          fill: { color: "FFFFFF" },
          line: { color: "D6E1EA", pt: 1 },
        });
        slide.addText(String(activities.length), {
          x: 10.1,
          y: 0.45,
          w: 1.8,
          h: 0.25,
          fontFace: "Segoe UI",
          fontSize: 18,
          bold: true,
          color: PPT_THEME.sapBlue,
          align: "center",
        });
        slide.addText("atividades", {
          x: 10.1,
          y: 0.7,
          w: 1.8,
          h: 0.2,
          fontFace: "Segoe UI",
          fontSize: 8,
          color: PPT_THEME.textMuted,
          align: "center",
        });

      let yCursor = 1.15;
      chunk.forEach(({ layout }) => {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.7,
          y: yCursor,
          w: 11.2,
          h: layout.height,
          radius: 0.05,
          fill: { color: "FFFFFF" },
          line: { color: "D6E1EA", pt: 1 },
        });

        if (layout.called) {
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 9.15,
            y: yCursor + 0.1,
            w: 2.4,
            h: 0.45,
            radius: 0.05,
            fill: { color: "EAF3FB" },
            line: { color: "CFE1EE", pt: 1 },
          });
          slide.addText("Chamado", {
            x: 9.3,
            y: yCursor + 0.14,
            w: 2.1,
            h: 0.1,
            fontFace: "Segoe UI",
            fontSize: 8,
            bold: true,
            color: PPT_THEME.textMuted,
          });
          slide.addText(layout.called, {
            x: 9.3,
            y: yCursor + 0.27,
            w: 2.1,
            h: 0.18,
            fontFace: "Segoe UI",
            fontSize: 10,
            bold: true,
            color: PPT_THEME.sapBlue,
          });
        }

        slide.addText(layout.title, {
          x: 0.95,
          y: yCursor + layout.titleY,
          w: layout.called ? 8 : 10.5,
          h: layout.titleHeight,
          fontFace: "Segoe UI",
          fontSize: 12,
          bold: true,
          color: PPT_THEME.baseDark,
          breakLine: true,
        });
        slide.addText(layout.description, {
          x: 0.95,
          y: yCursor + layout.descriptionY,
          w: 10.5,
          h: layout.descriptionHeight,
          fontFace: "Segoe UI",
          fontSize: 10,
          color: "4F5F6D",
          breakLine: true,
        });
        if (layout.cycleTime) {
          slide.addText(`Tempo de Ciclo (Cycle Time): ${layout.cycleTime}`, {
            x: 0.95,
            y: yCursor + layout.cycleTimeY,
            w: 10.5,
            h: layout.cycleTimeHeight,
            fontFace: "Segoe UI",
            fontSize: 9,
            color: PPT_THEME.baseDark,
            breakLine: true,
          });
        }
        if (layout.projectTeam) {
          slide.addText(`Equipe do Projeto: ${layout.projectTeam}`, {
            x: 0.95,
            y: yCursor + layout.projectTeamY,
            w: 10.5,
            h: layout.projectTeamHeight,
            fontFace: "Segoe UI",
            fontSize: 9,
            bold: true,
            color: PPT_THEME.sapBlue,
            breakLine: true,
          });
        }
        if (layout.highlight) {
          slide.addText(`Pontos a Destacar: ${layout.highlight}`, {
            x: 0.95,
            y: yCursor + layout.highlightY,
            w: 10.5,
            h: layout.highlightHeight,
            fontFace: "Segoe UI",
            fontSize: 9,
            color: PPT_THEME.attentionOrange,
            italic: true,
            breakLine: true,
          });
        }
        yCursor += layout.height + densityGap;
      });
        addStandardFooter(slide, syncText);
        if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
      });
    }
  }

  const roadmapItems = roadmapItemsFromSections(sections);
  const roadmapItemsPerSlide = 6;
  const roadmapSlides = Math.ceil(roadmapItems.length / roadmapItemsPerSlide);

  for (let slideIndex = 0; slideIndex < roadmapSlides; slideIndex += 1) {
    const roadmapSlide = pptx.addSlide();
    roadmapSlide.background = { color: PPT_THEME.softBg };

    roadmapSlide.addText("Roadmap de Ações e Melhoria Contínua", {
      x: 0.7,
      y: 0.35,
      w: 10.5,
      h: 0.5,
      fontFace: "Segoe UI",
      fontSize: 24,
      bold: true,
      color: PPT_THEME.baseDark,
    });

    roadmapSlide.addText("Visão macro de iniciativas priorizadas por esforço e impacto operacional.", {
      x: 0.72,
      y: 0.84,
      w: 10.6,
      h: 0.3,
      fontFace: "Segoe UI",
      fontSize: 10,
      color: PPT_THEME.textMuted,
    });

    roadmapSlide.addShape(pptx.ShapeType.roundRect, {
      x: 0.72,
      y: 1.12,
      w: 10.7,
      h: 0.36,
      radius: 0.05,
      fill: { color: "FFFFFF" },
      line: { color: "D6E1EA", pt: 1 },
    });
    roadmapSlide.addText("Legenda de dificuldade: Verde = Baixa | Amarelo = Média | Vermelho = Alta", {
      x: 0.92,
      y: 1.22,
      w: 10.3,
      h: 0.18,
      fontFace: "Segoe UI",
      fontSize: 9,
      color: PPT_THEME.textMuted,
      align: "center",
    });

    const chunk = roadmapItems.slice(
      slideIndex * roadmapItemsPerSlide,
      slideIndex * roadmapItemsPerSlide + roadmapItemsPerSlide
    );

    chunk.forEach((item, index) => {
        const row = Math.floor(index / 3);
        const col = index % 3;
        const cardX = 0.7 + col * 3.82;
        const cardY = 1.6 + row * 2.55;
        const style = roadmapDifficultyStyle(item.difficulty);

        roadmapSlide.addShape(pptx.ShapeType.roundRect, {
          x: cardX,
          y: cardY,
          w: 3.58,
          h: 2.4,
          radius: 0.06,
          fill: { color: style.fill },
          line: { color: style.line, pt: 1 },
        });

        roadmapSlide.addText(item.title, {
          x: cardX + 0.18,
          y: cardY + 0.16,
          w: 3.2,
          h: 0.5,
          fontFace: "Segoe UI",
          fontSize: 12,
          bold: true,
          color: style.text,
          breakLine: true,
        });

        roadmapSlide.addText(item.subtitle, {
          x: cardX + 0.18,
          y: cardY + 0.66,
          w: 3.2,
          h: 0.35,
          fontFace: "Segoe UI",
          fontSize: 9,
          bold: true,
          color: style.text,
          breakLine: true,
        });

        roadmapSlide.addText(item.impact, {
          x: cardX + 0.18,
          y: cardY + 1.05,
          w: 3.2,
          h: 0.95,
          fontFace: "Segoe UI",
          fontSize: 10,
          color: style.text,
          breakLine: true,
        });

        roadmapSlide.addText(item.cycleImplantation ? `Ciclo de Implantação: ${item.cycleImplantation}` : "", {
          x: cardX + 0.18,
          y: cardY + 2.03,
          w: 1.95,
          h: 0.22,
          fontFace: "Segoe UI",
          fontSize: 8,
          bold: true,
          color: style.text,
          align: "left",
        });

        roadmapSlide.addText(item.category, {
          x: cardX + 1.95,
          y: cardY + 2.12,
          w: 1.45,
          h: 0.18,
          fontFace: "Segoe UI",
          fontSize: 8,
          bold: true,
          color: style.text,
          align: "right",
        });
    });

    addStandardFooter(roadmapSlide, syncText);
    if (watermarkEnabled) addPptWatermark(roadmapSlide, "CONFIDENCIAL");
  }

  const modeSuffix = pptMode === "executive" ? "-executivo" : "-operacional";
  await pptx.writeFile({ fileName: `performance-dashboard-${startDate || "inicio"}-${endDate || "fim"}${modeSuffix}.pptx` });
}
