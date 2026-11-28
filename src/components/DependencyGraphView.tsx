import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Code2, Crosshair, Eye, EyeOff, FilePlus2, FolderOpen, Map as MapIcon, Maximize2, Minimize2, Search, ZoomIn, ZoomOut } from 'lucide-react';
import { useI18n } from '../i18n';
import {
  ComputedNodePlan,
  DependencyEdge,
  NodeTier,
  OverrideMode,
} from '../types/context';

interface DependencyGraphViewProps {
  fileCount?: number;
  nodePlans: ComputedNodePlan[];
  edges: DependencyEdge[];
  selectedNodeId: string | null;
  focusRequest?: { nodeId: string; seq: number } | null;
  onOpenImport?: () => void;
  onImportFolder?: () => void;
  onImportFiles?: () => void;
  onOpenPaste?: () => void;
  onSelectNode: (nodeId: string) => void;
  onToggleFocal: (nodeId: string) => void;
  onSetOverride: (nodeId: string, override: OverrideMode) => void;
  onInspectDiff: (nodeId: string) => void;
}

interface PositionedNode {
  plan: ComputedNodePlan;
  x: number;
  y: number;
  width: number;
  height: number;
  role: 'caller-2' | 'caller-1' | 'focal' | 'callee-1' | 'callee-2' | 'external';
}

const TIER_STROKE: Record<NodeTier, string> = {
  full: '#34D399',
  skeleton: '#FBBF24',
  map: '#64748B',
  excluded: '#334155',
};

