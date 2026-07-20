import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";
import { ACTIVITY_STATUS, getActivityStatus } from "../constants/activityStatus";

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

/** Nome padrão dos arquivos exportados: PD_Christian_Silveira_<periodo>.<ext> */
function buildExportFileName(startDate, endDate, extension) {
  const start = formatDateToBr(startDate).replace(/\//g, "-");
  const end = formatDateToBr(endDate).replace(/\//g, "-");
  return `PD_Christian_Silveira_${start}_a_${end}.${extension}`;
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

/** Carimbo do rodapé do deck: "19/07/2026 • 23:41". */
function formatSyncStamp() {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR");
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} • ${time}`;
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

/**
 * Metadados exibidos na grade do rodapé do card. Só entra o que existe — sem
 * dado, o campo some em vez de virar uma célula vazia.
 */
function buildActivityMeta(activity) {
  const meta = [];
  if (safeText(activity?.called)) {
    meta.push({ label: "CHAMADO", value: safeText(activity.called) });
  }
  if (safeText(activity?.cycleTime)) {
    meta.push({ label: "TEMPO INVESTIDO", value: safeText(activity.cycleTime) });
  }
  if (Array.isArray(activity?.projectTeam) && activity.projectTeam.length) {
    meta.push({ label: "EQUIPE", value: activity.projectTeam.join(", ") });
  }
  if (Number(activity?.position) > 0) {
    meta.push({ label: "PRIORIDADE", value: String(Number(activity.position)) });
  }
  return meta;
}

/** Entregas por seção, para o resumo executivo do fim do relatório. */
function buildDeliverySummary(sections) {
  const rows = (sections || [])
    .filter((section) => !isRoadmapSectionName(section?.name))
    .map((section) => ({
      name: safeText(section?.name) || "Seção",
      total: Number(section?.activities?.length || 0),
    }))
    .filter((row) => row.total > 0);

  return { rows, total: rows.reduce((acc, row) => acc + row.total, 0) };
}

/** Totais por status das atividades manuais (o roadmap fica de fora). */
function buildStatusOverview(sections) {
  const counts = Object.fromEntries(ACTIVITY_STATUS.map((item) => [item.value, 0]));
  let total = 0;

  (sections || []).forEach((section) => {
    if (isRoadmapSectionName(section?.name)) return;
    (section?.activities || []).forEach((activity) => {
      total += 1;
      counts[getActivityStatus(activity?.status).value] += 1;
    });
  });

  return { total, counts };
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
  // Paisagem para espelhar o deck do PowerPoint.
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const PADX = 48;
  const CW = W - PADX * 2;

  // jsPDF só embute fontes padrão: Times faz o papel da Playfair (serifada)
  // e Helvetica o da Sora.
  const SERIF = "times";
  const SANS = "helvetica";

  const watermarkEnabled = Boolean(options.watermark);
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
  const statusOverview = buildStatusOverview(sections);

  doc.setProperties({
    title: `Performance Dashboard ${formatPeriodPpt(startDate, endDate)}`,
    subject: "Relatório semanal",
    author: "Christian Silveira",
    keywords: "dashboard, relatorio, semanal, chamados",
  });

  let started = false;
  function newPage(variant = "content") {
    if (started) doc.addPage();
    started = true;
    setFillFromHex(doc, LX.bg);
    doc.rect(0, 0, W, H, "F");
    // Mesmo glow do PPT, como imagem de fundo.
    const glow = makeGlowBackground(variant);
    if (glow) {
      try {
        doc.addImage(`data:${glow}`, "PNG", 0, 0, W, H);
      } catch {
        // Sem glow se o navegador recusar a imagem.
      }
    }
    if (watermarkEnabled) {
      setTextFromHex(doc, LX.line);
      doc.setFont(SANS, "bold");
      doc.setFontSize(52);
      doc.text("CONFIDENCIAL", W / 2, H / 2, { align: "center", angle: 30 });
    }
  }

  function footer() {
    // Mesmo rodapé do deck: traço dourado, rótulo e carimbo em duas linhas.
    setFillFromHex(doc, LX.gold);
    doc.rect(PADX, H - 42, 20, 2, "F");

    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "bold");
    doc.setFontSize(6.5);
    doc.text("ATUALIZADO EM", PADX, H - 30, { charSpace: 1.4 });

    setTextFromHex(doc, LX.muted);
    doc.setFont(SANS, "normal");
    doc.setFontSize(9);
    doc.text(`${formatSyncStamp()}  ·  SULTS API Service`, PADX, H - 17);
  }

  function panel(x, y, w, h, { fill = LX.panel, border = LX.line, radius = 12 } = {}) {
    setFillFromHex(doc, fill);
    setDrawFromHex(doc, border);
    doc.setLineWidth(0.6);
    doc.roundedRect(x, y, w, h, radius, radius, "FD");
  }

  function header({ eyebrow, title, number }) {
    let left = PADX;
    if (number) {
      setTextFromHex(doc, LX.gold);
      doc.setFont(SERIF, "bold");
      doc.setFontSize(20);
      doc.text(number, PADX, 62);
      left = PADX + 40;
    }
    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "bold");
    doc.setFontSize(8.5);
    doc.text(String(eyebrow || "").toUpperCase(), left, 48, { charSpace: 1.6 });
    setTextFromHex(doc, LX.ink);
    doc.setFont(SERIF, "bold");
    doc.setFontSize(25);
    doc.text(safeText(title), left, 76);
  }

  function accent(x, y, color, w = 34) {
    setFillFromHex(doc, color);
    doc.rect(x, y, w, 3, "F");
  }

  /** Rótulo de bloco com marcador dourado, gêmeo do usado no deck. */
  function blockLabelPdf(text, x, y) {
    setFillFromHex(doc, LX.gold);
    doc.rect(x, y - 4.5, 3.5, 3.5, "F");
    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "bold");
    doc.setFontSize(7.5);
    doc.text(text, x + 8, y, { charSpace: 1.6 });
  }

  /** Selo de status em cápsula: fundo tingido, ponto e rótulo. */
  function statusBadgePdf(status, x, y, w = 104, h = 18) {
    setFillFromHex(doc, status.tint);
    setDrawFromHex(doc, status.color);
    doc.setLineWidth(0.7);
    doc.roundedRect(x, y, w, h, h / 2, h / 2, "FD");
    setFillFromHex(doc, status.color);
    doc.circle(x + 12, y + h / 2, 3, "F");
    setTextFromHex(doc, status.color);
    doc.setFont(SANS, "bold");
    doc.setFontSize(6.5);
    doc.text(status.label.toUpperCase(), x + 21, y + h / 2 + 2.4, { charSpace: 0.8 });
  }

  /** Grade de metadados em duas colunas no rodapé do card. */
  function metaGridPdf(entries, x, y, w) {
    const colW = w / 2;
    entries.forEach((entry, index) => {
      const cellX = x + (index % 2) * colW;
      const cellY = y + Math.floor(index / 2) * 30;
      setTextFromHex(doc, LX.dim);
      doc.setFont(SANS, "bold");
      doc.setFontSize(6);
      doc.text(entry.label, cellX, cellY, { charSpace: 1.2 });
      setTextFromHex(doc, LX.body);
      doc.setFont(SANS, "normal");
      doc.setFontSize(9.5);
      doc.text(doc.splitTextToSize(entry.value, colW - 8).slice(0, 1), cellX, cellY + 12);
    });
  }

  /**
   * Mede o card antes de desenhar. A altura acompanha o conteúdo: no A4
   * paisagem um card de altura fixa deixaria um vão entre a descrição e o
   * rodapé ancorado na base.
   */
  function activityCardPdfLayout(activity, w) {
    const innerW = w - 44;
    const highlight = safeText(activity?.highlight);
    const effect = preserveMultiline(activity?.systemEffect);

    doc.setFont(SANS, "normal");
    doc.setFontSize(8.5);
    const highlightLines = highlight
      ? doc.splitTextToSize(`» ${highlight}`, innerW).slice(0, 2)
      : [];

    // "•" está no WinAnsi; "✔" do deck não estaria.
    doc.setFontSize(10.5);
    const effectItems = effect
      ? effect
          .split(/\n|;/)
          .map((item) => item.trim())
          .filter(Boolean)
          .map((item) => doc.splitTextToSize(`•  ${item}`, innerW))
      : [];

    doc.setFontSize(9.5);
    const descriptionLines = doc
      .splitTextToSize(preserveMultiline(activity?.activity) || "", innerW)
      .slice(0, 10);

    let contentH = 74;
    if (effectItems.length) {
      contentH += 17 + effectItems.reduce((acc, lines) => acc + lines.length * 13, 0) + 8;
    }
    contentH += descriptionLines.length * 12;

    // Rótulo "ATIVIDADE" acima da descrição.
    contentH += 17;

    const meta = buildActivityMeta(activity);
    const metaH = meta.length ? Math.ceil(meta.length / 2) * 30 + 4 : 0;
    const observationH = highlightLines.length ? 17 + highlightLines.length * 11 : 0;
    const bottomH = metaH + observationH;

    return {
      innerW,
      highlight,
      meta,
      metaH,
      observationH,
      highlightLines,
      effectItems,
      descriptionLines,
      bottomH,
      height: contentH + bottomH + 18,
    };
  }

  /**
   * Card de atividade — espelha o do deck: status, título, resultado em
   * destaque e só então a descrição técnica.
   */
  function activityCardPdf(activity, { x, y, w, h }) {
    const layout = activityCardPdfLayout(activity, w);
    const { innerW, highlight, meta, metaH, observationH, highlightLines, effectItems, descriptionLines } =
      layout;
    const status = getActivityStatus(activity?.status);
    const accentColor = highlight ? LX.gold : LX.blue;
    const padL = x + 22;

    panel(x, y, w, h);
    setFillFromHex(doc, accentColor);
    doc.rect(x, y, 3.5, h, "F");

    const badgeW = 104;
    statusBadgePdf(status, x + w - 22 - badgeW, y + 18, badgeW);

    setTextFromHex(doc, LX.ink);
    doc.setFont(SANS, "bold");
    doc.setFontSize(13);
    doc.text(
      doc.splitTextToSize(safeText(activity?.title) || "Atividade", innerW - badgeW - 14).slice(0, 2),
      padL,
      y + 32
    );

    setDrawFromHex(doc, LX.line);
    doc.setLineWidth(0.6);
    doc.line(padL, y + 52, padL + innerW, y + 52);

    let cursor = y + 74;

    if (effectItems.length) {
      blockLabelPdf("RESULTADO", padL, cursor);
      cursor += 17;

      setTextFromHex(doc, LX.body);
      doc.setFont(SANS, "normal");
      doc.setFontSize(10.5);
      effectItems.forEach((lines) => {
        doc.text(lines, padL, cursor);
        cursor += lines.length * 13;
      });
      cursor += 8;
    }

    blockLabelPdf("ATIVIDADE", padL, cursor);
    cursor += 17;

    if (descriptionLines.length) {
      setTextFromHex(doc, LX.muted);
      doc.setFont(SANS, "normal");
      doc.setFontSize(9.5);
      doc.text(descriptionLines, padL, cursor);
    }

    let bottomCursor = y + h - 18;
    if (meta.length) {
      bottomCursor -= metaH - 12;
      metaGridPdf(meta, padL, bottomCursor, innerW);
      bottomCursor -= 12;
    }
    if (highlightLines.length) {
      bottomCursor -= observationH;
      blockLabelPdf("OBSERVAÇÃO", padL, bottomCursor);
      setTextFromHex(doc, LX.goldL);
      doc.setFont(SANS, "normal");
      doc.setFontSize(8.5);
      doc.text(
        highlightLines.map((line) => line.replace(/^»\s*/, "")),
        padL,
        bottomCursor + 13
      );
    }
  }

  /** Altura mínima do panorama: cabeçalho, total, barra e uma linha por status. */
  function overviewCardPdfHeight() {
    const rows = ACTIVITY_STATUS.filter((item) => statusOverview.counts[item.value] > 0).length;
    return 132 + rows * 26 + 8;
  }

  /** Painel de panorama, gêmeo do slide: ocupa a coluna livre da página. */
  function overviewCardPdf({ x, y, w, h }) {
    panel(x, y, w, h, { fill: LX.blueTint, border: LX.blueSoft });

    const padL = x + 26;
    const innerW = w - 52;

    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "bold");
    doc.setFontSize(7.5);
    doc.text("PANORAMA DA SEMANA", padL, y + 34, { charSpace: 1.6 });

    setTextFromHex(doc, LX.ink);
    doc.setFont(SERIF, "bold");
    doc.setFontSize(38);
    const totalText = String(statusOverview.total);
    doc.text(totalText, padL, y + 78);
    const totalWidth = doc.getTextWidth(totalText);
    setTextFromHex(doc, LX.muted);
    doc.setFont(SERIF, "normal");
    doc.setFontSize(13);
    doc.text("atividades", padL + totalWidth + 10, y + 78);

    const present = ACTIVITY_STATUS.filter((item) => statusOverview.counts[item.value] > 0);

    if (statusOverview.total > 0) {
      let barX = padL;
      present.forEach((item) => {
        const segW = (statusOverview.counts[item.value] / statusOverview.total) * innerW;
        setFillFromHex(doc, item.color);
        doc.rect(barX, y + 96, segW, 9, "F");
        barX += segW;
      });
    }

    let rowY = y + 132;
    present.forEach((item) => {
      setFillFromHex(doc, item.color);
      doc.circle(padL + 4, rowY - 3.5, 4, "F");
      setTextFromHex(doc, LX.body);
      doc.setFont(SANS, "normal");
      doc.setFontSize(10.5);
      doc.text(item.label, padL + 16, rowY);
      setTextFromHex(doc, item.color);
      doc.setFont(SANS, "bold");
      doc.setFontSize(11);
      doc.text(String(statusOverview.counts[item.value]), padL + innerW, rowY, { align: "right" });
      rowY += 26;
    });
  }

  // ---------- 1. CAPA ----------
  newPage("cover");
  setTextFromHex(doc, LX.gold);
  doc.setFont(SANS, "bold");
  doc.setFontSize(10);
  doc.text("RELATÓRIO SEMANAL", W / 2, 178, { align: "center", charSpace: 5 });

  doc.setFont(SERIF, "bold");
  doc.setFontSize(40);
  const part1 = "Apresentação de ";
  const part2 = "Atividades";
  const w1 = doc.getTextWidth(part1);
  doc.setFont(SERIF, "bolditalic");
  const w2 = doc.getTextWidth(part2);
  const titleX = (W - (w1 + w2)) / 2;
  doc.setFont(SERIF, "bold");
  setTextFromHex(doc, LX.ink);
  doc.text(part1, titleX, 232);
  doc.setFont(SERIF, "bolditalic");
  setTextFromHex(doc, LX.goldL);
  doc.text(part2, titleX + w1, 232);

  setTextFromHex(doc, LX.muted);
  doc.setFont(SANS, "normal");
  doc.setFontSize(13);
  doc.text("Central de inteligência operacional", W / 2, 262, { align: "center" });

  const pillW = 250;
  const pillH = 34;
  const pillX = (W - pillW) / 2;
  setFillFromHex(doc, LX.panel);
  setDrawFromHex(doc, LX.gold);
  doc.setLineWidth(0.9);
  doc.roundedRect(pillX, 292, pillW, pillH, pillH / 2, pillH / 2, "FD");
  setTextFromHex(doc, LX.body);
  doc.setFont(SANS, "normal");
  doc.setFontSize(11);
  doc.text(
    `${formatDateToBr(startDate)}   ·   ${formatDateToBr(endDate)}`,
    W / 2,
    292 + pillH / 2 + 4,
    { align: "center" }
  );

  setTextFromHex(doc, LX.dim);
  doc.setFontSize(9.5);
  doc.text("</>  Christian Silveira", W / 2, H - 70, { align: "center" });
  footer();

  // ---------- 2. RESUMO EXECUTIVO ----------
  newPage();
  header({ eyebrow: "Visão consolidada", title: "Resumo Executivo" });

  const gap = 16;
  const unit = (CW - gap * 3) / 4.35;
  const wide = unit * 1.35;
  const kY = 118;
  const kH = 132;

  panel(PADX, kY, wide, kH, { fill: LX.deep, border: LX.goldSoft });
  setTextFromHex(doc, "C9D2FF");
  doc.setFont(SANS, "normal");
  doc.setFontSize(8);
  doc.text("INDICADOR CONSOLIDADO", PADX + 18, kY + 26, { charSpace: 1.2 });
  setTextFromHex(doc, LX.goldL);
  doc.setFont(SERIF, "bold");
  doc.setFontSize(38);
  doc.text(String(consolidated), PADX + 18, kY + 76);
  setTextFromHex(doc, "8D97C8");
  doc.setFont(SANS, "normal");
  doc.setFontSize(8);
  doc.text("chamados + atividades no período", PADX + 18, kY + 104);

  [
    { label: "Volume Operacional", value: operationalTotal, color: LX.blue },
    { label: "Prazos Renegociados", value: renegotiated, color: LX.gold },
    { label: "Atividades Registradas", value: manualTotal, color: LX.blue },
  ].forEach((item, index) => {
    const x = PADX + wide + gap + index * (unit + gap);
    panel(x, kY, unit, kH);
    setTextFromHex(doc, LX.muted);
    doc.setFont(SANS, "normal");
    doc.setFontSize(9);
    doc.text(item.label, x + 16, kY + 26);
    setTextFromHex(doc, LX.ink);
    doc.setFont(SANS, "bold");
    doc.setFontSize(28);
    doc.text(String(item.value), x + 16, kY + 74);
    accent(x + 16, kY + 92, item.color);
  });
  footer();

  // ---------- 3. CHAMADOS SULTS ----------
  newPage();
  header({ eyebrow: "Suporte · sincronização SULTS", title: "Chamados SULTS" });

  const sCols = 3;
  const sGap = 14;
  const sW = (CW - sGap * (sCols - 1)) / sCols;
  const sH = 84;
  rows.slice(0, 6).forEach((row, index) => {
    const col = index % sCols;
    const line = Math.floor(index / sCols);
    const x = PADX + col * (sW + sGap);
    const y = 120 + line * (sH + sGap);
    const isGold = normalizeText(row.status).includes("conclu");
    panel(x, y, sW, sH, {
      fill: isGold ? LX.goldTint : LX.blueTint,
      border: isGold ? LX.goldSoft : LX.blueSoft,
    });
    setTextFromHex(doc, isGold ? LX.goldL : LX.muted);
    doc.setFont(SANS, "normal");
    doc.setFontSize(10);
    doc.text(safeText(row.status), x + 16, y + sH / 2 + 4);
    setTextFromHex(doc, isGold ? LX.goldL : LX.ink);
    doc.setFont(SANS, "bold");
    doc.setFontSize(26);
    doc.text(String(row.primary), x + sW - 16, y + sH / 2 + 8, { align: "right" });
  });
  setTextFromHex(doc, LX.muted);
  doc.setFont(SANS, "normal");
  doc.setFontSize(10);
  doc.text(
    `${operationalTotal} chamados no período · ${renegotiated} com prazo renegociado`,
    PADX,
    120 + 2 * (sH + sGap) + 26
  );
  footer();

  // ---------- 4. INDICADORES DE ATENDIMENTO ----------
  if (metrics) {
    newPage();
    header({ eyebrow: "Qualidade do atendimento", title: "Indicadores de Atendimento" });

    const items = [
      {
        label: "Tempo de 1a Resposta",
        value: formatDurationPpt(metrics.firstResponseMs),
        sub: `média · ${Number(metrics.firstResponseCount || 0)} chamados`,
        color: LX.blue,
      },
      {
        label: "Tempo de Resolução",
        value: formatDurationPpt(metrics.resolutionMs),
        sub: `média · ${Number(metrics.resolutionCount || 0)} resolvidos`,
        color: LX.blue,
      },
      {
        label: "Cumprimento de SLA",
        value: metrics.slaPct == null ? "-" : `${metrics.slaPct}%`,
        sub: `${Number(metrics.slaWithin || 0)}/${Number(metrics.slaTotal || 0)} no prazo`,
        color: LX.gold,
      },
      {
        label: "Satisfação (CSAT)",
        value: metrics.csatAvg == null ? "-" : `${Number(metrics.csatAvg).toFixed(1)}/5`,
        sub: `${Number(metrics.csatCount || 0)} avaliações`,
        color: LX.gold,
      },
      {
        label: "Taxa de Resolução",
        value: metrics.resolutionRatePct == null ? "-" : `${metrics.resolutionRatePct}%`,
        sub: `${Number(metrics.closedInPeriod || 0)} fechados · ${Number(metrics.openedInPeriod || 0)} abertos`,
        color: LX.blue,
      },
    ];
    const mGap = 12;
    const mW = (CW - mGap * 4) / 5;
    items.forEach((item, index) => {
      const x = PADX + index * (mW + mGap);
      const y = 126;
      panel(x, y, mW, 118);
      setTextFromHex(doc, LX.muted);
      doc.setFont(SANS, "normal");
      doc.setFontSize(8.5);
      doc.text(doc.splitTextToSize(item.label, mW - 24), x + 12, y + 22);
      setTextFromHex(doc, LX.ink);
      doc.setFont(SERIF, "bold");
      doc.setFontSize(20);
      doc.text(item.value, x + 12, y + 66);
      accent(x + 12, y + 80, item.color, 28);
      setTextFromHex(doc, LX.dim);
      doc.setFont(SANS, "normal");
      doc.setFontSize(7.5);
      doc.text(doc.splitTextToSize(item.sub, mW - 24), x + 12, y + 98);
    });
    footer();
  }

  // ---------- DESTAQUE DA SEMANA ----------
  // Renderizado depois das seções, logo antes do roadmap.
  const renderWeekHighlightPages = () => collectWeekHighlights(sections).forEach((item) => {
    newPage();
    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "bold");
    doc.setFontSize(10);
    doc.text(`DESTAQUE DA SEMANA · ${safeText(item.title).toUpperCase()}`, W / 2, 120, {
      align: "center",
      charSpace: 3,
    });
    setTextFromHex(doc, LX.ink);
    doc.setFont(SERIF, "bold");
    doc.setFontSize(32);
    doc.text("Ganho de Performance", W / 2, 164, { align: "center" });

    let boxY = 210;
    if (item.gainLabel) {
      setTextFromHex(doc, LX.goldL);
      doc.setFont(SERIF, "bold");
      doc.setFontSize(58);
      doc.text(item.gainLabel, W / 2, 250, { align: "center" });
      boxY = 300;
    }

    const boxW = 150;
    const arrowW = 50;
    const boxX = (W - (boxW * 2 + arrowW)) / 2;
    panel(boxX, boxY, boxW, 74);
    setTextFromHex(doc, LX.muted);
    doc.setFont(SANS, "normal");
    doc.setFontSize(8.5);
    doc.text("ANTES", boxX + boxW / 2, boxY + 24, { align: "center", charSpace: 1.5 });
    setTextFromHex(doc, LX.body);
    doc.setFont(SANS, "bold");
    doc.setFontSize(18);
    doc.text(safeText(item.before), boxX + boxW / 2, boxY + 54, { align: "center" });

    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "normal");
    doc.setFontSize(16);
    doc.text("-->", boxX + boxW + arrowW / 2, boxY + 44, { align: "center" });

    const afterX = boxX + boxW + arrowW;
    panel(afterX, boxY, boxW, 74, { fill: LX.goldTint, border: LX.goldSoft });
    setTextFromHex(doc, LX.goldL);
    doc.setFont(SANS, "normal");
    doc.setFontSize(8.5);
    doc.text("DEPOIS", afterX + boxW / 2, boxY + 24, { align: "center", charSpace: 1.5 });
    doc.setFont(SANS, "bold");
    doc.setFontSize(18);
    doc.text(safeText(item.after), afterX + boxW / 2, boxY + 54, { align: "center" });

    if (item.note) {
      setTextFromHex(doc, LX.muted);
      doc.setFont(SANS, "normal");
      doc.setFontSize(10);
      doc.text(safeText(item.note), W / 2, boxY + 108, { align: "center" });
    }
    footer();
  });

  // ---------- 5..N. SEÇÕES ----------
  const populated = (sections || []).filter(
    (section) =>
      !isRoadmapSectionName(section?.name) &&
      Array.isArray(section.activities) &&
      section.activities.length > 0
  );

  populated.forEach((section, sectionIndex) => {
    const activities = sortActivitiesByPosition(section.activities || []);
    const pages = chunkList(activities, 2);

    pages.forEach((pageItems, pageIndex) => {
      newPage();
      header({
        eyebrow: "Seção de atividades",
        title: section.name,
        number: String(sectionIndex + 1).padStart(2, "0"),
      });
      if (pages.length > 1) {
        setTextFromHex(doc, LX.dim);
        doc.setFont(SANS, "normal");
        doc.setFontSize(9);
        doc.text(`${pageIndex + 1}/${pages.length}`, W - PADX, 76, { align: "right" });
      }

      const aGap = 16;
      const aW = (CW - aGap) / 2;
      // Cards e panorama da página compartilham a altura do mais alto.
      const aH = Math.min(
        430,
        Math.max(
          200,
          pageItems.length === 1 ? overviewCardPdfHeight() : 0,
          ...pageItems.map((item) => activityCardPdfLayout(item, aW).height)
        )
      );

      pageItems.forEach((activity, index) => {
        activityCardPdf(activity, { x: PADX + index * (aW + aGap), y: 112, w: aW, h: aH });
      });

      // Mesma regra do deck: página com um card só ganha o panorama ao lado.
      if (pageItems.length === 1) {
        overviewCardPdf({ x: PADX + aW + aGap, y: 112, w: aW, h: aH });
      }

      footer();
    });
  });

  // Ganho de Performance entra aqui: depois de todas as atividades.
  renderWeekHighlightPages();

  // ---------- ROADMAP ----------
  const roadmapItems = roadmapItemsFromSections(sections);
  if (roadmapItems.length) {
    const pages = chunkList(roadmapItems, 3);
    pages.forEach((pageItems, pageIndex) => {
      newPage();
      header({ eyebrow: "Próximos passos", title: "Roadmap de Ações" });
      if (pages.length > 1) {
        setTextFromHex(doc, LX.dim);
        doc.setFont(SANS, "normal");
        doc.setFontSize(9);
        doc.text(`${pageIndex + 1}/${pages.length}`, W - PADX, 76, { align: "right" });
      }

      const rGap = 14;
      const rW = (CW - rGap * 2) / 3;
      const rH = 300;
      pageItems.forEach((item, index) => {
        const x = PADX + index * (rW + rGap);
        const y = 112;
        const diffColor =
          item.difficulty === "high" ? LX.danger : item.difficulty === "low" ? LX.ok : LX.goldL;
        const diffLabel =
          item.difficulty === "high" ? "Alta" : item.difficulty === "low" ? "Baixa" : "Média";

        panel(x, y, rW, rH, { border: LX.goldSoft });
        setTextFromHex(doc, LX.ink);
        doc.setFont(SANS, "bold");
        doc.setFontSize(12);
        doc.text(doc.splitTextToSize(safeText(item.title) || "Item", rW - 32), x + 16, y + 26);

        // chips em pílula
        const chipDefs = [
          { label: `Dificuldade: ${diffLabel}`, color: diffColor },
          ...(item.category ? [{ label: item.category, color: LX.blueL }] : []),
          ...(item.cycleImplantation ? [{ label: `Ciclo: ${item.cycleImplantation}`, color: LX.muted }] : []),
        ];
        let chipX = x + 16;
        let chipY = y + 44;
        doc.setFont(SANS, "normal");
        doc.setFontSize(7.5);
        chipDefs.forEach((chip) => {
          const chipW = Math.min(doc.getTextWidth(chip.label) + 16, rW - 32);
          if (chipX + chipW > x + rW - 16) {
            chipX = x + 16;
            chipY += 24;
          }
          setFillFromHex(doc, LX.panel2);
          setDrawFromHex(doc, chip.color);
          doc.setLineWidth(0.7);
          doc.roundedRect(chipX, chipY, chipW, 17, 8.5, 8.5, "FD");
          setTextFromHex(doc, chip.color);
          doc.text(chip.label, chipX + chipW / 2, chipY + 11.5, { align: "center" });
          chipX += chipW + 6;
        });

        let cursor = chipY + 38;
        if (item.subtitle) {
          setTextFromHex(doc, LX.muted);
          doc.setFont(SANS, "italic");
          doc.setFontSize(9.5);
          const sub = doc.splitTextToSize(item.subtitle, rW - 32);
          doc.text(sub.slice(0, 2), x + 16, cursor);
          cursor += 14 * Math.min(sub.length, 2) + 8;
        }
        if (item.impact) {
          setTextFromHex(doc, LX.body);
          doc.setFont(SANS, "normal");
          doc.setFontSize(9.5);
          const impact = doc.splitTextToSize(`Impacto: ${item.impact}`, rW - 32);
          const maxLines = Math.max(Math.floor((y + rH - 16 - cursor) / 13), 1);
          doc.text(impact.slice(0, maxLines), x + 16, cursor);
        }
      });
      footer();
    });
  }

  // ---------- RESUMO DAS ENTREGAS ----------
  const delivery = buildDeliverySummary(sections);
  if (delivery.total > 0) {
    newPage();
    header({ eyebrow: "Fechamento", title: "Resumo das Entregas" });

    const tableW = CW * 0.56;
    const rowH = 26;
    const boxH = Math.min(330, (delivery.rows.length + 2) * rowH + 56);
    panel(PADX, 112, tableW, boxH);

    blockLabelPdf("CATEGORIA", PADX + 22, 140);
    setTextFromHex(doc, LX.gold);
    doc.setFont(SANS, "bold");
    doc.setFontSize(7.5);
    doc.text("ENTREGAS", PADX + tableW - 22, 140, { align: "right", charSpace: 1.6 });

    let rowY = 168;
    delivery.rows.forEach((row) => {
      setDrawFromHex(doc, LX.line);
      doc.setLineWidth(0.5);
      doc.line(PADX + 22, rowY - 14, PADX + tableW - 22, rowY - 14);
      setTextFromHex(doc, LX.body);
      doc.setFont(SANS, "normal");
      doc.setFontSize(11);
      doc.text(doc.splitTextToSize(row.name, tableW - 110).slice(0, 1), PADX + 22, rowY);
      setTextFromHex(doc, LX.ink);
      doc.text(String(row.total), PADX + tableW - 22, rowY, { align: "right" });
      rowY += rowH;
    });

    setDrawFromHex(doc, LX.goldSoft);
    doc.setLineWidth(1.2);
    doc.line(PADX + 22, rowY - 14, PADX + tableW - 22, rowY - 14);
    setTextFromHex(doc, LX.goldL);
    doc.setFont(SANS, "bold");
    doc.setFontSize(11.5);
    doc.text("Total", PADX + 22, rowY);
    doc.setFontSize(13);
    doc.text(String(delivery.total), PADX + tableW - 22, rowY, { align: "right" });

    // Checklist ao lado, derivado dos status reais das atividades.
    const checkX = PADX + tableW + 20;
    const checkW = CW - tableW - 20;
    panel(checkX, 112, checkW, boxH, { fill: LX.blueTint, border: LX.blueSoft });

    const blocked = statusOverview.counts.blocked;
    const checks = [
      `${statusOverview.counts.done} atividade(s) concluída(s)`,
      blocked > 0 ? `${blocked} atividade(s) bloqueada(s)` : "Nenhuma pendência crítica",
      "Entregas realizadas dentro do período",
    ];

    blockLabelPdf("PANORAMA", checkX + 22, 140);
    let checkY = 172;
    checks.forEach((text) => {
      setTextFromHex(doc, LX.body);
      doc.setFont(SANS, "normal");
      doc.setFontSize(11);
      // "•" no lugar do "✔" do deck: Helvetica padrão não tem o check.
      doc.text(doc.splitTextToSize(`•  ${text}`, checkW - 44), checkX + 22, checkY);
      checkY += 30;
    });

    footer();
  }

  // ---------- ENCERRAMENTO ----------
  newPage("closing");
  setTextFromHex(doc, LX.gold);
  doc.setFont(SANS, "bold");
  doc.setFontSize(10);
  doc.text(`RELATÓRIO SEMANAL · ${formatPeriodPpt(startDate, endDate)}`, W / 2, 210, {
    align: "center",
    charSpace: 3,
  });
  setTextFromHex(doc, LX.ink);
  doc.setFont(SERIF, "bold");
  doc.setFontSize(38);
  doc.text("Obrigado", W / 2, 268, { align: "center" });
  setTextFromHex(doc, LX.muted);
  doc.setFont(SANS, "normal");
  doc.setFontSize(13);
  doc.text("Perguntas e próximos passos", W / 2, 298, { align: "center" });
  setTextFromHex(doc, LX.goldL);
  doc.setFontSize(10);
  doc.text("</>  Christian Silveira   ·   Conectando código, café e criatividade", W / 2, 350, {
    align: "center",
  });
  footer();

  doc.save(buildExportFileName(startDate, endDate, "pdf"));
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
  // Bordas/fundos "translúcidos" do deck achatados sobre o fundo escuro —
  // PPT/PDF não têm alpha confiável, então usamos a cor já composta.
  blueSoft: "1E3282", // rgba(43,79,216,.55) sobre o painel
  goldSoft: "7A6729", // rgba(212,175,55,.55) sobre o painel
  blueTint: "10141F", // leve tom azul no fundo do card
  goldTint: "1A1710", // leve tom quente no fundo do card
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

/**
 * Converte textos de tempo ("50s", "1s60ms", "3h 20m") em milissegundos para
 * calcular o ganho percentual. Retorna null quando não é um tempo reconhecível.
 */
function parseDurationText(value) {
  const raw = String(value || "").toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;

  // Formato de relógio (hh:mm:ss ou mm:ss), usado pelos campos do site.
  if (/^\d{1,3}(:\d{1,2}){1,2}$/.test(raw)) {
    const parts = raw.split(":").map((part) => Number(part) || 0);
    const seconds =
      parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
    return seconds * 1000;
  }

  const pattern = /(\d+(?:[.,]\d+)?)(ms|s|m|h|d)/g;
  let total = 0;
  let matched = false;
  let match = pattern.exec(raw);
  while (match) {
    matched = true;
    const amount = Number(String(match[1]).replace(",", "."));
    const unit = match[2];
    const factor =
      unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
    total += amount * factor;
    match = pattern.exec(raw);
  }
  return matched ? total : null;
}

/** Duração curta preservando segundos/ms (o ganho costuma ser sub-minuto). */
function formatShortDuration(milliseconds) {
  const ms = Number(milliseconds);
  if (!Number.isFinite(ms)) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    const rounded = Math.round(totalSeconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (minutes < 60) return seconds ? `${minutes}min ${seconds}s` : `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}min` : `${hours}h`;
}

/** Atividades marcadas como Destaque da Semana, com o ganho já calculado. */
function collectWeekHighlights(sections = []) {
  const items = [];
  (sections || []).forEach((section) => {
    (section?.activities || []).forEach((activity) => {
      if (!activity?.isWeekHighlight) return;
      const before = safeText(activity.beforeValue);
      const after = safeText(activity.afterValue);
      if (!before || !after) return;

      const beforeMs = parseDurationText(before);
      const afterMs = parseDurationText(after);
      let gainLabel = "";
      if (beforeMs && afterMs != null && beforeMs > 0 && afterMs < beforeMs) {
        gainLabel = `${Math.round(((beforeMs - afterMs) / beforeMs) * 100)}%`;
      }

      items.push({
        title: safeText(activity.title) || "Destaque",
        // Exibe legível ("50s") em vez do formato de relógio cru.
        before: beforeMs != null ? formatShortDuration(beforeMs) : before,
        after: afterMs != null ? formatShortDuration(afterMs) : after,
        note: safeText(activity.highlightNote),
        gainLabel,
      });
    });
  });
  return items;
}

/**
 * Gera o "glow" de fundo (gradiente radial azul) como PNG via canvas.
 * PPT/PDF não têm gradiente radial nativo, então usamos uma imagem de fundo.
 * Retorna null fora do navegador (ex.: testes em Node) — aí fica só o sólido.
 */
const glowCache = {};
function makeGlowBackground(variant = "content") {
  if (glowCache[variant] !== undefined) return glowCache[variant];
  if (typeof document === "undefined") {
    glowCache[variant] = null;
    return null;
  }
  try {
    const w = 1600;
    const h = 900;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      glowCache[variant] = null;
      return null;
    }

    ctx.fillStyle = `#${LX.bg}`;
    ctx.fillRect(0, 0, w, h);

    // Cada variante posiciona o brilho como no deck.
    const spots =
      variant === "cover"
        ? [
            { x: w * 0.5, y: -h * 0.12, r: w * 0.62, color: "43,79,216", alpha: 0.5 },
            { x: w * 0.88, y: h * 0.3, r: w * 0.36, color: "212,175,55", alpha: 0.08 },
          ]
        : variant === "closing"
          ? [{ x: w * 0.5, y: h * 1.05, r: w * 0.6, color: "43,79,216", alpha: 0.42 }]
          : [{ x: w * 0.85, y: -h * 0.1, r: w * 0.55, color: "43,79,216", alpha: 0.22 }];

    spots.forEach((spot) => {
      const gradient = ctx.createRadialGradient(spot.x, spot.y, 0, spot.x, spot.y, spot.r);
      gradient.addColorStop(0, `rgba(${spot.color},${spot.alpha})`);
      gradient.addColorStop(1, `rgba(${spot.color},0)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });

    // pptxgenjs espera "image/png;base64,..." (sem o prefixo "data:").
    const dataUrl = canvas.toDataURL("image/png");
    glowCache[variant] = dataUrl.replace(/^data:/, "");
    return glowCache[variant];
  } catch {
    glowCache[variant] = null;
    return null;
  }
}

/** Junta as etapas do Fluxo Atendido com a seta padrão. */
function flowStepsText(activity) {
  const steps = Array.isArray(activity?.flowSteps)
    ? activity.flowSteps
    : String(activity?.flowText || "")
        .split("→")
        .map((step) => step.trim());
  return steps
    .map((step) => safeText(step))
    .filter(Boolean)
    .join("  →  ");
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

  const statusOverview = buildStatusOverview(sections);

  // ---------- helpers de desenho ----------
  function newSlide(variant = "content") {
    const slide = pptx.addSlide();
    const glow = makeGlowBackground(variant);
    slide.background = glow ? { data: glow } : { color: LX.bg };
    return slide;
  }

  function footer(slide) {
    // Traço dourado no lugar de um ícone: as fontes do deck não têm glifo de
    // sincronização confiável em todas as máquinas.
    accentBar(slide, { x: PAD, y: 6.83, w: 0.28, h: 0.035, color: LX.gold });

    slide.addText("ATUALIZADO EM", {
      x: PAD,
      y: 6.88,
      w: CONTENT_W,
      h: 0.2,
      fontFace: BODY_FONT,
      fontSize: 8,
      bold: true,
      color: LX.gold,
      charSpacing: 2,
    });
    slide.addText(`${formatSyncStamp()}  ·  SULTS API Service`, {
      x: PAD,
      y: 7.1,
      w: CONTENT_W,
      h: 0.26,
      fontFace: BODY_FONT,
      fontSize: 11,
      color: LX.muted,
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

  // radius em polegadas: rectRadius é fração do menor lado, então convertemos
  // para manter o mesmo arredondamento visual em cards de alturas diferentes.
  function panel(slide, { x, y, w, h, fill = LX.panel, border = LX.line, radius = 0.13 }) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: fill },
      line: { color: border, pt: 0.75 },
      rectRadius: Math.min(radius / Math.min(w, h), 0.5),
    });
  }

  function accentBar(slide, { x, y, w = 0.55, h = 0.05, color = LX.blue }) {
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color }, line: { color, pt: 0 } });
  }

  // ---------- 1. CAPA ----------
  const cover = newSlide("cover");
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
      y: 2.52,
      w: SLIDE_W,
      h: 1.2,
      align: "center",
      fontFace: TITLE_FONT,
      fontSize: 54,
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
  const kpiH = 2.05;
  const wide = unit * 1.35;

  panel(summary, { x: PAD, y: kpiY, w: wide, h: kpiH, fill: LX.deep, border: LX.goldSoft });
  summary.addText("INDICADOR CONSOLIDADO", {
    x: PAD + 0.32,
    y: kpiY + 0.26,
    w: wide - 0.64,
    h: 0.28,
    fontFace: BODY_FONT,
    fontSize: 10,
    color: "C9D2FF",
    charSpacing: 2,
  });
  summary.addText(String(consolidated), {
    x: PAD + 0.32,
    y: kpiY + 0.6,
    w: wide - 0.64,
    h: 0.85,
    valign: "middle",
    fontFace: TITLE_FONT,
    fontSize: 44,
    color: LX.goldL,
  });
  summary.addText("chamados + atividades no período", {
    x: PAD + 0.32,
    y: kpiY + 1.5,
    w: wide - 0.64,
    h: 0.28,
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
      x: x + 0.28,
      y: kpiY + 0.26,
      w: unit - 0.56,
      h: 0.4,
      fontFace: BODY_FONT,
      fontSize: 11,
      color: LX.muted,
    });
    summary.addText(String(item.value), {
      x: x + 0.28,
      y: kpiY + 0.68,
      w: unit - 0.56,
      h: 0.75,
      valign: "middle",
      fontFace: BODY_FONT,
      fontSize: 34,
      bold: true,
      color: LX.ink,
    });
    // Barra de acento logo abaixo do número, como no deck.
    accentBar(summary, { x: x + 0.28, y: kpiY + 1.5, color: item.accent });
  });
  if (watermarkEnabled) addPptWatermark(summary, "CONFIDENCIAL");
  footer(summary);

  // ---------- 3. CHAMADOS SULTS ----------
  const statusSlide = newSlide();
  header(statusSlide, { eyebrow: "Suporte · sincronização SULTS", title: "Chamados SULTS" });

  const cols = 3;
  const cardGap = 0.28;
  const cardW = (CONTENT_W - cardGap * (cols - 1)) / cols;
  const cardH = 1.32;
  rows.slice(0, 6).forEach((row, index) => {
    const col = index % cols;
    const line = Math.floor(index / cols);
    const x = PAD + col * (cardW + cardGap);
    const y = 2.5 + line * (cardH + cardGap);
    const isGold = normalizeText(row.status).includes("conclu");
    panel(statusSlide, {
      x,
      y,
      w: cardW,
      h: cardH,
      fill: isGold ? LX.goldTint : LX.blueTint,
      border: isGold ? LX.goldSoft : LX.blueSoft,
    });
    // Layout horizontal: rótulo à esquerda, número à direita (igual ao deck).
    statusSlide.addText(safeText(row.status), {
      x: x + 0.32,
      y,
      w: cardW - 1.5,
      h: cardH,
      valign: "middle",
      fontFace: BODY_FONT,
      fontSize: 13,
      color: isGold ? LX.goldL : LX.muted,
    });
    statusSlide.addText(String(row.primary), {
      x: x + cardW - 1.45,
      y,
      w: 1.15,
      h: cardH,
      valign: "middle",
      align: "right",
      fontFace: BODY_FONT,
      fontSize: 38,
      bold: true,
      color: isGold ? LX.goldL : LX.ink,
    });
  });
  statusSlide.addText(
    `${operationalTotal} chamados no período · ${renegotiated} com prazo renegociado`,
    {
      x: PAD,
      y: 5.75,
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

  // ---------- DESTAQUE DA SEMANA (antes -> depois) ----------
  // Renderizado depois das seções de atividades, logo antes do roadmap.
  const weekHighlights = collectWeekHighlights(sections);
  const renderWeekHighlightSlides = () => weekHighlights.forEach((item) => {
    const slide = newSlide();
    slide.addText(`DESTAQUE DA SEMANA · ${safeText(item.title).toUpperCase()}`, {
      x: 0,
      y: 1.35,
      w: SLIDE_W,
      h: 0.35,
      align: "center",
      fontFace: BODY_FONT,
      fontSize: 11,
      bold: true,
      color: LX.gold,
      charSpacing: 4,
    });
    slide.addText("Ganho de Performance", {
      x: 0,
      y: 1.78,
      w: SLIDE_W,
      h: 0.85,
      align: "center",
      fontFace: TITLE_FONT,
      fontSize: 38,
      color: LX.ink,
    });

    if (item.gainLabel) {
      slide.addText(item.gainLabel, {
        x: 0,
        y: 2.75,
        w: SLIDE_W,
        h: 1.35,
        align: "center",
        fontFace: TITLE_FONT,
        fontSize: 66,
        color: LX.goldL,
      });
    }

    // Cartões antes -> depois
    const boxW = 2.2;
    const arrowW = 0.7;
    const totalW = boxW * 2 + arrowW;
    const boxX = (SLIDE_W - totalW) / 2;
    const boxY = item.gainLabel ? 4.25 : 3.1;

    panel(slide, { x: boxX, y: boxY, w: boxW, h: 1.15, fill: LX.panel, border: LX.line });
    slide.addText("ANTES", {
      x: boxX,
      y: boxY + 0.18,
      w: boxW,
      h: 0.28,
      align: "center",
      fontFace: BODY_FONT,
      fontSize: 10,
      color: LX.muted,
      charSpacing: 2,
    });
    slide.addText(safeText(item.before), {
      x: boxX,
      y: boxY + 0.5,
      w: boxW,
      h: 0.5,
      align: "center",
      fontFace: BODY_FONT,
      fontSize: 22,
      bold: true,
      color: LX.body,
    });

    slide.addText("→", {
      x: boxX + boxW,
      y: boxY,
      w: arrowW,
      h: 1.15,
      align: "center",
      valign: "middle",
      fontFace: BODY_FONT,
      fontSize: 20,
      color: LX.gold,
    });

    const afterX = boxX + boxW + arrowW;
    panel(slide, { x: afterX, y: boxY, w: boxW, h: 1.15, fill: LX.goldTint, border: LX.goldSoft });
    slide.addText("DEPOIS", {
      x: afterX,
      y: boxY + 0.18,
      w: boxW,
      h: 0.28,
      align: "center",
      fontFace: BODY_FONT,
      fontSize: 10,
      color: LX.goldL,
      charSpacing: 2,
    });
    slide.addText(safeText(item.after), {
      x: afterX,
      y: boxY + 0.5,
      w: boxW,
      h: 0.5,
      align: "center",
      fontFace: BODY_FONT,
      fontSize: 22,
      bold: true,
      color: LX.goldL,
    });

    if (item.note) {
      slide.addText(safeText(item.note), {
        x: PAD,
        y: boxY + 1.4,
        w: CONTENT_W,
        h: 0.4,
        align: "center",
        fontFace: BODY_FONT,
        fontSize: 12,
        color: LX.muted,
      });
    }
    if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
    footer(slide);
  });

  // ---------- SEÇÕES DE ATIVIDADES ----------
  const populatedSections = (sections || []).filter(
    (section) =>
      !isRoadmapSectionName(section?.name) &&
      Array.isArray(section.activities) &&
      section.activities.length > 0
  );

  // Selo de status: cápsula com fundo tingido, ponto e rótulo na cor do status.
  function statusBadge(slide, status, { x, y, w = 1.62, h = 0.3 }) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x,
      y,
      w,
      h,
      fill: { color: status.tint },
      line: { color: status.color, pt: 0.75 },
      rectRadius: 0.5,
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: x + 0.16,
      y: y + h / 2 - 0.045,
      w: 0.09,
      h: 0.09,
      fill: { color: status.color },
      line: { color: status.color, pt: 0 },
    });
    slide.addText(status.label.toUpperCase(), {
      x: x + 0.3,
      y,
      w: w - 0.42,
      h,
      align: "left",
      valign: "middle",
      fontFace: BODY_FONT,
      fontSize: 8.5,
      bold: true,
      color: status.color,
      charSpacing: 1.2,
    });
  }

  /** Rótulo de bloco com marcador dourado — o "ícone" discreto do deck. */
  function blockLabel(slide, text, { x, y, w }) {
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y: y + 0.07,
      w: 0.055,
      h: 0.055,
      fill: { color: LX.gold },
      line: { color: LX.gold, pt: 0 },
    });
    slide.addText(text, {
      x: x + 0.13,
      y,
      w: w - 0.13,
      h: 0.2,
      fontFace: BODY_FONT,
      fontSize: 9,
      bold: true,
      color: LX.gold,
      charSpacing: 2.5,
    });
  }

  /** Grade de metadados no rodapé do card: chamado, tempo, equipe, prioridade. */
  function metaGrid(slide, entries, { x, y, w }) {
    const colW = w / 2;
    entries.forEach((entry, index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const cellX = x + col * colW;
      const cellY = y + row * CARD_META_ROW_H;
      slide.addText(entry.label, {
        x: cellX,
        y: cellY,
        w: colW - 0.1,
        h: 0.16,
        fontFace: BODY_FONT,
        fontSize: 7.5,
        bold: true,
        color: LX.dim,
        charSpacing: 1.5,
      });
      slide.addText(entry.value, {
        x: cellX,
        y: cellY + 0.16,
        w: colW - 0.1,
        h: 0.22,
        fontFace: BODY_FONT,
        fontSize: 10.5,
        color: LX.body,
      });
    });
  }

  // Caracteres por linha estimados na largura útil do card, por corpo de fonte.
  const EFFECT_CHARS_PER_LINE = 46;
  const DESC_CHARS_PER_LINE = 54;
  const DESC_LINE_H = 0.19;
  // Métricas do card — layout e desenho leem daqui para não divergirem.
  const CARD_HEADER_H = 0.9;
  const CARD_LABEL_H = 0.22;
  const CARD_EFFECT_LINE_H = 0.24;
  const CARD_EFFECT_MAX_H = 1.1;
  const CARD_META_ROW_H = 0.4;
  const CARD_OBSERVATION_H = 0.56;
  const CARD_TOP = 2.05;
  const CARD_MAX_H = 4.65;

  /**
   * Mede o card antes de desenhar, como no PDF: sem isso, conteúdo mais longo
   * que a altura fixa faz os blocos ancorados na base invadirem a descrição.
   */
  function activityCardLayout(activity) {
    const effect = preserveMultiline(activity?.systemEffect);
    const highlight = safeText(activity?.highlight);
    const meta = buildActivityMeta(activity);

    const effectItems = effect
      ? effect
          .split(/\n|;/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const effectLines = effectItems.reduce(
      (acc, item) => acc + Math.max(1, Math.ceil((item.length + 3) / EFFECT_CHARS_PER_LINE)),
      0
    );
    const effectH = effectItems.length
      ? Math.min(CARD_EFFECT_MAX_H, Math.max(0.28, effectLines * CARD_EFFECT_LINE_H))
      : 0;

    const descriptionLines = estimatePptLines(
      preserveMultiline(activity?.activity),
      DESC_CHARS_PER_LINE
    );
    const metaH = meta.length ? Math.ceil(meta.length / 2) * CARD_META_ROW_H + 0.06 : 0;
    const observationH = highlight ? CARD_OBSERVATION_H : 0;

    const headerH = CARD_HEADER_H;
    const effectBlockH = effectItems.length ? CARD_LABEL_H + effectH + 0.16 : 0;
    const descriptionBlockH = CARD_LABEL_H + Math.max(0.3, descriptionLines * DESC_LINE_H);

    return {
      effectItems,
      effectH,
      meta,
      metaH,
      observationH,
      highlight,
      descriptionLines,
      height: headerH + effectBlockH + descriptionBlockH + metaH + observationH + 0.2,
    };
  }

  /**
   * Card de atividade. A hierarquia é resultado > descrição técnica: quem lê o
   * deck é gestor, então o ganho entregue vem antes do detalhe de implementação.
   */
  function activityCard(slide, activity, { x, y, w, h }) {
    const highlight = safeText(activity?.highlight);
    const effect = preserveMultiline(activity?.systemEffect);
    const status = getActivityStatus(activity?.status);
    const accent = highlight ? LX.gold : LX.blue;

    panel(slide, { x, y, w, h });
    // A barra cobre o canto arredondado, deixando a aresta esquerda reta.
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 0.07,
      h,
      fill: { color: accent },
      line: { color: accent, pt: 0 },
    });

    const padL = x + 0.42;
    const innerW = w - 0.84;
    const badgeW = 1.62;

    statusBadge(slide, status, { x: x + w - 0.42 - badgeW, y: y + 0.25, w: badgeW });

    slide.addText(safeText(activity?.title) || "Atividade", {
      x: padL,
      y: y + 0.22,
      w: innerW - badgeW - 0.18,
      h: 0.44,
      fontFace: BODY_FONT,
      fontSize: 17,
      bold: true,
      color: LX.ink,
      valign: "middle",
    });

    // Fio fino separando o cabeçalho do conteúdo.
    slide.addShape(pptx.ShapeType.rect, {
      x: padL,
      y: y + 0.78,
      w: innerW,
      h: 0.012,
      fill: { color: LX.line },
      line: { color: LX.line, pt: 0 },
    });

    const { effectItems, effectH, meta, metaH, observationH, descriptionLines } =
      activityCardLayout(activity);

    // Rodapé montado de baixo para cima: nada se sobrepõe em nenhuma combinação.
    const bottomTotal = metaH + observationH;

    let cursor = y + CARD_HEADER_H;

    if (effectItems.length) {
      blockLabel(slide, "RESULTADO", { x: padL, y: cursor, w: innerW });
      cursor += CARD_LABEL_H;

      slide.addText(effectItems.map((item) => `✔  ${item}`).join("\n"), {
        x: padL,
        y: cursor,
        w: innerW,
        h: effectH,
        fontFace: BODY_FONT,
        fontSize: 13,
        color: LX.body,
        lineSpacingMultiple: 1.25,
        valign: "top",
      });
      cursor += effectH + 0.16;
    }

    blockLabel(slide, "ATIVIDADE", { x: padL, y: cursor, w: innerW });
    cursor += CARD_LABEL_H;

    // Se o texto não couber no espaço restante, corta: a caixa do PPT transborda
    // por cima dos blocos de baixo em vez de rolar.
    const descriptionH = Math.max(0.3, y + h - 0.2 - bottomTotal - cursor);
    // O epsilon é obrigatório: descriptionH vem de uma cadeia de subtrações e
    // 0.38/0.19 dá 1.9999… em ponto flutuante, o que descartaria uma linha
    // inteira e truncaria um texto que cabia.
    const availableLines = Math.max(1, Math.floor(descriptionH / DESC_LINE_H + 0.02));
    const fullDescription = preserveMultiline(activity?.activity);
    // Só corta quando o conteúdo realmente não cabe (card no teto de altura).
    const descriptionText =
      descriptionLines <= availableLines
        ? fullDescription
        : truncateRoadmapText(fullDescription, availableLines * DESC_CHARS_PER_LINE);

    slide.addText(descriptionText, {
      x: padL,
      y: cursor,
      w: innerW,
      h: descriptionH,
      fontFace: BODY_FONT,
      // Menor e mais apagada que o resultado: é o detalhe técnico de apoio.
      fontSize: 11,
      color: LX.muted,
      lineSpacingMultiple: 1.25,
      valign: "top",
    });

    let bottomCursor = y + h - 0.2;
    if (meta.length) {
      bottomCursor -= metaH;
      metaGrid(slide, meta, { x: padL, y: bottomCursor, w: innerW });
    }
    if (highlight) {
      bottomCursor -= observationH;
      blockLabel(slide, "OBSERVAÇÃO", { x: padL, y: bottomCursor, w: innerW });
      slide.addText(highlight, {
        x: padL,
        y: bottomCursor + CARD_LABEL_H,
        w: innerW,
        h: CARD_OBSERVATION_H - CARD_LABEL_H,
        fontFace: BODY_FONT,
        fontSize: 11,
        color: LX.goldL,
        valign: "top",
      });
    }
  }

  /**
   * Painel de panorama: ocupa a coluna livre quando a página tem um card só.
   * Mostra o total da semana e a distribuição por status.
   */
  /** Altura mínima do panorama: cabeçalho, total, barra e uma linha por status. */
  function overviewCardHeight() {
    const rows = ACTIVITY_STATUS.filter((item) => statusOverview.counts[item.value] > 0).length;
    return 2.05 + rows * 0.38 + 0.2;
  }

  function overviewCard(slide, { x, y, w, h }) {
    panel(slide, { x, y, w, h, fill: LX.blueTint, border: LX.blueSoft });

    const padL = x + 0.5;
    const innerW = w - 1;

    slide.addText("PANORAMA DA SEMANA", {
      x: padL,
      y: y + 0.42,
      w: innerW,
      h: 0.24,
      fontFace: BODY_FONT,
      fontSize: 9,
      bold: true,
      color: LX.gold,
      charSpacing: 2.5,
    });

    slide.addText(
      [
        { text: String(statusOverview.total), options: { fontSize: 46, color: LX.ink } },
        { text: "  atividades", options: { fontSize: 15, color: LX.muted } },
      ],
      {
        x: padL,
        y: y + 0.72,
        w: innerW,
        h: 0.8,
        fontFace: TITLE_FONT,
        valign: "middle",
      }
    );

    // Barra proporcional: uma faixa por status, na largura do painel.
    const present = ACTIVITY_STATUS.filter((item) => statusOverview.counts[item.value] > 0);
    if (statusOverview.total > 0) {
      let barX = padL;
      present.forEach((item) => {
        const segW = (statusOverview.counts[item.value] / statusOverview.total) * innerW;
        slide.addShape(pptx.ShapeType.rect, {
          x: barX,
          y: y + 1.66,
          w: segW,
          h: 0.13,
          fill: { color: item.color },
          line: { color: item.color, pt: 0 },
        });
        barX += segW;
      });
    }

    let rowY = y + 2.05;
    present.forEach((item) => {
      slide.addShape(pptx.ShapeType.ellipse, {
        x: padL,
        y: rowY + 0.11,
        w: 0.11,
        h: 0.11,
        fill: { color: item.color },
        line: { color: item.color, pt: 0 },
      });
      slide.addText(item.label, {
        x: padL + 0.26,
        y: rowY,
        w: innerW - 1,
        h: 0.32,
        fontFace: BODY_FONT,
        fontSize: 12,
        color: LX.body,
        valign: "middle",
      });
      slide.addText(String(statusOverview.counts[item.value]), {
        x: padL + innerW - 0.7,
        y: rowY,
        w: 0.7,
        h: 0.32,
        align: "right",
        fontFace: BODY_FONT,
        fontSize: 13,
        bold: true,
        color: item.color,
        valign: "middle",
      });
      rowY += 0.38;
    });
  }

  // Card de destaque azul (usado pelo "Fluxo Atendido").
  function calloutCard(slide, { x, y, w, h, label, value }) {
    panel(slide, { x, y, w, h, fill: LX.deep, border: LX.goldSoft });
    slide.addText(String(label || "").toUpperCase(), {
      x: x + 0.42,
      y: y + 0.45,
      w: w - 0.84,
      h: 0.32,
      fontFace: BODY_FONT,
      fontSize: 11,
      color: "C9D2FF",
      charSpacing: 2,
    });
    slide.addText(safeText(value), {
      x: x + 0.42,
      y: y + 0.85,
      w: w - 0.84,
      h: h - 1.3,
      fontFace: BODY_FONT,
      fontSize: 19,
      color: LX.ink,
      lineSpacingMultiple: 1.25,
      valign: "top",
    });
  }

  populatedSections.forEach((section, sectionIndex) => {
    const activities = sortActivitiesByPosition(section.activities || []);
    const number = String(sectionIndex + 1).padStart(2, "0");
    // Atividades com "Fluxo Atendido" ganham slide próprio, ao lado do card.
    const withFlow = activities.filter((item) => flowStepsText(item));
    const withoutFlow = activities.filter((item) => !flowStepsText(item));
    const pages = chunkList(withoutFlow, 2);
    const totalSlides = pages.length + withFlow.length;
    let slideNo = 0;

    function sectionHeader(slide) {
      slideNo += 1;
      header(slide, { eyebrow: "Seção de atividades", title: section.name, number });
      if (totalSlides > 1) {
        slide.addText(`${slideNo}/${totalSlides}`, {
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
    }

    pages.forEach((pageItems) => {
      const slide = newSlide();
      sectionHeader(slide);

      const aGap = 0.32;
      const aW = (CONTENT_W - aGap) / 2;
      // Os cards da página compartilham a altura do mais alto, limitada pelo
      // espaço entre o cabeçalho e o rodapé do slide.
      const aH = Math.min(
        CARD_MAX_H,
        Math.max(
          2.4,
          pageItems.length === 1 ? overviewCardHeight() : 0,
          ...pageItems.map((item) => activityCardLayout(item).height)
        )
      );

      pageItems.forEach((activity, index) => {
        activityCard(slide, activity, {
          x: PAD + index * (aW + aGap),
          y: CARD_TOP,
          w: aW,
          h: aH,
        });
      });

      // Página com um card só deixaria metade do slide vazia: o panorama da
      // semana ocupa a coluna livre em vez de esticar o card.
      if (pageItems.length === 1) {
        overviewCard(slide, { x: PAD + aW + aGap, y: CARD_TOP, w: aW, h: aH });
      }

      if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
      footer(slide);
    });

    withFlow.forEach((activity) => {
      const slide = newSlide();
      sectionHeader(slide);

      const fGap = 0.32;
      const leftW = (CONTENT_W - fGap) * 0.56;
      const rightW = CONTENT_W - fGap - leftW;
      const fH = 2.6;

      activityCard(slide, activity, { x: PAD, y: 2.3, w: leftW, h: fH });
      calloutCard(slide, {
        x: PAD + leftW + fGap,
        y: 2.3,
        w: rightW,
        h: fH,
        label: "Fluxo atendido",
        value: flowStepsText(activity),
      });

      if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
      footer(slide);
    });
  });

  // Ganho de Performance entra aqui: depois de todas as atividades.
  renderWeekHighlightSlides();

  // ---------- ROADMAP ----------
  // Um item por slide, em 2 colunas: card do item + card de impacto (como no deck).
  const roadmapItems = roadmapItemsFromSections(sections);
  roadmapItems.forEach((item, index) => {
    const slide = newSlide();
    header(slide, { eyebrow: "Melhoria contínua", title: "Roadmap de Ações" });
    if (roadmapItems.length > 1) {
      slide.addText(`${index + 1}/${roadmapItems.length}`, {
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

    const rGap = 0.32;
    const leftW = (CONTENT_W - rGap) * 0.55;
    const rightW = CONTENT_W - rGap - leftW;
    const rY = 2.3;
    const rH = 2.75;

    const diffColor =
      item.difficulty === "high" ? LX.danger : item.difficulty === "low" ? LX.ok : LX.goldL;
    const diffLabel =
      item.difficulty === "high" ? "Alta" : item.difficulty === "low" ? "Baixa" : "Média";

    // --- coluna esquerda: o item ---
    panel(slide, { x: PAD, y: rY, w: leftW, h: rH, border: LX.goldSoft });
    slide.addText(safeText(item.title) || "Item", {
      x: PAD + 0.4,
      y: rY + 0.32,
      w: leftW - 0.8,
      h: 0.6,
      fontFace: TITLE_FONT,
      fontSize: 24,
      color: LX.ink,
    });
    if (item.subtitle) {
      slide.addText(item.subtitle, {
        x: PAD + 0.4,
        y: rY + 0.95,
        w: leftW - 0.8,
        h: 0.4,
        fontFace: BODY_FONT,
        fontSize: 13,
        italic: true,
        color: LX.muted,
      });
    }

    const chips = [
      { label: `Dificuldade: ${diffLabel}`, color: diffColor },
      ...(item.category ? [{ label: item.category, color: LX.blueL }] : []),
      ...(item.cycleImplantation ? [{ label: `Ciclo: ${item.cycleImplantation}`, color: LX.muted }] : []),
    ];
    const chipH = 0.34;
    let chipX = PAD + 0.4;
    let chipY = rY + 1.55;
    chips.forEach((chip) => {
      const chipW = Math.min(0.085 * chip.label.length + 0.34, leftW - 0.8);
      if (chipX + chipW > PAD + leftW - 0.4) {
        chipX = PAD + 0.4;
        chipY += chipH + 0.12;
      }
      slide.addShape(pptx.ShapeType.roundRect, {
        x: chipX,
        y: chipY,
        w: chipW,
        h: chipH,
        fill: { color: LX.panel2 },
        line: { color: chip.color, pt: 0.75 },
        rectRadius: 0.5,
      });
      slide.addText(chip.label, {
        x: chipX,
        y: chipY,
        w: chipW,
        h: chipH,
        align: "center",
        valign: "middle",
        fontFace: BODY_FONT,
        fontSize: 9.5,
        color: chip.color,
      });
      chipX += chipW + 0.12;
    });

    // --- coluna direita: impacto esperado ---
    panel(slide, {
      x: PAD + leftW + rGap,
      y: rY,
      w: rightW,
      h: rH,
      fill: LX.deep,
      border: LX.goldSoft,
    });
    const ix = PAD + leftW + rGap;
    slide.addText("IMPACTO ESPERADO", {
      x: ix + 0.4,
      y: rY + 0.35,
      w: rightW - 0.8,
      h: 0.3,
      fontFace: BODY_FONT,
      fontSize: 11,
      color: "C9D2FF",
      charSpacing: 2,
    });

    // Destaca o percentual quando o texto de impacto traz um.
    const pct = String(item.impact || "").match(/(\d{1,3})\s*%/);
    let impactY = rY + 0.8;
    if (pct) {
      const reduction = /redu|queda|menos|diminu/i.test(item.impact) ? "-" : "";
      slide.addText(`${reduction}${pct[1]}%`, {
        x: ix + 0.4,
        y: rY + 0.72,
        w: rightW - 0.8,
        h: 0.95,
        fontFace: TITLE_FONT,
        fontSize: 44,
        color: LX.goldL,
      });
      impactY = rY + 1.72;
    }
    if (item.impact) {
      slide.addText(safeText(item.impact), {
        x: ix + 0.4,
        y: impactY,
        w: rightW - 0.8,
        h: rY + rH - 0.35 - impactY,
        fontFace: BODY_FONT,
        fontSize: 12.5,
        color: LX.body,
        lineSpacingMultiple: 1.25,
        valign: "top",
      });
    }

    if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
    footer(slide);
  });

  // ---------- RESUMO DAS ENTREGAS ----------
  // Fechamento executivo: o gestor costuma reter este slide, não o detalhe.
  const delivery = buildDeliverySummary(sections);
  if (delivery.total > 0) {
    const slide = newSlide();
    header(slide, { eyebrow: "Fechamento", title: "Resumo das Entregas" });

    const tableW = CONTENT_W * 0.56;
    const rowH = 0.42;
    const tableH = Math.min(3.9, (delivery.rows.length + 2) * rowH + 0.5);
    panel(slide, { x: PAD, y: 2.1, w: tableW, h: tableH });

    blockLabel(slide, "CATEGORIA", { x: PAD + 0.42, y: 2.34, w: tableW / 2 });
    slide.addText("ENTREGAS", {
      x: PAD + tableW - 1.5,
      y: 2.34,
      w: 1.08,
      h: 0.2,
      align: "right",
      fontFace: BODY_FONT,
      fontSize: 9,
      bold: true,
      color: LX.gold,
      charSpacing: 2.5,
    });

    let rowY = 2.72;
    delivery.rows.forEach((row) => {
      slide.addShape(pptx.ShapeType.rect, {
        x: PAD + 0.42,
        y: rowY - 0.06,
        w: tableW - 0.84,
        h: 0.008,
        fill: { color: LX.line },
        line: { color: LX.line, pt: 0 },
      });
      slide.addText(row.name, {
        x: PAD + 0.42,
        y: rowY,
        w: tableW - 2.1,
        h: rowH,
        fontFace: BODY_FONT,
        fontSize: 12.5,
        color: LX.body,
        valign: "middle",
      });
      slide.addText(String(row.total), {
        x: PAD + tableW - 1.5,
        y: rowY,
        w: 1.08,
        h: rowH,
        align: "right",
        fontFace: BODY_FONT,
        fontSize: 12.5,
        color: LX.ink,
        valign: "middle",
      });
      rowY += rowH;
    });

    slide.addShape(pptx.ShapeType.rect, {
      x: PAD + 0.42,
      y: rowY - 0.04,
      w: tableW - 0.84,
      h: 0.02,
      fill: { color: LX.goldSoft },
      line: { color: LX.goldSoft, pt: 0 },
    });
    slide.addText("Total", {
      x: PAD + 0.42,
      y: rowY + 0.04,
      w: tableW - 2.1,
      h: rowH,
      fontFace: BODY_FONT,
      fontSize: 13,
      bold: true,
      color: LX.goldL,
      valign: "middle",
    });
    slide.addText(String(delivery.total), {
      x: PAD + tableW - 1.5,
      y: rowY + 0.04,
      w: 1.08,
      h: rowH,
      align: "right",
      fontFace: BODY_FONT,
      fontSize: 15,
      bold: true,
      color: LX.goldL,
      valign: "middle",
    });

    // Checklist ao lado, derivado dos status reais das atividades.
    const checkX = PAD + tableW + 0.4;
    const checkW = CONTENT_W - tableW - 0.4;
    panel(slide, { x: checkX, y: 2.1, w: checkW, h: tableH, fill: LX.blueTint, border: LX.blueSoft });

    const blocked = statusOverview.counts.blocked;
    const checks = [
      `${statusOverview.counts.done} atividade(s) concluída(s)`,
      blocked > 0 ? `${blocked} atividade(s) bloqueada(s)` : "Nenhuma pendência crítica",
      "Entregas realizadas dentro do período",
    ];

    blockLabel(slide, "PANORAMA", { x: checkX + 0.42, y: 2.34, w: checkW - 0.84 });
    let checkY = 2.75;
    checks.forEach((text) => {
      slide.addText(`✔  ${text}`, {
        x: checkX + 0.42,
        y: checkY,
        w: checkW - 0.84,
        h: 0.5,
        fontFace: BODY_FONT,
        fontSize: 12.5,
        color: LX.body,
        valign: "top",
      });
      checkY += 0.56;
    });

    if (watermarkEnabled) addPptWatermark(slide, "CONFIDENCIAL");
    footer(slide);
  }

  // ---------- ENCERRAMENTO ----------
  const closing = newSlide("closing");
  closing.addText(`RELATÓRIO SEMANAL · ${formatPeriodPpt(startDate, endDate)}`, {
    x: 0,
    y: 2.75,
    w: SLIDE_W,
    h: 0.4,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 12,
    bold: true,
    color: LX.gold,
    charSpacing: 5,
  });
  closing.addText("Obrigado", {
    x: 0,
    y: 3.2,
    w: SLIDE_W,
    h: 1.1,
    align: "center",
    fontFace: TITLE_FONT,
    fontSize: 48,
    color: LX.ink,
  });
  closing.addText("Perguntas e próximos passos", {
    x: 0,
    y: 4.35,
    w: SLIDE_W,
    h: 0.45,
    align: "center",
    fontFace: BODY_FONT,
    fontSize: 15,
    color: LX.muted,
  });
  closing.addText(
    [
      { text: "</>  Christian Silveira", options: { color: LX.goldL } },
      { text: "     ·     ", options: { color: LX.dim } },
      { text: "Conectando código, café e criatividade", options: { color: LX.muted } },
    ],
    {
      x: 0,
      y: 5.0,
      w: SLIDE_W,
      h: 0.35,
      align: "center",
      fontFace: BODY_FONT,
      fontSize: 12,
    }
  );
  footer(closing);

  await pptx.writeFile({ fileName: buildExportFileName(startDate, endDate, "pptx") });
}
