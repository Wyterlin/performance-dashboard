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
  return `${startDate || "-"} ate ${endDate || "-"}`;
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
      ? `Maior concentracao da semana em ${topStatus} (${topValue}), com foco em estabilidade operacional e previsibilidade de entrega.`
      : "Nao houve concentracao relevante por status no periodo analisado.";

  const technicalRead =
    awaitingCount > resolvedCount
      ? "Volume em aguardando acima de resolvidos/concluidos, indicando necessidade de destravar dependencias para acelerar o fluxo."
      : "Resolvidos/concluidos acima de aguardando, sinalizando bom ritmo de encerramento e controle da fila.";

  const closingBlocks = [
    {
      title: "Acoes imediatas (7 dias)",
      text:
        awaitingCount > 0
          ? `Atuar nos ${awaitingCount} itens em aguardando com priorizacao por impacto e prazo.`
          : "Manter cadencia de atendimento e monitoramento de novos chamados.",
    },
    {
      title: "Riscos monitorados",
      text:
        repactTotal > 0
          ? `Repactuacao identificada em ${repactTotal} chamados, exigindo acompanhamento preventivo de SLA.`
          : "Sem repactuacao no periodo, manter observabilidade para preservar tendencia.",
    },
    {
      title: "Ganhos esperados",
      text:
        manualTotal > 0
          ? `Com ${manualTotal} atividades tecnicas registradas, expectativa de ganho continuo em eficiencia e qualidade de entrega.`
          : "Consolidar rotina operacional com melhoria continua e foco em previsibilidade.",
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
  summaryText,
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 42;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const periodText = formatPeriod(startDate, endDate);
  const syncText = `Sincronizacao: SULTS API Service | ${formatSyncTimestamp()}`;
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

  function drawFooterOnAllPages() {
    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      setTextFromHex(doc, "7A8792");
      doc.text(syncText, margin, pageHeight - 18);
      doc.text(`Pagina ${page}/${totalPages}`, pageWidth - margin, pageHeight - 18, { align: "right" });
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
  doc.text("Relatorio executivo de operacoes e sustentacao", margin, 68);
  doc.text(`Periodo analisado: ${periodText}`, margin, 94);

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
  startChapter("Sumario executivo", "Visao geral dos capitulos e secoes do relatorio");

  const chapterRows = [
    { title: "Capa", detail: "Contexto e periodo analisado" },
    { title: "Sumario executivo", detail: "Estrutura e distribuicao das secoes" },
    { title: "Metricas estrategicas", detail: "KPI consolidado, operacionais e atividades" },
    { title: "Painel de status (SULTS)", detail: "Distribuicao de volume e repactuacao por status" },
    { title: "Atividades por secao", detail: "Detalhamento por tema" },
    { title: "Resumo final", detail: "Sintese do periodo e direcionamentos" },
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
  doc.text("Secoes monitoradas", margin, y + 12);
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
  startChapter("Metricas estrategicas", "Indicadores de desempenho consolidados");

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
      labelLine1: "Chamados com repactuacao",
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
  startChapter("Painel de status (SULTS)", "Volume principal e repactuacao por status");

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
    doc.text(`Repactuacao: ${row.combined}`, margin + maxWidth - 88, y + 16);

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
  doc.text("Destaque tecnico", margin + 12, y + 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  setTextFromHex(doc, "4F5F6D");
  doc.text(doc.splitTextToSize(dynamic.technicalRead, maxWidth - 24), margin + 12, y + 34);
  // CAPITULO: ATIVIDADES
  startChapter("Atividades por secao", "Detalhamento das entregas registradas");

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
      const description = preserveMultiline(activity?.activity) || "Sem descricao.";
      const highlight = preserveMultiline(activity?.highlight);

      const titleLines = doc.splitTextToSize(title, maxWidth - 44);
      const descLines = splitPdfTextPreserveBreaks(doc, description, maxWidth - 44);
      const highlightLines = highlight
        ? splitPdfTextPreserveBreaks(doc, `Destaque: ${highlight}`, maxWidth - 44)
        : [];
      const blockHeight =
        18 +
        titleLines.length * 11 +
        descLines.length * 11 +
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
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setTextFromHex(doc, "4F5F6D");
      doc.text(descLines, margin + 12, textY);
      textY += descLines.length * 11;

      if (highlightLines.length) {
        setTextFromHex(doc, PPT_THEME.attentionOrange);
        doc.text(highlightLines, margin + 12, textY + 4);
      }

      y += blockHeight + 8;
    }
  }

  // CAPITULO: RESUMO FINAL
  startChapter("Resumo final", "Consolidado narrativo do periodo");

  const summarySafe = preserveMultiline(summaryText);
  if (summarySafe) {
    const summaryLines = splitPdfTextPreserveBreaks(doc, summarySafe, maxWidth - 24);
    const summaryHeight = 34 + summaryLines.length * 11;
    ensureSpace(summaryHeight + 8);

    setFillFromHex(doc, "EAF3FB");
    setDrawFromHex(doc, "CFE1EE");
    doc.roundedRect(margin, y, maxWidth, summaryHeight, 8, 8, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    setTextFromHex(doc, PPT_THEME.baseDark);
    doc.text("Resumo do periodo", margin + 12, y + 18);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    setTextFromHex(doc, "4F5F6D");
    doc.text(summaryLines, margin + 12, y + 34);
    y += summaryHeight + 10;
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

  if (!summarySafe) {
    ensureSpace(42);
    setFillFromHex(doc, "FFFFFF");
    setDrawFromHex(doc, "D6E1EA");
    doc.roundedRect(margin, y, maxWidth, 34, 8, 8, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setTextFromHex(doc, PPT_THEME.textMuted);
    doc.text("Nenhum resumo manual foi informado para este periodo.", margin + 12, y + 21);
  }

  drawFooterOnAllPages();

  doc.save(`performance-dashboard-${startDate || "inicio"}-${endDate || "fim"}.pdf`);
}

export async function exportDashboardPptx({
  startDate,
  endDate,
  ticketSummary,
  sections,
  summaryText,
}) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Performance Dashboard";
  pptx.subject = "Relatorio semanal";
  pptx.title = "Performance Dashboard";
  const syncText = `Sincronizacao: SULTS API Service | ${formatSyncTimestamp()}`;
  const periodText = formatPeriod(startDate, endDate);
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
  cover.addText("Apresentacao Executiva de Operacoes e Sustentacao", {
    x: 0.8,
    y: 2.2,
    w: 10.5,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 16,
    color: "DCEAF2",
  });
  cover.addText(`Periodo analisado: ${periodText}`, {
    x: 0.8,
    y: 2.8,
    w: 10.5,
    h: 0.4,
    fontFace: "Segoe UI",
    fontSize: 13,
    color: "BFDCEB",
  });
  addStandardFooter(cover, syncText);

  const executiveSlide = pptx.addSlide();
  executiveSlide.background = { color: PPT_THEME.softBg };
  executiveSlide.addText("Visao Geral do Ciclo de Vida", {
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
      title: "Saida",
      subtitle: "Resolvidos e concluidos no periodo",
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

  const metricsSlide = pptx.addSlide();
  metricsSlide.background = { color: PPT_THEME.softBg };
  metricsSlide.addText("Metricas Estrategicas", {
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
      label: "Total de Chamados com Repactuacao de Prazos",
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

  const statusSlide = pptx.addSlide();
  statusSlide.background = { color: PPT_THEME.softBg };
  statusSlide.addText("Analise de Status (SULTS)", {
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

  statusSlide.addText("Volume x Repactuacao", {
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
        labels: ["Volume Operacional", "Repactuacao"],
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
  statusSlide.addText("eficiencia", {
    x: 9.32,
    y: 3.33,
    w: 1.4,
    h: 0.2,
    fontFace: "Segoe UI",
    fontSize: 9,
    color: PPT_THEME.textMuted,
    align: "center",
  });
  statusSlide.addText(`Volume Operacional: ${operationalTotal}\nRepactuacao: ${repactTotal}`, {
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

  const technicalSlide = pptx.addSlide();
  technicalSlide.background = { color: PPT_THEME.softBg };
  technicalSlide.addText("Destaque Tecnico", {
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
  technicalSlide.addText("Leitura Tecnica da Semana", {
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
    `Periodo analisado: ${periodText}`,
    `Total de status monitorados: ${rows.length}`,
    `Atividades manuais registradas: ${dynamic.manualTotal}`,
    `Chamados em destaque de atencao: ${dynamic.awaitingCount}`,
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

  const populatedSections = (sections || []).filter((section) =>
    Array.isArray(section.activities) && section.activities.length > 0
  );

  for (const section of populatedSections) {
    const activities = sortActivitiesByPosition(section.activities || []);
    const itemsPerSlide = 5;
    const totalSlides = Math.ceil(activities.length / itemsPerSlide);

    for (let i = 0; i < totalSlides; i += 1) {
      const start = i * itemsPerSlide;
      const chunk = activities.slice(start, start + itemsPerSlide);
      const slide = pptx.addSlide();
      slide.background = { color: PPT_THEME.softBg };

      const sectionName = safeText(section.name) || "Secao";
      const titleSuffix = totalSlides > 1 ? ` (${i + 1}/${totalSlides})` : "";
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
      chunk.forEach((activity) => {
        slide.addShape(pptx.ShapeType.roundRect, {
          x: 0.7,
          y: yCursor,
          w: 11.2,
          h: 1.0,
          radius: 0.05,
          fill: { color: "FFFFFF" },
          line: { color: "D6E1EA", pt: 1 },
        });
        const title = safeText(activity?.title) || "Atividade";
        const description = preserveMultiline(activity?.activity) || "Sem descricao.";
        const highlight = preserveMultiline(activity?.highlight);
        slide.addText(title, {
          x: 0.95,
          y: yCursor + 0.12,
          w: 7.8,
          h: 0.2,
          fontFace: "Segoe UI",
          fontSize: 12,
          bold: true,
          color: PPT_THEME.baseDark,
        });
        slide.addText(description, {
          x: 0.95,
          y: yCursor + 0.36,
          w: 10.5,
          h: 0.28,
          fontFace: "Segoe UI",
          fontSize: 10,
          color: "4F5F6D",
          breakLine: true,
        });
        if (highlight) {
          slide.addText(`Destaque: ${highlight}`, {
            x: 0.95,
            y: yCursor + 0.67,
            w: 10.5,
            h: 0.24,
            fontFace: "Segoe UI",
            fontSize: 9,
            color: PPT_THEME.attentionOrange,
            italic: true,
            breakLine: true,
          });
        }
        yCursor += 1.12;
      });
      addStandardFooter(slide, syncText);
    }
  }

  const closing = pptx.addSlide();
  closing.background = { color: PPT_THEME.softBg };
  closing.addText("Proximos Passos / Melhoria Continua", {
    x: 0.7,
    y: 0.35,
    w: 9,
    h: 0.5,
    fontFace: "Segoe UI",
    fontSize: 24,
    bold: true,
    color: PPT_THEME.baseDark,
  });

  const closingBlocks = dynamic.closingBlocks;

  closingBlocks.forEach((block, index) => {
    const x = 0.7 + index * 3.82;
    closing.addShape(pptx.ShapeType.roundRect, {
      x,
      y: 1.2,
      w: 3.6,
      h: 4.7,
      radius: 0.06,
      fill: { color: "FFFFFF" },
      line: { color: "D6E1EA", pt: 1 },
    });
    closing.addText(block.title, {
      x: x + 0.2,
      y: 1.45,
      w: 3.2,
      h: 0.6,
      fontFace: "Segoe UI",
      fontSize: 12,
      bold: true,
      color: PPT_THEME.sapBlue,
      breakLine: true,
    });
    closing.addText(block.text, {
      x: x + 0.2,
      y: 2.15,
      w: 3.2,
      h: 3.3,
      fontFace: "Segoe UI",
      fontSize: 10,
      color: "4F5F6D",
      breakLine: true,
    });
  });

  const summarySafe = preserveMultiline(summaryText);
  if (summarySafe) {
    closing.addShape(pptx.ShapeType.roundRect, {
      x: 0.7,
      y: 6.15,
      w: 11.2,
      h: 0.55,
      radius: 0.05,
      fill: { color: "EAF3FB" },
      line: { color: "CFE1EE", pt: 1 },
    });
    closing.addText(summarySafe.slice(0, 220), {
      x: 0.9,
      y: 6.28,
      w: 10.8,
      h: 0.3,
      fontFace: "Segoe UI",
      fontSize: 9,
      color: "4F5F6D",
      breakLine: true,
    });
  }
  addStandardFooter(closing, syncText);

  await pptx.writeFile({ fileName: `performance-dashboard-${startDate || "inicio"}-${endDate || "fim"}.pptx` });
}