export function DependencyGraphView({
  fileCount = 0,
  nodePlans,
  edges,
  selectedNodeId,
  focusRequest,
  onOpenImport,
  onImportFolder,
  onImportFiles,
  onOpenPaste,
  onSelectNode,
  onToggleFocal,
  onSetOverride,
  onInspectDiff,
}: DependencyGraphViewProps) {
  const { locale, t } = useI18n();
  const [pan, setPan] = useState({ x: 36, y: 44 });
  const [zoom, setZoom] = useState(1);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [onlyConnected, setOnlyConnected] = useState<boolean>(true);
  const [jumpQuery, setJumpQuery] = useState('');
  const [jumpOpen, setJumpOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 520 });

  const containerRef = useRef<HTMLDivElement>(null);
  const minimapSvgRef = useRef<SVGSVGElement>(null);
  const minimapDragRef = useRef(false);
  const pendingFocusNodeIdRef = useRef<string | null>(null);
  const skipNextAutoFitRef = useRef(false);
  const viewTransformRef = useRef({ pan, zoom });
  viewTransformRef.current = { pan, zoom };

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Compute directional butterfly call hierarchy:
  // Upstream Callers (Left) -> Focal Target (Center) -> Downstream Callees (Right)
  const layout = useMemo(() => {
    const focalPlans = nodePlans.filter((p) => p.isFocal || p.hopDistance === 0);
    const focalSet = new Set(focalPlans.map((p) => p.node.id));

    const callersOf = new Map<string, Set<string>>();
    const calleesOf = new Map<string, Set<string>>();
    for (const p of nodePlans) {
      callersOf.set(p.node.id, new Set());
      calleesOf.set(p.node.id, new Set());
    }
    for (const e of edges) {
      calleesOf.get(e.sourceNodeId)?.add(e.targetNodeId);
      callersOf.get(e.targetNodeId)?.add(e.sourceNodeId);
    }

    const caller1 = new Set<string>();
    const caller2 = new Set<string>();
    const callee1 = new Set<string>();
    const callee2 = new Set<string>();

    for (const fId of focalSet) {
      for (const c of callersOf.get(fId) ?? []) {
        if (!focalSet.has(c)) caller1.add(c);
      }
      for (const c of calleesOf.get(fId) ?? []) {
        if (!focalSet.has(c)) callee1.add(c);
      }
    }

    for (const c1 of caller1) {
      for (const c of callersOf.get(c1) ?? []) {
        if (!focalSet.has(c) && !caller1.has(c)) caller2.add(c);
      }
    }
    for (const c1 of callee1) {
      for (const c of calleesOf.get(c1) ?? []) {
        if (!focalSet.has(c) && !callee1.has(c)) callee2.add(c);
      }
    }

    const planById = new Map(nodePlans.map((p) => [p.node.id, p]));
    const assigned = new Set<string>([...focalSet, ...caller1, ...caller2, ...callee1, ...callee2]);

    // Any remaining hop 1/2 nodes reached via reverse/mixed traversal fall into callee/caller neatly
    const remainingConnected = nodePlans.filter(
      (p) => !assigned.has(p.node.id) && p.hopDistance !== null,
    );
    for (const p of remainingConnected) {
      callee1.add(p.node.id);
      assigned.add(p.node.id);
    }

    const bucketDefs: Array<{ role: PositionedNode['role']; plans: ComputedNodePlan[] }> = [
      { role: 'caller-2', plans: Array.from(caller2).map((id) => planById.get(id)!).filter(Boolean) },
      { role: 'caller-1', plans: Array.from(caller1).map((id) => planById.get(id)!).filter(Boolean) },
      { role: 'focal', plans: focalPlans },
      { role: 'callee-1', plans: Array.from(callee1).map((id) => planById.get(id)!).filter(Boolean) },
      { role: 'callee-2', plans: Array.from(callee2).map((id) => planById.get(id)!).filter(Boolean) },
    ];

    const externalPlans = nodePlans.filter((p) => !assigned.has(p.node.id));
    if (!onlyConnected && externalPlans.length > 0) {
      bucketDefs.push({ role: 'external', plans: externalPlans });
    }

    const activeCols = bucketDefs.filter((b) => b.plans.length > 0);
    const NODE_W = 238;
    const NODE_H = 82;
    const COL_GAP = 84;
    const ROW_GAP = 16;

    const maxRows = Math.max(1, ...activeCols.map((c) => c.plans.length));
    const totalHeight = maxRows * (NODE_H + ROW_GAP);

    const positioned: PositionedNode[] = [];
    const byId = new Map<string, PositionedNode>();
    const columnHeaders: Array<{ role: PositionedNode['role']; x: number; count: number }> = [];

    activeCols.forEach((col, colIdx) => {
      const colHeight = col.plans.length * NODE_H + Math.max(0, col.plans.length - 1) * ROW_GAP;
      const startY = Math.max(44, (totalHeight - colHeight) / 2);
      const x = colIdx * (NODE_W + COL_GAP) + 28;
      columnHeaders.push({ role: col.role, x, count: col.plans.length });

      col.plans.forEach((plan, rowIdx) => {
        const y = startY + rowIdx * (NODE_H + ROW_GAP);
        const item: PositionedNode = { plan, x, y, width: NODE_W, height: NODE_H, role: col.role };
        positioned.push(item);
        byId.set(plan.node.id, item);
      });
    });

    return {
      positioned,
      byId,
      columnHeaders,
      hiddenCount: onlyConnected ? externalPlans.length : 0,
    };
  }, [nodePlans, edges, onlyConnected]);

  const fitGraphToViewport = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || layout.positioned.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of layout.positioned) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y - 28);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }

    const contentW = Math.max(1, maxX - minX);
    const contentH = Math.max(1, maxY - minY);
    const pad = 48;
    const fitZoom = Math.min(
      1.05,
      Math.max(0.45, Math.min((rect.width - pad * 2) / contentW, (rect.height - pad * 2) / contentH)),
    );
    const centeredX = (rect.width - contentW * fitZoom) / 2 - minX * fitZoom;
    const centeredY = (rect.height - contentH * fitZoom) / 2 - minY * fitZoom;

    setZoom(Number(fitZoom.toFixed(2)));
    setPan({ x: Math.round(centeredX), y: Math.round(centeredY) });
  };

  // Track live canvas dimensions for accurate minimap viewport frame
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cursor-anchored mouse wheel zoom with passive: false to block outer page scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;
      const { pan: curPan, zoom: curZoom } = viewTransformRef.current;

      const factor = Math.exp(-e.deltaY * 0.0014);
      const nextZoom = Math.min(2.2, Math.max(0.25, Number((curZoom * factor).toFixed(3))));
      if (nextZoom === curZoom) return;

      const worldX = (cursorX - curPan.x) / curZoom;
      const worldY = (cursorY - curPan.y) / curZoom;

      setZoom(nextZoom);
      setPan({
        x: Math.round(cursorX - worldX * nextZoom),
        y: Math.round(cursorY - worldY * nextZoom),
      });
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  // Auto-center smoothly when switching presets or toggling focus-only mode
  useEffect(() => {
    if (skipNextAutoFitRef.current) {
      skipNextAutoFitRef.current = false;
      return;
    }
    const t = setTimeout(fitGraphToViewport, 20);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyConnected, layout.positioned.length]);

  // Compute minimap bounding projection
  const MINIMAP_W = 196;
  const MINIMAP_H = 126;
  const minimap = useMemo(() => {
    if (layout.positioned.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of layout.positioned) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y - 24);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
    const pad = 44;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const scale = Math.min((MINIMAP_W - 12) / worldW, (MINIMAP_H - 12) / worldH);
    const offsetX = (MINIMAP_W - worldW * scale) / 2;
    const offsetY = (MINIMAP_H - worldH * scale) / 2;

    // Live visible viewport rectangle in world coordinates
    const viewWorldX = -pan.x / zoom;
    const viewWorldY = -pan.y / zoom;
    const viewWorldW = viewportSize.width / zoom;
    const viewWorldH = viewportSize.height / zoom;

    return {
      minX,
      minY,
      scale,
      offsetX,
      offsetY,
      viewRect: {
        x: offsetX + (viewWorldX - minX) * scale,
        y: offsetY + (viewWorldY - minY) * scale,
        width: Math.max(8, viewWorldW * scale),
        height: Math.max(8, viewWorldH * scale),
      },
    };
  }, [layout.positioned, pan.x, pan.y, zoom, viewportSize.width, viewportSize.height]);

  const panToMinimapClientPoint = (clientX: number, clientY: number) => {
    if (!minimap || !minimapSvgRef.current) return;
    const svgRect = minimapSvgRef.current.getBoundingClientRect();
    const mx = clientX - svgRect.left;
    const my = clientY - svgRect.top;
    const worldX = minimap.minX + (mx - minimap.offsetX) / minimap.scale;
    const worldY = minimap.minY + (my - minimap.offsetY) / minimap.scale;

    setPan({
      x: Math.round(viewportSize.width / 2 - worldX * zoom),
      y: Math.round(viewportSize.height / 2 - worldY * zoom),
    });
  };

  const jumpMatches = useMemo(() => {
    const q = jumpQuery.trim().toLowerCase();
    if (!q) return nodePlans.slice(0, 12);
    return nodePlans
      .filter(
        (p) =>
          p.node.name.toLowerCase().includes(q) ||
          p.node.filePath.toLowerCase().includes(q),
      )
      .slice(0, 14);
  }, [jumpQuery, nodePlans]);

  const centerOnNode = (nodeId: string) => {
    onSelectNode(nodeId);
    const pos = layout.byId.get(nodeId);
    const rect = containerRef.current?.getBoundingClientRect();
    if (pos && rect) {
      const targetZoom = Math.max(zoom, 0.95);
      setZoom(targetZoom);
      setPan({
        x: Math.round(rect.width / 2 - (pos.x + pos.width / 2) * targetZoom),
        y: Math.round(rect.height / 2 - (pos.y + pos.height / 2) * targetZoom),
      });
    }
    setJumpOpen(false);
  };

  // Focus & pan canvas when SymbolExplorer (or another view) requests focusing an AST node
  useEffect(() => {
    if (!focusRequest) return;
    const { nodeId } = focusRequest;
    const pos = layout.byId.get(nodeId);
    if (pos) {
      pendingFocusNodeIdRef.current = null;
      centerOnNode(nodeId);
      return;
    }
    if (onlyConnected && nodePlans.some((p) => p.node.id === nodeId)) {
      pendingFocusNodeIdRef.current = nodeId;
      skipNextAutoFitRef.current = true;
      setOnlyConnected(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  useEffect(() => {
    const pendingId = pendingFocusNodeIdRef.current;
    if (!pendingId) return;
    if (layout.byId.has(pendingId)) {
      pendingFocusNodeIdRef.current = null;
      centerOnNode(pendingId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const activeHighlightId = hoveredNodeId ?? selectedNodeId;
  const selectedPlan = nodePlans.find((p) => p.node.id === selectedNodeId) ?? nodePlans[0] ?? null;

  const statusSummary = useMemo(() => {
    let autoExpandedCount = 0;
    let manualOverrideCount = 0;
    let highComplexityCount = 0;
    for (const item of layout.positioned) {
      if (item.plan.autoExpanded) autoExpandedCount += 1;
      if (item.plan.override !== 'auto') manualOverrideCount += 1;
      if ((item.plan.complexityScore ?? 0) >= 46) highComplexityCount += 1;
    }
    return { autoExpandedCount, manualOverrideCount, highComplexityCount };
  }, [layout.positioned]);

  const zoomAroundViewportCenter = (delta: number) => {
    const cx = viewportSize.width / 2;
    const cy = viewportSize.height / 2;
    const nextZoom = Math.min(2.2, Math.max(0.25, Number((zoom + delta).toFixed(2))));
    if (nextZoom === zoom) return;
    const worldX = (cx - pan.x) / zoom;
    const worldY = (cy - pan.y) / zoom;
    setZoom(nextZoom);
    setPan({
      x: Math.round(cx - worldX * nextZoom),
      y: Math.round(cy - worldY * nextZoom),
    });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Allow middle-button drag anywhere, or left-button drag on canvas background
    const isMiddle = e.button === 1;
    if (!isMiddle && (e.target as HTMLElement).closest('[data-graph-node="true"]')) return;
    if (isMiddle) e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    setPan({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0B0F17]">
      {/* Graph Legend, Filter & Quick Jump Controls */}
      {nodePlans.length > 0 && (
      <div className="px-4 py-2.5 border-b border-slate-800/80 bg-[#0E1420] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {/* Focus Mode Toggle */}
          <button
            type="button"
            onClick={() => setOnlyConnected((v) => !v)}
            className={`px-2.5 py-1.5 rounded border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              onlyConnected
                ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                : 'bg-[#111827] border-slate-700 text-slate-300 hover:border-slate-500'
            }`}
          >
            {onlyConnected ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {onlyConnected
              ? t.graph.onlyConnected(layout.hiddenCount)
              : t.graph.showAll(nodePlans.length)}
          </button>

          {/* Quick Jump to Endpoint / Function */}
          <div className="relative">
            <div className="flex items-center">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={jumpQuery}
                onFocus={() => setJumpOpen(true)}
                onBlur={() => setTimeout(() => setJumpOpen(false), 180)}
                onChange={(e) => {
                  setJumpQuery(e.target.value);
                  setJumpOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && jumpMatches.length > 0) {
                    const targetId = jumpMatches[0].node.id;
                    if (!layout.byId.has(targetId)) {
                      onToggleFocal(targetId);
                    }
                    centerOnNode(targetId);
                  }
                }}
                placeholder={t.graph.jumpPlaceholder}
                className="h-8 w-48 pl-8 pr-2.5 bg-[#0B0F17] border border-slate-700/80 rounded text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
              />
            </div>

            {jumpOpen && jumpMatches.length > 0 && (
              <div className="absolute left-0 top-9 z-30 w-72 max-h-64 overflow-y-auto rounded border border-slate-700 bg-[#111827] shadow-xl py-1">
                {jumpMatches.map((m) => (
                  <button
                    key={m.node.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (!layout.byId.has(m.node.id)) {
                        onToggleFocal(m.node.id);
                      }
                      centerOnNode(m.node.id);
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-slate-800/80 flex items-center justify-between gap-2 text-xs cursor-pointer"
                  >
                    <span className="font-mono text-slate-100 truncate">{m.node.name}</span>
                    <span className="text-[11px] text-slate-400 shrink-0 truncate max-w-[110px]">
                      {m.node.filePath.split('/').pop()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => zoomAroundViewportCenter(-0.15)}
            aria-label={t.graph.zoomOutAria}
            className="p-1.5 rounded border border-slate-800 bg-[#111827] hover:bg-slate-800 text-slate-300 cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="w-11 text-center text-xs font-mono tabular-nums text-slate-300">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => zoomAroundViewportCenter(0.15)}
            aria-label={t.graph.zoomInAria}
            className="p-1.5 rounded border border-slate-800 bg-[#111827] hover:bg-slate-800 text-slate-300 cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={fitGraphToViewport}
            className="ml-1 px-2.5 py-1.5 text-xs border border-slate-800 bg-[#111827] hover:bg-slate-800 text-slate-300 rounded flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Maximize2 className="w-3 h-3" />
            {t.graph.autoFit}
          </button>
        </div>
      </div>
      )}

      {/* Interactive SVG Canvas */}
      <div ref={containerRef} className="relative flex-1 min-h-0 overflow-hidden select-none">
        {layout.positioned.length === 0 ? (
          fileCount === 0 ? (
            <div className="h-full flex items-center justify-center p-6">
              <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-[#111827] p-6 text-center space-y-4">
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-slate-100">
                    {t.graph.emptyTitle}
                  </p>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t.graph.emptyDesc}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={onImportFolder || onOpenImport}
                    className="px-3.5 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    {t.graph.emptyPickFolderBtn}
                  </button>
                  <button
                    type="button"
                    onClick={onImportFiles || onOpenImport}
                    className="px-3.5 py-2 text-xs font-medium bg-[#0B0F17] border border-slate-700 hover:border-slate-500 text-slate-200 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <FilePlus2 className="w-3.5 h-3.5 text-sky-400" />
                    {t.graph.emptyPickFilesBtn}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenPaste || onOpenImport}
                    className="px-3.5 py-2 text-xs font-medium bg-[#0B0F17] border border-slate-700 hover:border-slate-500 text-slate-200 rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    {t.graph.emptyPasteBtn}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-medium text-slate-200">
                {t.graph.emptyNoConnectedTitle}
              </p>
              <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                {t.graph.emptyNoConnectedDesc}
              </p>
              {onlyConnected && nodePlans.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOnlyConnected(false)}
                  className="mt-1 px-4 py-2 text-xs font-semibold bg-[#111827] border border-slate-700 hover:border-sky-500/60 text-sky-300 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  {t.graph.emptyShowAllBtn(nodePlans.length)}
                </button>
              )}
            </div>
          )
        ) : (
          <svg
            className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <defs>
              <pattern id="ide-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path
                  d="M 24 0 L 0 0 0 24"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.05)"
                  strokeWidth="1"
                />
              </pattern>
              <marker
                id="arrow-muted"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="rgba(148, 163, 184, 0.45)" />
              </marker>
              <marker
                id="arrow-active"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#38BDF8" />
              </marker>
            </defs>

            <rect width="100%" height="100%" fill="url(#ide-grid)" />

            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Column Role Headers */}
              {layout.columnHeaders.map((col) => (
                <text
                  key={col.role}
                  x={col.x}
                  y={22}
                  fill={col.role === 'focal' ? '#38BDF8' : '#94A3B8'}
                  fontSize={11.5}
                  fontWeight={600}
                  fontFamily="DM Sans, sans-serif"
                >
                  {`${t.graph.roleHeader[col.role]} (${col.count})`}
                </text>
              ))}

              {/* Directional Edges */}
              {edges.map((edge) => {
                const src = layout.byId.get(edge.sourceNodeId);
                const dst = layout.byId.get(edge.targetNodeId);
                if (!src || !dst) return null;

                const isHighlighted =
                  activeHighlightId !== null &&
                  (edge.sourceNodeId === activeHighlightId || edge.targetNodeId === activeHighlightId);

                const x1 = src.x + src.width;
                const y1 = src.y + src.height / 2;
                const x2 = dst.x;
                const y2 = dst.y + dst.height / 2;

                const sameCol = Math.abs(src.x - dst.x) < 10;
                const dx = sameCol ? 52 : Math.max(44, Math.abs(x2 - x1) * 0.45);
                const pathD = sameCol
                  ? `M ${src.x + src.width} ${y1} C ${src.x + src.width + dx} ${y1}, ${dst.x + dst.width + dx} ${y2}, ${dst.x + dst.width} ${y2}`
                  : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                return (
                  <path
                    key={edge.id}
                    d={pathD}
                    fill="none"
                    stroke={
                      isHighlighted
                        ? '#38BDF8'
                        : edge.kind === 'intra-file'
                          ? 'rgba(167, 139, 250, 0.25)'
                          : 'rgba(148, 163, 184, 0.24)'
                    }
                    strokeWidth={isHighlighted ? 2 : 1.25}
                    strokeDasharray={edge.kind === 'intra-file' ? '4 3' : undefined}
                    markerEnd={isHighlighted ? 'url(#arrow-active)' : 'url(#arrow-muted)'}
                    style={{ transition: 'stroke 150ms ease, stroke-width 150ms ease' }}
                  />
                );
              })}

              {/* Symbol Node Cards */}
              {layout.positioned.map(({ plan, x, y, width, height, role }) => {
                const isSelected = plan.node.id === selectedNodeId;
                const isAutoExpanded = Boolean(plan.autoExpanded);
                const isManualOverride = plan.override !== 'auto';
                const complexity = plan.complexityScore ?? 0;
                const isHighComplexity = complexity >= 46;

                const isConnected =
                  activeHighlightId !== null &&
                  edges.some(
                    (e) =>
                      (e.sourceNodeId === activeHighlightId && e.targetNodeId === plan.node.id) ||
                      (e.targetNodeId === activeHighlightId && e.sourceNodeId === plan.node.id),
                  );

                const statusBorderColor = isAutoExpanded
                  ? '#34D399'
                  : isManualOverride
                    ? '#A78BFA'
                    : isHighComplexity
                      ? '#F97316'
                      : TIER_STROKE[plan.tier];

                const strokeColor = isSelected ? '#38BDF8' : statusBorderColor;
                const leftStripeColor = isAutoExpanded
                  ? '#10B981'
                  : isManualOverride
                    ? '#A78BFA'
                    : isHighComplexity
                      ? '#F97316'
                      : plan.isFocal
                        ? '#38BDF8'
                        : TIER_STROKE[plan.tier];

                const opacity =
                  activeHighlightId && !isSelected && !isConnected && plan.node.id !== activeHighlightId
                    ? 0.55
                    : plan.tier === 'excluded' && !isManualOverride
                      ? 0.62
                      : 1;

                // Build compact top-right status chips
                const statusBadges: Array<{ text: string; bg: string; fg: string; stroke: string; w: number }> = [];
                if (isAutoExpanded) {
                  statusBadges.push({
                    text: t.graph.badgeAutoExpanded,
                    bg: '#064E3B',
                    fg: '#6EE7B7',
                    stroke: '#10B981',
                    w: locale === 'en' ? 56 : 44,
                  });
                } else if (isManualOverride) {
                  statusBadges.push({
                    text: t.graph.badgeManual,
                    bg: '#2E1065',
                    fg: '#DDD6FE',
                    stroke: '#8B5CF6',
                    w: locale === 'en' ? 48 : 34,
                  });
                }
                if (isHighComplexity) {
                  statusBadges.push({
                    text: t.graph.badgeHighComplexity,
                    bg: '#431407',
                    fg: '#FDBA74',
                    stroke: '#F97316',
                    w: locale === 'en' ? 54 : 44,
                  });
                }

                const badgesTotalW = statusBadges.reduce((acc, b, idx) => acc + b.w + (idx > 0 ? 4 : 0), 0);
                const maxNameChars = badgesTotalW > 0 ? (badgesTotalW > 75 ? 12 : badgesTotalW > 48 ? 15 : 17) : 24;
                const displayName =
                  plan.node.name.length > maxNameChars
                    ? plan.node.name.slice(0, maxNameChars - 1) + '…'
                    : plan.node.name;

                let nextBadgeRight = width - 10;

                return (
                  <g
                    key={plan.node.id}
                    data-graph-node="true"
                    transform={`translate(${x}, ${y})`}
                    onClick={() => onSelectNode(plan.node.id)}
                    onDoubleClick={() => onToggleFocal(plan.node.id)}
                    onMouseEnter={() => setHoveredNodeId(plan.node.id)}
                    onMouseLeave={() => setHoveredNodeId(null)}
                    className="cursor-pointer"
                    style={{ opacity, transition: 'opacity 150ms ease' }}
                  >
                    <title>
                      {`${plan.node.name} (${plan.node.filePath}:${plan.node.startLine}-${plan.node.endLine})\n${t.graph.tooltipLayer}${t.graph.tierText[plan.tier]}${isAutoExpanded ? t.graph.tooltipAutoExpanded : ''}${isManualOverride ? t.graph.tooltipManual : ''}${isHighComplexity ? t.graph.tooltipHighComplexity(complexity) : ''}\nToken: ${plan.injectedTokens}/${plan.node.rawTokens}`}
                    </title>

                    {/* Outer halo for auto-expanded or high-complexity nodes when selected */}
                    {(isAutoExpanded || isHighComplexity) && (
                      <rect
                        x={-2.5}
                        y={-2.5}
                        width={width + 5}
                        height={height + 5}
                        rx={10}
                        fill="none"
                        stroke={isAutoExpanded ? 'rgba(52, 211, 153, 0.28)' : 'rgba(249, 115, 22, 0.28)'}
                        strokeWidth={1.5}
                      />
                    )}

                    <rect
                      width={width}
                      height={height}
                      rx={8}
                      fill={isSelected ? '#162235' : '#111827'}
                      stroke={strokeColor}
                      strokeWidth={isSelected || plan.isFocal || isAutoExpanded || isManualOverride || isHighComplexity ? 1.75 : 1}
                      strokeDasharray={isManualOverride && !isSelected ? '5 2.5' : undefined}
                    />

                    {/* Left vertical status accent bar */}
                    <rect
                      x={2}
                      y={7}
                      width={3.5}
                      height={height - 14}
                      rx={1.75}
                      fill={leftStripeColor}
                    />

                    {/* Top-right status chips */}
                    {statusBadges.map((b) => {
                      const bx = nextBadgeRight - b.w;
                      nextBadgeRight = bx - 4;
                      return (
                        <g key={b.text} transform={`translate(${bx}, 9)`}>
                          <rect
                            width={b.w}
                            height={16}
                            rx={4}
                            fill={b.bg}
                            stroke={b.stroke}
                            strokeWidth={0.8}
                          />
                          <text
                            x={b.w / 2}
                            y={11.5}
                            textAnchor="middle"
                            fill={b.fg}
                            fontSize={9.5}
                            fontWeight={600}
                            fontFamily="DM Sans, sans-serif"
                          >
                            {b.text}
                          </text>
                        </g>
                      );
                    })}

                    <text
                      x={12}
                      y={22}
                      fill="#F1F5F9"
                      fontSize={12}
                      fontWeight={600}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {displayName}
                    </text>

                    <text
                      x={12}
                      y={42}
                      fill="#94A3B8"
                      fontSize={10.5}
                      fontFamily="DM Sans, sans-serif"
                    >
                      {`${plan.node.filePath.split('/').pop()}:${plan.node.startLine}-${plan.node.endLine}`}
                    </text>

                    <text
                      x={12}
                      y={66}
                      fill={isAutoExpanded ? '#34D399' : isManualOverride ? '#C4B5FD' : strokeColor}
                      fontSize={10.5}
                      fontWeight={500}
                      fontFamily="DM Sans, sans-serif"
                    >
                      {`${t.graph.roleShort[role]} · ${isAutoExpanded ? t.graph.autoCompleted : t.graph.tierText[plan.tier]}`}
                    </text>

                    <text
                      x={width - 10}
                      y={66}
                      textAnchor="end"
                      fill="#CBD5E1"
                      fontSize={10.5}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {`${plan.injectedTokens}/${plan.node.rawTokens} tk`}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        {/* Status Color & Border Legend Overlay */}
        {layout.positioned.length > 0 && (
          <div className="absolute bottom-3 left-3 z-20 rounded-md border border-slate-700/80 bg-[#0E1420]/95 px-3 py-2 shadow-xl backdrop-blur-sm flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-[2px] border-[1.5px] border-sky-400 bg-sky-500/15" />
              {t.graph.legendFocal}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-[2px] border-[1.5px] border-emerald-400 bg-emerald-500/15" />
              {t.graph.legendExpanded(statusSummary.autoExpandedCount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-[2px] border-[1.5px] border-dashed border-violet-400 bg-violet-500/15" />
              {t.graph.legendManual(statusSummary.manualOverrideCount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-[2px] border-[1.5px] border-orange-500 bg-orange-500/15" />
              {t.graph.legendComplexity(statusSummary.highComplexityCount)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-[2px] border-[1.5px] border-amber-400 bg-amber-400/10" />
              {t.graph.legendSkeleton}
            </span>
          </div>
        )}

        {/* Interactive Viewport Minimap Overlay */}
        {layout.positioned.length > 0 && minimap && (
          <div className="absolute bottom-3 right-3 z-20 rounded-md border border-slate-700/80 bg-[#0E1420]/95 shadow-xl backdrop-blur-sm overflow-hidden">
            {minimapOpen ? (
              <div className="flex flex-col">
                <div className="px-2.5 py-1 border-b border-slate-800/90 flex items-center justify-between gap-2 text-[10.5px] text-slate-400">
                  <span className="font-medium text-slate-300">{t.graph.minimapTitle}</span>
                  <button
                    type="button"
                    onClick={() => setMinimapOpen(false)}
                    aria-label={t.graph.minimapCloseAria}
                    className="p-0.5 text-slate-400 hover:text-slate-100 cursor-pointer"
                  >
                    <Minimize2 className="w-3 h-3" />
                  </button>
                </div>
                <svg
                  ref={minimapSvgRef}
                  width={MINIMAP_W}
                  height={MINIMAP_H}
                  className="block cursor-crosshair bg-[#090D14]"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    minimapDragRef.current = true;
                    panToMinimapClientPoint(e.clientX, e.clientY);
                  }}
                  onPointerMove={(e) => {
                    if (!minimapDragRef.current) return;
                    panToMinimapClientPoint(e.clientX, e.clientY);
                  }}
                  onPointerUp={(e) => {
                    minimapDragRef.current = false;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  }}
                  onPointerCancel={() => {
                    minimapDragRef.current = false;
                  }}
                >
                  {/* Miniature edges */}
                  {edges.map((edge) => {
                    const src = layout.byId.get(edge.sourceNodeId);
                    const dst = layout.byId.get(edge.targetNodeId);
                    if (!src || !dst) return null;
                    const x1 = minimap.offsetX + (src.x + src.width / 2 - minimap.minX) * minimap.scale;
                    const y1 = minimap.offsetY + (src.y + src.height / 2 - minimap.minY) * minimap.scale;
                    const x2 = minimap.offsetX + (dst.x + dst.width / 2 - minimap.minX) * minimap.scale;
                    const y2 = minimap.offsetY + (dst.y + dst.height / 2 - minimap.minY) * minimap.scale;
                    return (
                      <line
                        key={`mm-${edge.id}`}
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="rgba(148, 163, 184, 0.22)"
                        strokeWidth={0.75}
                      />
                    );
                  })}

                  {/* Miniature node blocks */}
                  {layout.positioned.map(({ plan, x, y, width, height }) => {
                    const isSelected = plan.node.id === selectedNodeId;
                    return (
                      <rect
                        key={`mm-node-${plan.node.id}`}
                        x={minimap.offsetX + (x - minimap.minX) * minimap.scale}
                        y={minimap.offsetY + (y - minimap.minY) * minimap.scale}
                        width={Math.max(3, width * minimap.scale)}
                        height={Math.max(2, height * minimap.scale)}
                        rx={1}
                        fill={isSelected || plan.isFocal ? '#38BDF8' : TIER_STROKE[plan.tier]}
                        fillOpacity={plan.tier === 'excluded' ? 0.35 : 0.8}
                      />
                    );
                  })}

                  {/* Live Viewport Rectangle */}
                  <rect
                    x={minimap.viewRect.x}
                    y={minimap.viewRect.y}
                    width={minimap.viewRect.width}
                    height={minimap.viewRect.height}
                    rx={2}
                    fill="rgba(56, 189, 248, 0.12)"
                    stroke="#38BDF8"
                    strokeWidth={1.25}
                  />
                </svg>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setMinimapOpen(true)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
              >
                <MapIcon className="w-3.5 h-3.5 text-sky-400" />
                {t.graph.minimapOpen}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bottom Selected Node Quick Action Inspector */}
      {selectedPlan && (
        <div className="px-5 py-3 border-t border-slate-800/80 bg-[#111827] flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-slate-100">
                {selectedPlan.node.name}
              </span>
              {selectedPlan.autoExpanded && (
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-[10.5px] font-medium text-emerald-300">
                  {t.graph.inspectorAutoExpanded}
                </span>
              )}
              {selectedPlan.override !== 'auto' && (
                <span className="px-1.5 py-0.5 rounded bg-violet-500/15 border border-violet-500/40 text-[10.5px] font-medium text-violet-300">
                  {t.graph.inspectorManual}
                </span>
              )}
              {(selectedPlan.complexityScore ?? 0) >= 46 && (
                <span className="px-1.5 py-0.5 rounded bg-orange-500/15 border border-orange-500/40 text-[10.5px] font-medium text-orange-300">
                  {t.graph.inspectorComplexity(selectedPlan.complexityScore ?? 0)}
                </span>
              )}
              <span className="text-slate-500">·</span>
              <span className="font-mono text-slate-400">
                {selectedPlan.node.filePath}:{selectedPlan.node.startLine}-{selectedPlan.node.endLine}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-300">{selectedPlan.reason}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleFocal(selectedPlan.node.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                selectedPlan.isFocal
                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                  : 'bg-[#0B0F17] border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              {selectedPlan.isFocal ? t.graph.removeFocal : t.graph.setFocal}
            </button>

            <div className="flex items-center p-0.5 bg-[#0B0F17] border border-slate-800 rounded">
              {(['auto', 'full', 'skeleton', 'exclude'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSetOverride(selectedPlan.node.id, mode)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors cursor-pointer whitespace-nowrap ${
                    selectedPlan.override === mode
                      ? 'bg-slate-800 text-sky-300 font-medium'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t.graph.overrideMode[mode]}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onInspectDiff(selectedPlan.node.id)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 rounded transition-colors cursor-pointer whitespace-nowrap"
            >
              {t.graph.inspectDiff}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
