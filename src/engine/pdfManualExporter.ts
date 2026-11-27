import { jsPDF } from 'jspdf';
import { getMessages, Locale } from '../i18n';
import { ContextAssemblyResult, DependencyEdge } from '../types/context';
import { APP_VERSION } from '../version';

export interface PdfManualExportInput {
  projectLabel: string;
  query: string;
  maxHops: 1 | 2;
  assembly: ContextAssemblyResult;
  edges: DependencyEdge[];
  locale?: Locale;
}

const A4_W = 595.28;
const A4_H = 841.89;
const SCALE = 2;
const MARGIN_X = 38;
const MARGIN_TOP = 46;
const MARGIN_BOTTOM = 44;
const CONTENT_W = A4_W - MARGIN_X * 2;
const MAX_PDF_PAGES = 18;

const SANS_FONT =
  '"PingFang TC", "Microsoft JhengHei", "Noto Sans TC", "DM Sans", system-ui, sans-serif';
const MONO_FONT =
  '"JetBrains Mono", "Consolas", "Courier New", monospace';

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  for (const para of paragraphs) {
    if (para === '') {
      out.push('');
      continue;
    }
    let current = '';
    for (const ch of para) {
      const candidate = current + ch;
      if (ctx.measureText(candidate).width > maxWidth && current.length > 0) {
        out.push(current);
        current = ch;
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) out.push(current);
  }
  return out;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export async function exportContextManualPdf(input: PdfManualExportInput): Promise<void> {
  const { projectLabel, query, maxHops, assembly, edges, locale = 'zh-TW' } = input;
  const { pdf: txt } = getMessages(locale);
  const now = new Date();
  const timestampStr = now.toLocaleString(txt.dateLocale, { hour12: false });
  const fileStamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes(),
  ).padStart(2, '0')}`;

  const pages: Array<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }> = [];

  const createPage = (isFirst: boolean) => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(A4_W * SCALE);
    canvas.height = Math.round(A4_H * SCALE);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error(txt.canvasError);
    ctx.scale(SCALE, SCALE);

    // Clean white technical sheet background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, A4_W, A4_H);

    // Top accent rule
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(0, 0, A4_W, isFirst ? 6 : 3);

    if (!isFirst) {
      ctx.font = `500 8.5px ${SANS_FONT}`;
      ctx.fillStyle = '#64748B';
      ctx.fillText(txt.runningHeader(APP_VERSION), MARGIN_X, 24);
      ctx.textAlign = 'right';
      ctx.fillText(projectLabel, A4_W - MARGIN_X, 24);
      ctx.textAlign = 'left';

      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, 31);
      ctx.lineTo(A4_W - MARGIN_X, 31);
      ctx.stroke();
    }

    pages.push({ canvas, ctx });
    return ctx;
  };

  let ctx = createPage(true);
  let y = 32;

  const ensureSpace = (neededHeight: number): boolean => {
    if (y + neededHeight <= A4_H - MARGIN_BOTTOM) return true;
    if (pages.length >= MAX_PDF_PAGES) return false;
    ctx = createPage(false);
    y = MARGIN_TOP;
    return true;
  };

  const drawSectionHeading = (num: string, title: string, subtitle?: string) => {
    if (!ensureSpace(subtitle ? 36 : 24)) return false;
    ctx.fillStyle = '#0284C7';
    ctx.fillRect(MARGIN_X, y + 2, 3.5, 13);

    ctx.font = `700 12.5px ${SANS_FONT}`;
    ctx.fillStyle = '#0F172A';
    ctx.fillText(`${num}. ${title}`, MARGIN_X + 10, y + 13);
    y += 20;

    if (subtitle) {
      ctx.font = `400 9px ${SANS_FONT}`;
      ctx.fillStyle = '#64748B';
      ctx.fillText(subtitle, MARGIN_X + 10, y + 8);
      y += 14;
    }
    return true;
  };

  // === Page 1 Title Banner ===
  drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, 74, 8, '#F8FAFC', '#CBD5E1');
  ctx.font = `700 16px ${SANS_FONT}`;
  ctx.fillStyle = '#0F172A';
  ctx.fillText(txt.titleBanner, MARGIN_X + 16, y + 25);

  ctx.font = `600 9px ${MONO_FONT}`;
  ctx.fillStyle = '#0284C7';
  ctx.textAlign = 'right';
  ctx.fillText(`${APP_VERSION} · OFFLINE BRIEF`, A4_W - MARGIN_X - 14, y + 24);
  ctx.textAlign = 'left';

  ctx.font = `400 9.5px ${SANS_FONT}`;
  ctx.fillStyle = '#334155';
  const metaLine1 = txt.metaLine1(projectLabel, maxHops, timestampStr);
  ctx.fillText(metaLine1.slice(0, 95), MARGIN_X + 16, y + 45);

  ctx.fillStyle = '#475569';
  const taskText = txt.taskLabel(query.trim());
  ctx.fillText(taskText.slice(0, 88), MARGIN_X + 16, y + 61);
  y += 88;

  // === Section 1: Executive Metrics ===
  drawSectionHeading('1', txt.sec1Title);
  const cardGap = 8;
  const cardW = (CONTENT_W - cardGap * 3) / 4;
  const cardH = 52;
  const cards = [
    {
      label: txt.cardRawLabel,
      value: `${assembly.metrics.rawRepoTokens.toLocaleString()} tk`,
      note: txt.cardRawNote(assembly.nodePlans.length),
      accent: '#334155',
    },
    {
      label: txt.cardSlicedLabel,
      value: `${assembly.totalInjectedTokens.toLocaleString()} tk`,
      note: txt.cardSlicedNote(assembly.budgetTokens.toLocaleString(), assembly.budgetUtilizationPercent),
      accent: '#0284C7',
    },
    {
      label: txt.cardSavedLabel,
      value: `${assembly.metrics.netSavingsVsTraditionalPercent}%`,
      note: txt.cardSavedNote(assembly.metrics.codeReductionPercent),
      accent: '#059669',
    },
    {
      label: txt.cardAutoLabel,
      value: txt.cardAutoValue(assembly.autoExpandedNodeIds.length),
      note: txt.cardAutoNote(assembly.detectedClusters.length),
      accent: '#D97706',
    },
  ];

  cards.forEach((c, idx) => {
    const cx = MARGIN_X + idx * (cardW + cardGap);
    drawRoundedRect(ctx, cx, y, cardW, cardH, 6, '#F8FAFC', '#E2E8F0');
    ctx.font = `500 8.5px ${SANS_FONT}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(c.label, cx + 10, y + 16);

    ctx.font = `700 13px ${MONO_FONT}`;
    ctx.fillStyle = c.accent;
    ctx.fillText(c.value, cx + 10, y + 33);

    ctx.font = `400 8px ${SANS_FONT}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(c.note, cx + 10, y + 45);
  });
  y += cardH + 16;

  // === Section 2: Expanded & Focal Nodes ===
  const fullNodes = assembly.nodePlans.filter((p) => p.tier === 'full');
  drawSectionHeading(
    '2',
    txt.sec2Title,
    txt.sec2Subtitle(fullNodes.length),
  );

  if (fullNodes.length === 0) {
    ensureSpace(24);
    ctx.font = `400 9.5px ${SANS_FONT}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(txt.sec2Empty, MARGIN_X + 10, y + 12);
    y += 22;
  } else {
    for (const plan of fullNodes.slice(0, 18)) {
      if (!ensureSpace(36)) break;
      const bg = plan.autoExpanded ? '#ECFDF5' : '#F0F9FF';
      const border = plan.autoExpanded ? '#A7F3D0' : '#BAE6FD';
      drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, 30, 5, bg, border);

      const badge = plan.autoExpanded
        ? txt.badgeAuto
        : plan.isFocal
          ? txt.badgeFocal
          : txt.badgeManual;
      ctx.font = `700 9px ${SANS_FONT}`;
      ctx.fillStyle = plan.autoExpanded ? '#047857' : '#0369A1';
      ctx.fillText(badge, MARGIN_X + 10, y + 12);

      ctx.font = `700 9.5px ${MONO_FONT}`;
      ctx.fillStyle = '#0F172A';
      ctx.fillText(plan.node.name.slice(0, 36), MARGIN_X + 102, y + 12);

      ctx.font = `500 8.5px ${MONO_FONT}`;
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${plan.injectedTokens} tk · ${txt.lineUnit(plan.node.lineCount)}`,
        A4_W - MARGIN_X - 10,
        y + 12,
      );
      ctx.textAlign = 'left';

      ctx.font = `400 8.5px ${SANS_FONT}`;
      ctx.fillStyle = '#475569';
      const detail = `${plan.node.filePath}:${plan.node.startLine}-${plan.node.endLine}  ·  ${plan.reason}`;
      ctx.fillText(detail.slice(0, 92), MARGIN_X + 10, y + 24);
      y += 34;
    }
  }
  y += 8;

  // === Section 3: Dependency Analysis ===
  const crossFileCount = edges.filter((e) => e.sourceFileId !== e.targetFileId).length;
  const intraFileCount = edges.length - crossFileCount;
  drawSectionHeading(
    '3',
    txt.sec3Title,
    txt.sec3Subtitle(
      assembly.countsByTier.full,
      assembly.countsByTier.skeleton,
      assembly.countsByTier.map,
      assembly.countsByTier.excluded,
      edges.length,
      crossFileCount,
      intraFileCount,
    ),
  );

  const nodeById = new Map(assembly.nodePlans.map((p) => [p.node.id, p]));
  const focalOrFullSet = new Set(fullNodes.map((p) => p.node.id));
  const prioritizedEdges = [...edges].sort((a, b) => {
    const aHot = focalOrFullSet.has(a.sourceNodeId) || focalOrFullSet.has(a.targetNodeId) ? 1 : 0;
    const bHot = focalOrFullSet.has(b.sourceNodeId) || focalOrFullSet.has(b.targetNodeId) ? 1 : 0;
    return bHot - aHot;
  });

  if (prioritizedEdges.length > 0) {
    for (const edge of prioritizedEdges.slice(0, 14)) {
      if (!ensureSpace(17)) break;
      const src = nodeById.get(edge.sourceNodeId);
      const dst = nodeById.get(edge.targetNodeId);
      if (!src || !dst) continue;

      const kindLabel =
        edge.kind === 'intra-file'
          ? txt.edgeKindIntra
          : edge.kind === 'import'
            ? txt.edgeKindImport
            : txt.edgeKindCross;
      ctx.font = `400 8.5px ${MONO_FONT}`;
      ctx.fillStyle = '#0F172A';
      const line = `• ${src.node.name}  ──(${kindLabel})──▶  ${dst.node.name}   [${txt.tierText[dst.tier]}]`;
      ctx.fillText(line.slice(0, 95), MARGIN_X + 8, y + 11);
      y += 15;
    }
  } else {
    ensureSpace(20);
    ctx.font = `400 9px ${SANS_FONT}`;
    ctx.fillStyle = '#64748B';
    ctx.fillText(txt.sec3Empty, MARGIN_X + 8, y + 11);
    y += 18;
  }

  // Included Nodes Compact Table
  const includedPlans = assembly.nodePlans.filter((p) => p.tier !== 'excluded').slice(0, 22);
  if (includedPlans.length > 0 && ensureSpace(38)) {
    y += 6;
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, 18, 3, '#F1F5F9');
    ctx.font = `700 8.5px ${SANS_FONT}`;
    ctx.fillStyle = '#334155';
    ctx.fillText(txt.tblName, MARGIN_X + 8, y + 12);
    ctx.fillText(txt.tblFile, MARGIN_X + 190, y + 12);
    ctx.fillText(txt.tblTier, MARGIN_X + 365, y + 12);
    ctx.textAlign = 'right';
    ctx.fillText(txt.tblTokens, A4_W - MARGIN_X - 8, y + 12);
    ctx.textAlign = 'left';
    y += 20;

    for (const plan of includedPlans) {
      if (!ensureSpace(16)) break;
      ctx.font = `500 8.5px ${MONO_FONT}`;
      ctx.fillStyle = '#0F172A';
      ctx.fillText(plan.node.name.slice(0, 26), MARGIN_X + 8, y + 10);

      ctx.font = `400 8px ${MONO_FONT}`;
      ctx.fillStyle = '#475569';
      const fileShort = plan.node.filePath.split('/').pop() || plan.node.filePath;
      ctx.fillText(`${fileShort}:${plan.node.startLine}`.slice(0, 28), MARGIN_X + 190, y + 10);

      ctx.font = `500 8px ${SANS_FONT}`;
      ctx.fillStyle =
        plan.tier === 'full' ? '#047857' : plan.tier === 'skeleton' ? '#B45309' : '#475569';
      ctx.fillText(plan.autoExpanded ? txt.autoExpandedLabel : txt.tierText[plan.tier], MARGIN_X + 365, y + 10);

      ctx.font = `500 8.5px ${MONO_FONT}`;
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'right';
      ctx.fillText(`${plan.injectedTokens} / ${plan.node.rawTokens}`, A4_W - MARGIN_X - 8, y + 10);
      ctx.textAlign = 'left';

      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(MARGIN_X, y + 14);
      ctx.lineTo(A4_W - MARGIN_X, y + 14);
      ctx.stroke();
      y += 15;
    }
  }
  y += 12;

  // === Section 4: Assembled Context Packet ===
  drawSectionHeading(
    '4',
    txt.sec4Title,
    txt.sec4Subtitle,
  );

  ctx.font = `400 8px ${MONO_FONT}`;
  const packetLines = wrapLines(ctx, assembly.assembledPacket, CONTENT_W - 18);
  const lineH = 11.2;
  let truncatedForPages = false;

  for (let i = 0; i < packetLines.length; i++) {
    if (!ensureSpace(lineH + 6)) {
      truncatedForPages = true;
      break;
    }
    drawRoundedRect(ctx, MARGIN_X, y, CONTENT_W, lineH + 1, 0, '#F8FAFC');
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(MARGIN_X, y);
    ctx.lineTo(MARGIN_X, y + lineH + 1);
    ctx.moveTo(A4_W - MARGIN_X, y);
    ctx.lineTo(A4_W - MARGIN_X, y + lineH + 1);
    ctx.stroke();

    ctx.font = `400 8px ${MONO_FONT}`;
    ctx.fillStyle = '#1E293B';
    ctx.fillText(packetLines[i], MARGIN_X + 9, y + 8.5);
    y += lineH;
  }

  if (truncatedForPages) {
    const lastCtx = pages[pages.length - 1].ctx;
    lastCtx.font = `600 8.5px ${SANS_FONT}`;
    lastCtx.fillStyle = '#B45309';
    lastCtx.fillText(
      txt.truncatedNotice(MAX_PDF_PAGES),
      MARGIN_X,
      Math.min(A4_H - MARGIN_BOTTOM - 4, y + 12),
    );
  }

  // Stamp crisp page footers across all pages
  const totalPages = pages.length;
  pages.forEach((p, idx) => {
    const fCtx = p.ctx;
    fCtx.strokeStyle = '#E2E8F0';
    fCtx.lineWidth = 0.75;
    fCtx.beginPath();
    fCtx.moveTo(MARGIN_X, A4_H - 30);
    fCtx.lineTo(A4_W - MARGIN_X, A4_H - 30);
    fCtx.stroke();

    fCtx.font = `400 8px ${SANS_FONT}`;
    fCtx.fillStyle = '#64748B';
    fCtx.fillText(txt.footerPrivacy(APP_VERSION), MARGIN_X, A4_H - 18);
    fCtx.textAlign = 'right';
    fCtx.fillText(txt.footerPage(idx + 1, totalPages), A4_W - MARGIN_X, A4_H - 18);
    fCtx.textAlign = 'left';
  });

  // Build PDF document
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  pages.forEach((p, idx) => {
    if (idx > 0) pdf.addPage('a4', 'portrait');
    const imgData = p.canvas.toDataURL('image/jpeg', 0.92);
    pdf.addImage(imgData, 'JPEG', 0, 0, A4_W, A4_H, undefined, 'FAST');
  });

  pdf.save(`contextslice-manual-${fileStamp}.pdf`);
}
